/**
 * Normalize an import specifier to the package name npm installs.
 * Import specifiers can include subpaths, but dependency installation needs the
 * root package name.
 *
 * @param {string} specifier
 * @returns {string}
 */
export function getPackageNameFromSpecifier(specifier) {
    if (specifier.startsWith('@')) {
        return specifier.split('/').slice(0, 2).join('/');
    }

    return specifier.split('/')[0];
}
