import path from 'node:path';

/**
 * Resolve a local ESM import specifier relative to the importing module.
 *
 * @param {string} importerPath
 * @param {string} specifier
 * @returns {string}
 */
export function resolveLocalImportPath(importerPath, specifier) {
    return specifier.startsWith('/')
        ? specifier
        : path.resolve(path.dirname(importerPath), specifier);
}
