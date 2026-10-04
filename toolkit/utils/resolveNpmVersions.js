import path from 'node:path';
import semver from 'semver';

import { getHighestSemverVersion } from './getHighestSemverVersion.js';
import { getPublishedNpmGitHead } from './getPublishedNpmGitHead.js';
import { getPublishedNpmVersions } from './getPublishedNpmVersions.js';
import { hasTrackedPathsChangedSinceGitRef } from './hasTrackedPathsChangedSinceGitRef.js';
import { isGitShaValid } from './isGitShaValid.js';
import { readJsonAsync } from './readJsonAsync.js';
import { rewriteNpmPackageName } from './rewriteNpmPackageName.js';

/**
 * Resolve the next version for every package in `targetPackages` according to the specified conflict resolution policy.
 *
 * When a package targets multiple registries, the highest published version
 * across all of them is used to determine the bump, keeping versions in
 * lockstep.
 *
 * @param {Array<{
 *     ghpName?: string,
 *     ghpScope?: string,
 *     npmjsName?: string,
 *     npmjsScope?: string,
 *     path: string,
 *     registryEntries?: import('./npmRegistries.js').NpmRegistryEntry[],
 * }>} targetPackages
 * @param {string} [ghpScope]
 * @param {'fail' | 'patch' | 'minor' | 'major'} [policy='patch']
 * @returns {Promise<Array<{
 *     headVersion: string,
 *     highestPublishedVersion: string | null,
 *     manifest: Record<string, any>,
 *     manifestPath: string,
 *     nextVersion: string,
 *     pkgDir: string,
 * }>>}
 */
export async function resolveNpmVersions(targetPackages, ghpScope, policy = 'patch') {
    // `GITHUB_WORKSPACE` injected automatically by GitHub Actions.
    const wsPath = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const cleanGhpScope = ghpScope ? ghpScope.replace(/^@/u, '') : undefined;

    const conflicts = [];
    const resolutions = [];

    for (const targetPackage of targetPackages) {
        const { path: pkgDir, registryEntries = [] } = targetPackage;
        const manifestPath = path.join(wsPath, pkgDir, 'package.json');
        const manifestContents = await readJsonAsync(manifestPath);

        const publishedVersionsByRegistry = [];
        for (const registryEntry of registryEntries) {
            const publishedName = rewriteNpmPackageName(manifestContents.name, {
                defaultScope: (registryEntry.name === 'ghp') ? cleanGhpScope : undefined,
                registryName: registryEntry.name,
                targetConfig: targetPackage,
            });
            const versions = await getPublishedNpmVersions(publishedName, registryEntry, wsPath);
            publishedVersionsByRegistry.push(versions);
        }
        const allPublishedVersions = [...new Set(publishedVersionsByRegistry.flat())];

        // Use the highest published version across all targeted registries for lockstep.
        const highestPublishedVersion = getHighestSemverVersion(allPublishedVersions);

        const incrementedPublishableVersion = (highestPublishedVersion === null)
            ? null
            : (policy === 'fail') ? highestPublishedVersion : semver.inc(highestPublishedVersion, policy);
        if ((highestPublishedVersion !== null) && (incrementedPublishableVersion === null)) throw new Error(`Failed to increment version ${highestPublishedVersion} with policy=${policy}.`);

        const headVersion = semver.valid(manifestContents.version);
        if (!headVersion) throw new Error(`Unsupported semver version in ${manifestPath}: ${manifestContents.version}`);

        let shouldRewriteHeadVersion = false;

        if (highestPublishedVersion !== null) {
            if (semver.lt(headVersion, highestPublishedVersion)) {
                // The workspace version is strictly lower than what has already been published across targeted registries.
                shouldRewriteHeadVersion = true;
            }
            else if (semver.eq(headVersion, highestPublishedVersion)) {
                // Workspace version matches the highest published version.
                // Assume a bump is needed unless we find a published gitHead that matches current workspace files.
                shouldRewriteHeadVersion = true;

                for (const registryEntry of registryEntries) {
                    const publishedName = rewriteNpmPackageName(manifestContents.name, {
                        defaultScope: (registryEntry.name === 'ghp') ? cleanGhpScope : undefined,
                        registryName: registryEntry.name,
                        targetConfig: targetPackage,
                    });

                    const gitHead = await getPublishedNpmGitHead(publishedName, highestPublishedVersion, registryEntry, wsPath);
                    if (gitHead && isGitShaValid(wsPath, gitHead)) {
                        const hasChanges = hasTrackedPathsChangedSinceGitRef({
                            cwd:          wsPath,
                            gitRef:       gitHead,
                            trackedPaths: [pkgDir],
                        });
                        if (!hasChanges) {
                            shouldRewriteHeadVersion = false;
                            break;
                        }
                    }
                }
            }
        }

        let nextVersion = headVersion;
        if (shouldRewriteHeadVersion) {
            if (policy === 'fail') {
                conflicts.push({
                    headVersion,
                    highestPublishedVersion,
                    packageName: manifestContents.name,
                });
                continue;
            }
            nextVersion = incrementedPublishableVersion;
        }

        resolutions.push({
            headVersion,
            highestPublishedVersion,
            manifest: manifestContents,
            manifestPath,
            nextVersion,
            pkgDir,
        });
    }

    if (conflicts.length > 0) {
        const conflictSummary = conflicts
            .map(conflict => `- ${conflict.packageName}: workspace ${conflict.headVersion}, highest published ${conflict.highestPublishedVersion}`)
            .join('\n');

        throw new Error(`Version conflicts detected but policy=fail.\n${conflictSummary}`);
    }

    for (const resolution of resolutions) {
        if (resolution.highestPublishedVersion === null) {
            console.debug(`No published versions found for ${resolution.manifest.name}; keeping ${resolution.headVersion}.`);
            continue;
        }

        if (resolution.headVersion === resolution.nextVersion) {
            console.debug(`No conflict for ${resolution.manifest.name}; workspace ${resolution.headVersion}, highest published ${resolution.highestPublishedVersion}.`);
            continue;
        }

        console.log(`Bumping ${resolution.manifest.name} from ${resolution.headVersion} to ${resolution.nextVersion} because ${resolution.highestPublishedVersion} already exists and policy=${policy}.`);
    }

    return resolutions;
}
