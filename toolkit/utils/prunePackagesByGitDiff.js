import { getHighestSemverVersion } from './getHighestSemverVersion.js';
import { isGitShaValid } from './isGitShaValid.js';

/**
 * Prune packages or features by checking their registry-published versions against Git differences.
 *
 * This utility iterates through packages and checks:
 * 1. Fetch published versions from registry.
 * 2. Find highest prior version (or current version if already published).
 * 3. Fetch Git commit SHA associated with the comparison version.
 * 4. Verify the Git commit SHA is valid locally.
 * 5. Run a package-specific git changes check (e.g. `pkg.hasGitChanges`).
 *
 * @template T
 * @param {object} options
 * @param {Array<T>} options.packages Array of package definitions.
 * @param {string} options.wsPath Absolute path to workspace root.
 * @returns {Promise<Array<T>>} Array of selected packages that have changed or are not published yet.
 */
export async function prunePackagesByGitDiff({ packages, wsPath }) {
    const selected = [];

    // Unified execution flow for registry-driven git diff pruning.
    // Note: Array.prototype.filter() is synchronous and cannot await asynchronous callbacks.
    for (const pkg of packages) {
        // Fetch published versions of this package/feature from the registry.
        const publishedVersions = await pkg.fetchVersions(pkg.packageName);
        const highestPublishedVersion = getHighestSemverVersion(publishedVersions);

        // Check if the current workspace version is already published.
        const isCurrentVersionPublished = publishedVersions.includes(pkg.version);
        const versionToCompare = isCurrentVersionPublished ? pkg.version : highestPublishedVersion;

        // If no prior or current version exists on the registry, this is a first-time publish.
        if (!versionToCompare) {
            console.log(`Selecting \`${pkg.displayName}\`; no previous published version exists on the registry.`);
            selected.push(pkg);
            continue;
        }

        // Retrieve the commit SHA associated with the comparison version.
        const gitHead = await pkg.fetchGitHead(pkg.packageName, versionToCompare);

        // If the registry version does not have associated Git metadata, select it for publishing.
        if (!gitHead) {
            console.log(`Selecting \`${pkg.displayName}\`; no \`gitHead\` metadata found for version ${versionToCompare} in the registry.`);
            selected.push(pkg);
            continue;
        }

        // Verify that the commit SHA exists locally in the clone.
        if (!isGitShaValid(wsPath, gitHead)) {
            console.log(`Selecting \`${pkg.displayName}\`; commit ${gitHead} is missing locally (cannot perform diff).`);
            selected.push(pkg);
            continue;
        }

        // Check whether the package's tracked files changed since the target Git ref.
        const hasChanges = pkg.hasGitChanges(gitHead, pkg.trackedPaths);

        if (hasChanges) {
            if (isCurrentVersionPublished) {
                console.log(`Selecting \`${pkg.displayName}\`; tracked files changed since the published version ${versionToCompare}, version conflict resolution may be required.`);
            }
            else {
                console.log(`Selecting \`${pkg.displayName}\`; tracked files changed since the highest prior version ${versionToCompare}.`);
            }
            selected.push(pkg);
            continue;
        }

        console.log(`Skipping \`${pkg.displayName}\`; tracked files match the published version ${versionToCompare} (${gitHead}).`);
    }

    return selected;
}
