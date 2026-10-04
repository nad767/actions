/**
 * Map one relative manifest path from source layout to published layout.
 *
 * Keeping path rewriting isolated makes publish manifest mutations easier to audit while the entry script stays focused on orchestration.
 *
 * @param {string} value
 * @param {string} buildOutDir
 * @returns {string}
 */
export function rewriteNpmManifestPath(value, buildOutDir) {
    if (!value.startsWith('./')) return value;

    const publishedPath = value
        .replace(/^\.\//u, () => `${buildOutDir}/`)
        .replace(/\.jsx$/u, '.js');

    return `./${publishedPath}`;
}
