import {
    mkdir,
    mkdtemp,
    rm,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createDirectorySnapshot } from './createDirectorySnapshot.js';
import { downloadDevcontainerFeatureFromRegistry } from './downloadDevcontainerFeatureFromRegistry.js';
import { extractTarball } from './extractTarball.js';
import { getFileSha256 } from './getFileSha256.js';
import { spawnAsync } from './spawnAsync.js';

/**
 * Compare a staged publish candidate against the latest published version on GHCR.
 *
 * @param {object} params
 * @param {string | null} params.latestPublishedVersion Version string or null.
 * @param {string} params.packageName The container package name.
 * @param {string} params.stageDir The candidate feature staging directory path.
 * @param {string} params.apiToken GitHub token for authenticating to GHCR.
 * @returns {Promise<{ hasChanged: boolean, reason: string }>} Comparison result.
 */
export async function hasDevcontainerFeatureChanged({
    apiToken,
    latestPublishedVersion,
    packageName,
    stageDir,
}) {
    // If the Feature has never been published before, it must be published.
    if (latestPublishedVersion === null) {
        return {
            hasChanged: true,
            reason:     'no published devcontainer feature version is available for comparison',
        };
    }

    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'has-devcontainer-feature-changed'));

    try {
        // Acquire candidate and published tarballs.
        const [candidateTarballPath, publishedTarballPath] = await Promise.all([
            // Package the local candidate feature using `@devcontainers/cli`.
            (async () => {
                const candidatePackDir = path.join(tempRoot, 'candidate-pack');
                // The CLI will fail if the output directory already exists, so we pass `-f` and do not pre-create it.
                await spawnAsync(
                    'npx',
                    [
                        '-y',
                        '@devcontainers/cli',
                        'features',
                        'package',
                        stageDir,
                        '-o',
                        candidatePackDir,
                        '-f',
                    ],
                    { env: process.env },
                );
                const featureId = path.basename(stageDir);
                return path.join(candidatePackDir, `devcontainer-feature-${featureId}.tgz`);
            })(),
            // Download the published tarball.
            (async () => {
                const publishedPackDir = path.join(tempRoot, 'published-pack');
                await mkdir(publishedPackDir, { recursive: true });
                return downloadDevcontainerFeatureFromRegistry(packageName, latestPublishedVersion, publishedPackDir, apiToken);
            })(),
        ]);

        // Matching tarball digests let us skip extraction entirely.
        const [candidateDigest, publishedDigest] = await Promise.all([
            getFileSha256(candidateTarballPath),
            getFileSha256(publishedTarballPath),
        ]);
        if (candidateDigest === publishedDigest) {
            return {
                hasChanged: false,
                reason:     'tarball digests match',
            };
        }

        // Even if digests differ, extract and compare directory content snapshots.
        // The snapshots include file modes/permissions and content hashes.
        const [candidateSnapshot, publishedSnapshot] = await Promise.all([
            (async () => {
                const candidateExtractDir = path.join(tempRoot, 'candidate-extract');
                await extractTarball({
                    outDir:      candidateExtractDir,
                    tarballPath: candidateTarballPath,
                });
                return createDirectorySnapshot(candidateExtractDir);
            })(),
            (async () => {
                const publishedExtractDir = path.join(tempRoot, 'published-extract');
                await extractTarball({
                    outDir:      publishedExtractDir,
                    tarballPath: publishedTarballPath,
                });
                return createDirectorySnapshot(publishedExtractDir);
            })(),
        ]);
        return (candidateSnapshot === publishedSnapshot)
            ? {
                hasChanged: false,
                reason:     'extracted feature contents match the published version',
            }
            : {
                hasChanged: true,
                reason:     'extracted feature contents differ from the published version',
            };
    }
    // If comparison fails due to errors (e.g. registry 404 or tar error), assume it changed to be safe.
    catch (err) {
        return {
            hasChanged: true,
            reason:     `error checking published version: ${String(err instanceof Error ? (err.message ?? err) : err)}`,
        };
    }
    // Cleanup
    finally {
        await rm(tempRoot, { force: true, recursive: true });
    }
}
