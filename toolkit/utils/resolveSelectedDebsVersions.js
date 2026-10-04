import { execFileSync } from 'node:child_process';
import semver from 'semver';

/**
 * Resolve the next version for every bundle in `selectedBundles` according to the specified conflict resolution policy.
 *
 * @param {Array<Record<string, any>>} selectedBundles
 * @param {'fail' | 'patch' | 'minor' | 'major'} policy
 * @returns {Promise<Array<{
 *     bundle: Record<string, any>,
 *     headVersion: string,
 *     highestPublishedVersion: string | null,
 *     nextVersion: string,
 * }>>}
 */
export async function resolveSelectedDebsVersions(selectedBundles, policy) {
    // `GITHUB_WORKSPACE` injected automatically by GitHub Actions.
    const wsPath = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const conflicts = [];
    const resolutions = [];

    for (const selectedBundle of selectedBundles) {
        const matchingTagVersions = execFileSync(
            'git',
            [
                'tag',
                '--list',
                `${selectedBundle.releaseTagPrefix}*`,
                '--sort=-v:refname',
            ],
            {
                cwd:      wsPath,
                encoding: 'utf8',
            },
        )
            .split('\n')
            .map(tagName => tagName.trim())
            .filter(Boolean)
            .map(tagName => tagName.slice(selectedBundle.releaseTagPrefix.length))
            .map(tagVersion => semver.valid(tagVersion))
            .filter(Boolean)
            .toSorted(semver.rcompare);

        const highestPublishedVersion = matchingTagVersions[0] ?? null; // TODO: use `getHighestSemverVersion`?

        const incrementedPublishableVersion = (highestPublishedVersion === null)
            ? null
            : (policy === 'fail') ? highestPublishedVersion : semver.inc(highestPublishedVersion, policy);
        if ((highestPublishedVersion !== null) && (incrementedPublishableVersion === null)) throw new Error(`Failed to increment version ${highestPublishedVersion} with policy=${policy}.`);

        const headVersion = semver.valid(selectedBundle.version);
        if (!headVersion) throw new Error(`Unsupported semver version in ${selectedBundle.manifestPath}: ${selectedBundle.version}`);
        let nextVersion = headVersion;

        const shouldRewriteHeadVersion = (incrementedPublishableVersion !== null) && semver.gte(incrementedPublishableVersion, headVersion);
        if (shouldRewriteHeadVersion) {
            if (policy === 'fail') {
                conflicts.push({
                    headVersion,
                    highestPublishedVersion,
                    packageName: selectedBundle.packageName,
                });
                continue;
            }
            nextVersion = incrementedPublishableVersion;
        }

        resolutions.push({
            bundle: selectedBundle,
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
            console.debug(`No published versions found for ${resolution.bundle.packageName}; keeping ${resolution.headVersion}.`);
            continue;
        }

        if (resolution.headVersion === resolution.nextVersion) {
            console.debug(`No conflict for ${resolution.bundle.packageName}; workspace ${resolution.headVersion}, highest published ${resolution.highestPublishedVersion}.`);
            continue;
        }

        console.log(`Bumping ${resolution.bundle.packageName} from ${resolution.headVersion} to ${resolution.nextVersion} because ${resolution.highestPublishedVersion} already exists and policy=${policy}.`);
    }

    return resolutions;
}
