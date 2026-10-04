/**
 * Rewrite dependency keys that point at publishable workspace packages.
 * This keeps internal package links valid after the publish flow renames package scopes for GitHub Packages.
 *
 * @param {Record<string, string> | undefined} dependencyMap
 * @param {Map<string, string>} renamedPackages
 * @returns {Record<string, string> | undefined}
 */
export function rewriteNpmDependencyMap(dependencyMap, renamedPackages) {
    if (!dependencyMap) return dependencyMap;

    return Object.fromEntries(
        Object.entries(dependencyMap).map(([dependencyName, versionRange]) => [
            renamedPackages.get(dependencyName) ?? dependencyName,
            versionRange,
        ]),
    );
}
