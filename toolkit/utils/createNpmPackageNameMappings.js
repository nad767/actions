import path from 'node:path';

import { readJsonAsync } from './readJsonAsync.js';
import { rewriteNpmPackageName } from './rewriteNpmPackageName.js';

/**
 * Build a mapping from original workspace package names to their rewritten published names for a specific registry.
 *
 * Motivation: Internal cross-package dependency specifiers and manifest dependencies must point to the rewritten
 * package names specific to the target registry (e.g. GitHub Packages or npmjs).
 *
 * @param {object} options
 * @param {string} [options.defaultScope] Optional fallback scope for the registry.
 * @param {string} options.registryName Target registry name (e.g. 'ghp' or 'npmjs').
 * @param {Array<{ ghpName?: string, ghpScope?: string, npmjsName?: string, npmjsScope?: string, path: string }>} options.targets
 * @param {string} [options.wsPath] Root workspace path.
 * @returns {Promise<Map<string, string>>} Mapping from original package name to rewritten published name.
 */
export async function createNpmPackageNameMappings({
    defaultScope,
    registryName,
    targets,
    wsPath = process.env.GITHUB_WORKSPACE ?? process.cwd(),
}) {
    const entries = await Promise.all(
        targets.map(async targetConfig => {
            const pkgManifestPath = path.join(wsPath, targetConfig.path, 'package.json');
            const manifest = await readJsonAsync(pkgManifestPath);
            const rewrittenName = rewriteNpmPackageName(
                manifest.name,
                {
                    defaultScope,
                    registryName,
                    targetConfig,
                },
            );
            return [manifest.name, rewrittenName];
        }),
    );

    return new Map(entries);
}
