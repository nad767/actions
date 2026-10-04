import semver from 'semver';

import { getHighestSemverVersion } from './getHighestSemverVersion.js';
import { getPublishedContainerVersions } from './getPublishedContainerVersions.js';

/**
 * Resolve the next version for every selected devcontainer feature according to the specified conflict resolution policy.
 *
 * @param {Array<Record<string, any>>} selectedFeatures
 * @param {'fail' | 'patch' | 'minor' | 'major'} policy
 * @returns {Promise<Array<{
 *     feature: Record<string, any>,
 *     headVersion: string,
 *     highestPublishedVersion: string | null,
 *     nextVersion: string,
 * }>>}
 */
export async function resolveSelectedDevcontainerFeaturesVersions(selectedFeatures, policy) {
    const githubApiToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    if (!githubApiToken) throw new Error('Missing `GITHUB_TOKEN` or `GH_TOKEN`.');

    const namespace = process.env.NAMESPACE;
    if (namespace && (namespace !== namespace.toLowerCase())) {
        throw new Error(`GitHub Packages namespace must be lowercase. Received "${namespace}".`);
    }
    const [owner] = namespace.split('/');
    const conflicts = [];
    const resolutions = [];

    for (const selectedFeature of selectedFeatures) {
        const publishedVersions = await getPublishedContainerVersions(
            selectedFeature.packageName,
            {
                apiToken: githubApiToken,
                owner,
            },
        );
        const highestPublishedVersion = getHighestSemverVersion(publishedVersions);
        const incrementedPublishableVersion = (highestPublishedVersion === null)
            ? null
            : (policy === 'fail') ? highestPublishedVersion : semver.inc(highestPublishedVersion, policy);
        if ((highestPublishedVersion !== null) && (incrementedPublishableVersion === null)) {
            throw new Error(`Failed to increment version ${highestPublishedVersion} with policy=${policy}.`);
        }

        const headVersion = semver.valid(selectedFeature.version);
        if (!headVersion) throw new Error(`Unsupported semver version in ${selectedFeature.manifestPath}: ${selectedFeature.version}`);

        let nextVersion = headVersion;
        const shouldRewriteHeadVersion = (incrementedPublishableVersion !== null) && semver.gte(incrementedPublishableVersion, headVersion);

        if (shouldRewriteHeadVersion) {
            if (policy === 'fail') {
                conflicts.push({
                    headVersion,
                    highestPublishedVersion,
                    packageName: selectedFeature.packageName,
                });
                continue;
            }

            nextVersion = incrementedPublishableVersion;
        }

        resolutions.push({
            feature: selectedFeature,
            headVersion,
            highestPublishedVersion,
            nextVersion,
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
            console.debug(`No published versions found for ${resolution.feature.packageName}; keeping ${resolution.headVersion}.`);
            continue;
        }

        if (resolution.headVersion === resolution.nextVersion) {
            console.debug(`No conflict for ${resolution.feature.packageName}; workspace ${resolution.headVersion}, highest published ${resolution.highestPublishedVersion}.`);
            continue;
        }

        console.log(`Bumping ${resolution.feature.packageName} from ${resolution.headVersion} to ${resolution.nextVersion} because ${resolution.highestPublishedVersion} already exists and policy=${policy}.`);
    }

    return resolutions;
}
