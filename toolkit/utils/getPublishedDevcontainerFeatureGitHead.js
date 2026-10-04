import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { downloadDevcontainerFeatureFromRegistry } from './downloadDevcontainerFeatureFromRegistry.js';
import { extractTarball } from './extractTarball.js';
import { readJsoncAsync } from './readJsoncAsync.js';

/**
 * Fetch the `gitHead` (commit SHA) of a published Devcontainer Feature version from GHCR.
 *
 * @param {string} packageName
 * @param {string} version
 * @param {string} apiToken
 * @returns {Promise<string | null>}
 */
export async function getPublishedDevcontainerFeatureGitHead(packageName, version, apiToken) {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'get-devcontainer-feature-git-head'));

    try {
        const publishedPackDir = path.join(tempRoot, 'published-pack');

        // Download the published OCI feature tarball from registry
        const tarballPath = await downloadDevcontainerFeatureFromRegistry(packageName, version, publishedPackDir, apiToken);
        const extractDir = path.join(tempRoot, 'extract');

        // Extract the downloaded archive to inspect its contents
        await extractTarball({
            outDir: extractDir,
            tarballPath,
        });

        // The devcontainers packaging schema extracts contents into the root folder.
        // `devcontainer-feature.json` officially supports JSONC (JSON with Comments).
        // Unlike native `JSON` utils, `readJsoncAsync` doesn't throw on JSONC comments.
        const manifestPath = path.join(extractDir, 'devcontainer-feature.json');
        const manifest = await readJsoncAsync(manifestPath).catch(/* noop */);

        return manifest?.gitHead ?? null;
    }
    catch (err) {
        console.debug(new Error(`Error resolving gitHead for ${packageName}@${version}:`, { cause: err }));
        return null;
    }
    // Cleanup temporary directory
    finally {
        await rm(tempRoot, { force: true, recursive: true });
    }
}
