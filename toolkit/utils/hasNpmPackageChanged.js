import {
    mkdir,
    mkdtemp,
    rm,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createDirectorySnapshot } from './createDirectorySnapshot.js';
import { extractTarball } from './extractTarball.js';
import { packNpmPackage } from './packNpmPackage.js';

/**
 * Compare a staged publish artifact against the latest published package contents.
 *
 * Motivation: Repacking the candidate package and comparing digests and extracted contents against the existing registry tarball accurately determines whether build outputs have changed.
 *
 * @param {object} options
 * @param {string | null} options.latestPublishedVersion Highest published semver version currently on the registry, or null if unpublished.
 * @param {string} options.publishedName Target published package name for the registry.
 * @param {import('./npmRegistries.js').NpmRegistryEntry} [options.registryEntry] Target registry configuration entry.
 * @param {string} options.stageDir Path to the staged package directory.
 * @returns {Promise<{ hasChanged: boolean, reason: string }>}
 */
export async function hasNpmPackageChanged({
    latestPublishedVersion,
    publishedName,
    registryEntry,
    stageDir,
}) {
    // If the Package has never been published before, it must be published.
    if (latestPublishedVersion === null) {
        return {
            hasChanged: true,
            reason:     'no published npm version is available for comparison',
        };
    }

    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'has-npm-package-changed'));

    try {
        // Create both comparison artifacts with `npm pack`.
        // Previously both `npm pack` ran in parallel using `Promise.all()`, but that caused race conditions when patching the project `.npmrc` (see `spawnAuthNpmAsync()` for details). So now we run them sequentially.
        const candidatePackDir = path.join(tempRoot, 'candidate-pack');
        await mkdir(candidatePackDir, { recursive: true });
        // Packs the package from `stageDir` into a tarball in `candidatePackDir`.
        const candidatePackResult = await packNpmPackage({
            cwd:    stageDir,
            outDir: candidatePackDir,
        });

        const publishedPackDir = path.join(tempRoot, 'published-pack');
        await mkdir(publishedPackDir, { recursive: true });
        // Does NOT actually repack, but rather downloads the `publishedName@latestPublishedVersion` tarball from `registryEntry.url` and saves it to `publishedPackDir`.
        const publishedPackResult = await packNpmPackage({
            cwd:        stageDir,
            outDir:     publishedPackDir,
            packTarget: `${publishedName}@${latestPublishedVersion}`,
            registryEntry,
        });

        // Matching tarball shasums/integrities (digests) let us skip extraction entirely.
        if (
            (candidatePackResult.integrity !== null)
            && (candidatePackResult.integrity === publishedPackResult.integrity)
        ) {
            return {
                hasChanged: false,
                reason:     'tarball integrities match',
            };
        }

        if (
            (candidatePackResult.integrity === null)
            && (publishedPackResult.integrity === null)
            && (candidatePackResult.shasum !== null)
            && (candidatePackResult.shasum === publishedPackResult.shasum)
        ) {
            return {
                hasChanged: false,
                reason:     'tarball shasums match',
            };
        }

        // Even if tarball shasums/integrities differ, we still compare their contents.
        // That's because tarball bytes (and thus shasums/integrities) may differ for reasons other than content differences (e.g. different npm versions, gzip versions, tar container differences, etc.).
        const [candidateSnapshot, publishedSnapshot] = await Promise.all([
            (async () => {
                const candidateExtractDir = path.join(tempRoot, 'candidate-extract');
                await extractTarball({
                    outDir:      candidateExtractDir,
                    tarballPath: candidatePackResult.tarballPath,
                });
                return createDirectorySnapshot(path.join(candidateExtractDir, 'package'));
            })(),
            (async () => {
                const publishedExtractDir = path.join(tempRoot, 'published-extract');
                await extractTarball({
                    outDir:      publishedExtractDir,
                    tarballPath: publishedPackResult.tarballPath,
                });
                return createDirectorySnapshot(path.join(publishedExtractDir, 'package'));
            })(),
        ]);
        return (candidateSnapshot === publishedSnapshot)
            ? {
                hasChanged: false,
                reason:     'extracted package contents match',
            }
            : {
                hasChanged: true,
                reason:     'tarball integrities & tarball shasums & sha256 of extracted package contents all differ',
            };
    }
    // Cleanup
    finally {
        await rm(tempRoot, { force: true, recursive: true });
    }
}
