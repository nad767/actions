/**
 * Collect dependency specifiers that must stay external in the published build.
 *
 * Motivation: package consumers should resolve runtime dependencies from their
 * own installs instead of receiving them bundled into these library packages.
 *
 * @param {{ dependencies?: Record<string, string>, optionalDependencies?: Record<string, string>, peerDependencies?: Record<string, string> }} manifest
 * @returns {string[]}
 */
export function collectDeps(manifest) {
    return [
        ...new Set([
            ...Object.keys(manifest.dependencies ?? {}),
            ...Object.keys(manifest.optionalDependencies ?? {}),
            ...Object.keys(manifest.peerDependencies ?? {}),
        ]),
    ];
}
