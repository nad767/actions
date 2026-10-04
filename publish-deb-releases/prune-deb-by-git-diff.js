import { execFileSync } from 'node:child_process';

import { hasTrackedPathsChangedSinceGitRef } from '../toolkit/utils/hasTrackedPathsChangedSinceGitRef.js';
import { normalizeDebsConf } from '../toolkit/utils/normalizeDebsConf.js';
import { readJsonEnvVar } from '../toolkit/utils/readJsonEnvVar.js';
import { resolveDebConfigAsync } from '../toolkit/utils/resolveDebConfigAsync.js';
import { writeJsonToEnvVar } from '../toolkit/utils/writeJsonToEnvVar.js';

/**
 * Prune Debian bundles before the build by checking whether their tracked source paths differ from the most relevant Git tag.
 *
 * The goal here is cheap filtering: skip bundles whose source tree and metadata are unchanged, and keep bundles that either have never been released or differ from the tagged release state.
 *
 * @returns {Promise<void>}
 */
async function main() {
    // `GITHUB_WORKSPACE` injected automatically by GitHub Actions.
    const wsPath = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const rawTargets = readJsonEnvVar('TARGETS_JSON');
    if (!Array.isArray(rawTargets)) throw new TypeError('Debian publish config must be an array.');
    const normalizedTargets = rawTargets.map(rawDebConfig => normalizeDebsConf(rawDebConfig));
    const rawConfigByManifestPath = new Map(rawTargets.map(rawDebConfig => [rawDebConfig.manifestPath, rawDebConfig]));
    const selectedTargets = [];

    for (const rawDebConfig of normalizedTargets) {
        const bundleConf = await resolveDebConfigAsync(rawDebConfig);
        const currentTag = execFileSync('git', ['tag', '--list', bundleConf.releaseTag], { cwd: wsPath, encoding: 'utf8' }).trim();

        // If the exact tag for this bundle version already exists, compare only the bundle's tracked paths
        // against that tag. That catches source or metadata changes that would require either a version bump
        // or a rebuild, without looking at unrelated repository changes.
        if (currentTag) {
            const hasCurrentTagChanges = hasTrackedPathsChangedSinceGitRef({
                cwd:          wsPath,
                gitRef:       currentTag,
                trackedPaths: [bundleConf.path, bundleConf.manifestPath],
            });

            if (hasCurrentTagChanges) {
                console.log(`Selecting \`${bundleConf.packageName}\`; tracked files changed since ${bundleConf.releaseTag}, so version conflict resolution may be required.`);
                selectedTargets.push(rawConfigByManifestPath.get(bundleConf.manifestPath));
                continue;
            }

            console.log(`Skipping \`${bundleConf.packageName}\`; ${bundleConf.releaseTag} already exists and no tracked files changed.`);
            continue;
        }

        // When the current version has never been tagged, fall back to the newest prior tag for this bundle series.
        // If there is no prior release tag at all, the bundle is unconditionally selected as a first publish.
        const prevMatchingTag = execFileSync(
            'git',
            ['tag', '--list', `${bundleConf.releaseTagPrefix}*`, '--sort=-v:refname'],
            { cwd: wsPath, encoding: 'utf8' },
        )
            .split('\n')
            .map(tagName => tagName.trim())
            .find(Boolean) ?? '';

        if (!prevMatchingTag) {
            console.log(`Selecting \`${bundleConf.packageName}\`; no previous ${bundleConf.releaseTagPrefix}* tag exists.`);
            selectedTargets.push(rawConfigByManifestPath.get(bundleConf.manifestPath));
            continue;
        }

        const hasPrevTagChanges = hasTrackedPathsChangedSinceGitRef({
            cwd:          wsPath,
            gitRef:       prevMatchingTag,
            trackedPaths: [bundleConf.path, bundleConf.manifestPath],
        });

        if (!hasPrevTagChanges) {
            console.log(`Skipping \`${bundleConf.packageName}\`; tracked files match ${prevMatchingTag}.`);
            continue;
        }

        console.log(`Selecting \`${bundleConf.packageName}\`; tracked files changed since ${prevMatchingTag}.`);
        selectedTargets.push(rawConfigByManifestPath.get(bundleConf.manifestPath));
    }

    await writeJsonToEnvVar('GITHUB_ENV', 'TARGETS_JSON', selectedTargets);
}

await main();
