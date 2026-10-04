import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { readJsonAsync } from './readJsonAsync.js';

/**
 * Rewrite package manifests and the root lockfile with the resolved versions.
 *
 * Supports both standalone packages (at the root or in a subdirectory) and monorepo workspace packages.
 *
 * Motivation: if the workflow bumps versions automatically, the committed
 * branch state should reflect the exact versions that will be published.
 *
 * @param {Array<{ headVersion: string, manifest: Record<string, any>, manifestPath: string, nextVersion: string, pkgDir: string }>} resolutions
 * @returns {Promise<void>}
 */
export async function writeResolvedNpmVersions(resolutions) {
    // `GITHUB_WORKSPACE` injected automatically by GitHub Actions.
    const wsPath = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const rootLockfilePath = path.join(wsPath, 'package-lock.json');
    // Load root lockfile if present; gracefully ignore if the repo does not commit one.
    const rootLockfileContents = await readJsonAsync(rootLockfilePath).catch(err => {
        if ((err?.cause?.code === 'ENOENT') || (err?.code === 'ENOENT')) return null;
        throw err;
    });
    let hasChanges = false;

    for (const resolution of resolutions) {
        // Skip packages that did not require a version bump.
        if (resolution.headVersion === resolution.nextVersion) continue;

        // 1. Update the package's own manifest.
        resolution.manifest.version = resolution.nextVersion;
        await writeFile(resolution.manifestPath, `${JSON.stringify(resolution.manifest, null, 4)}\n`);

        // 2. Synchronize versions in `package-lock.json` if available.
        if (!rootLockfileContents) continue;

        const lockfileKey = (resolution.pkgDir === '.' || !resolution.pkgDir) ? '' : resolution.pkgDir;

        // Standalone packages at root track version at the lockfile top level (v1, v2, v3).
        if (lockfileKey === '' && Object.hasOwn(rootLockfileContents, 'version')) {
            rootLockfileContents.version = resolution.nextVersion;
            hasChanges = true;
        }

        // Modern lockfiles (v2/v3) track workspace packages in `packages`.
        if (!rootLockfileContents.packages) continue;

        // Root package is keyed by "" in lockfile packages map; workspace packages use relative paths.
        const targetEntry = rootLockfileContents.packages[lockfileKey];
        if (targetEntry) {
            targetEntry.version = resolution.nextVersion;
            hasChanges = true;
        }

        // In monorepos, also update the symlinked `node_modules` entry to avoid `npm ci` mismatches.
        const resolutionManifestName = resolution.manifest?.name;
        if (resolutionManifestName) {
            const nodeModulesKey = `node_modules/${resolutionManifestName}`;
            const targetEntry = rootLockfileContents.packages[nodeModulesKey];
            if (targetEntry) {
                targetEntry.version = resolution.nextVersion;
                hasChanges = true;
            }
        }
    }

    // 3. Persist updated lockfile if any entries were modified.
    if (!hasChanges) return;

    await writeFile(rootLockfilePath, `${JSON.stringify(rootLockfileContents, null, 4)}\n`);
}
