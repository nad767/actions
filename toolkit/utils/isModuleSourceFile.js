/**
 * Detect source files that should go through the module build.
 *
 * Motivation: JavaScript and JSX need transpilation to publish-ready ESM while other files can be copied directly.
 *
 * @param {string} relativePath
 * @returns {boolean}
 */
export function isModuleSourceFile(relativePath) {
    return relativePath.endsWith('.js') || relativePath.endsWith('.jsx');
}
