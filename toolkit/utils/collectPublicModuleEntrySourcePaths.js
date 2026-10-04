import { collectManifestPathValues } from './collectManifestPathValues.js';
import { expandNpmManifestPath } from './expandNpmManifestPath.js';
import { isModuleSourceFile } from './isModuleSourceFile.js';

/**
 * Resolve the package's public JavaScript entrypoints from its manifest.
 *
 * Motivation: feeding Rollup every source module as an entry causes facade entrypoints such as `index.js` to lose their re-exports,
 * so the build must start from the manifest's public entry surface instead.
 *
 * @param {{ exports?: unknown, main?: unknown, module?: unknown }} manifest
 * @param {string[]} publishSourcePaths
 * @returns {string[]}
 */
export function collectPublicModuleEntrySourcePaths(manifest, publishSourcePaths) {
    const manifestPathValues = [
        ...collectManifestPathValues(manifest.exports),
        ...collectManifestPathValues(manifest.main),
        ...collectManifestPathValues(manifest.module),
    ];

    const publicEntrySourcePaths = new Set();

    for (const manifestPathValue of manifestPathValues) {
        const expandedSourcePaths = expandNpmManifestPath(manifestPathValue, publishSourcePaths);

        for (const relativePath of expandedSourcePaths) {
            if (isModuleSourceFile(relativePath)) publicEntrySourcePaths.add(relativePath);
        }
    }

    return [...publicEntrySourcePaths].toSorted();
}
