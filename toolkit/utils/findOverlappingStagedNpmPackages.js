import semver from 'semver';

/**
 * Filter a list of staged package records for those overlapping the specified package name and version.
 *
 * @param {Array<Record<string, any>>} stagedPackages
 * @param {string} packageName
 * @param {string} version
 * @returns {Array<Record<string, any>>}
 */
export function findOverlappingStagedNpmPackages(stagedPackages, packageName, version) {
    if (!Array.isArray(stagedPackages)) return [];
    return stagedPackages.filter(item => {
        if (!item || (typeof item !== 'object')) return false;
        const itemPkg = item.packageName ?? item.package ?? item.name;
        const isSamePkg = !itemPkg || (itemPkg === packageName);
        const isSameVersion = (item.version === version)
            || (Boolean(semver.valid(item.version)) && Boolean(semver.valid(version)) && semver.eq(item.version, version));
        return isSamePkg && isSameVersion;
    });
}
