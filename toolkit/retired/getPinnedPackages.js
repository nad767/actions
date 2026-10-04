/**
 * Resolve lockfile-pinned versions for the provided package names.
 * This allows the preflight install flow to stay deterministic without relying
 * on package manifests as npm installation input.
 *
 * @param {{ packages?: Record<string, { version?: string }> }} lockfile
 * @param {string[]} packageNames
 * @returns {string[]}
 */
export function getPinnedPackages(lockfile, packageNames) {
    const lockedPackages = lockfile.packages ?? {};
    const missingPackages = packageNames.filter(packageName => !lockedPackages[`node_modules/${packageName}`]?.version);

    if (missingPackages.length > 0) {
        throw new Error(`Missing lockfile entry for script import(s): ${missingPackages.join(', ')}`);
    }

    return packageNames.map(packageName => `${packageName}@${lockedPackages[`node_modules/${packageName}`].version}`);
}
