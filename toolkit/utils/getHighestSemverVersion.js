import semver from 'semver';

/**
 * Returns the highest valid semver version from the given list of versions, or `null` if there are no valid versions.
 *
 * @param {string[]} versions
 * @returns {string | null}
 */
export function getHighestSemverVersion(versions) {
    if (versions.length === 0) return null;

    return versions
        .filter(v => semver.valid(v))
        .toSorted(semver.compare)
        .at(-1)
        ?? null;
}
