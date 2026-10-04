/**
 * Determine whether Rollup should treat an import as external.
 *
 * Motivation: package names may appear either as top-level specifiers or with subpaths such as `react/jsx-runtime`, both of which should remain external.
 *
 * @param {string} specifier
 * @param {string[]} externalPkgNames
 * @returns {boolean}
 */
export function isExternalPackageSpecifier(specifier, externalPkgNames) {
    return externalPkgNames.some(pkgName => (specifier === pkgName) || specifier.startsWith(`${pkgName}/`));
}
