/**
 * Collect string path values from a manifest field that may be nested.
 *
 * Motivation: package `exports` often uses nested condition objects, but the build only needs the concrete path strings they eventually point at.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
export function collectManifestPathValues(value) {
    if (typeof value === 'string') return [value];
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(x => collectManifestPathValues(x));
    if (typeof value !== 'object') return [];

    return Object.values(value).flatMap(x => collectManifestPathValues(x));
}
