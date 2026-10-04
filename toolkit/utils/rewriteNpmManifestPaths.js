import { rewriteNpmManifestPath } from './rewriteNpmManifestPath.js';

/**
 * Rewrite manifest paths to their published `dist` locations.
 *
 * Motivation: publish only mutates the staged copy, so recursive path
 * normalization belongs in a focused utility instead of the entry script.
 *
 * @param {string | Record<string, any> | undefined} value
 * @param {string} buildOutDir
 * @returns {string | Record<string, any> | undefined}
 */
export function rewriteNpmManifestPaths(value, buildOutDir) {
    if (typeof value === 'string') {
        return rewriteNpmManifestPath(value, buildOutDir);
    }

    if (!value || Array.isArray(value)) return value;

    return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [key, rewriteNpmManifestPaths(nestedValue, buildOutDir)]),
    );
}
