import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_POLICY } from '../toolkit/config.js';
import { downloadGitHubReleaseAsset } from '../toolkit/utils/downloadGitHubReleaseAsset.js';
import { getDebsArtifactsDir } from '../toolkit/utils/getDebsArtifactsDir.js';
import { getGitHubReleaseByTag } from '../toolkit/utils/getGitHubReleaseByTag.js';
import { getGitHubRepository } from '../toolkit/utils/getGitHubRepository.js';
import { hasDebChanged } from '../toolkit/utils/hasDebChanged.js';
import { normalizeDebsConf } from '../toolkit/utils/normalizeDebsConf.js';
import { readJsonEnvVar } from '../toolkit/utils/readJsonEnvVar.js';
import { resolveDebConfigAsync } from '../toolkit/utils/resolveDebConfigAsync.js';
import { resolveSelectedDebsVersions } from '../toolkit/utils/resolveSelectedDebsVersions.js';
import { writeJsonToEnvVar } from '../toolkit/utils/writeJsonToEnvVar.js';

/**
 * Prune Debian bundles after the build by comparing each candidate .deb against the latest published release asset.
 *
 * This is more expensive than the Git diff pass, but more accurate: it compares the actual build output, which lets the workflow skip bundles whose source diff would not change the produced package bytes or contents.
 *
 * @returns {Promise<void>}
 */
async function main() {
    // `GITHUB_TOKEN` is set in this workflow step's env.
    // Note that it does NOT get injected automatically by GitHub Actions. See https://docs.github.com/en/actions/reference/workflows-and-actions/variables.
    const githubApiToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    if (!githubApiToken) throw new Error('Missing `GITHUB_TOKEN` or `GH_TOKEN`.');

    const outputDir = getDebsArtifactsDir();
    const { owner, repo } = getGitHubRepository();
    const rawTargets = readJsonEnvVar('TARGETS_JSON');
    if (!Array.isArray(rawTargets)) throw new TypeError('Debian publish config must be an array.');
    const normalizedTargets = rawTargets.map(rawDebConfig => normalizeDebsConf(rawDebConfig));
    const targetBundles = await Promise.all(normalizedTargets.map(async debConfig => resolveDebConfigAsync(debConfig)));
    const versionResolutions = await resolveSelectedDebsVersions(targetBundles, DEFAULT_POLICY);

    // Version resolution tells us which published release should be treated as the current comparison baseline for each selected bundle, even before the explicit conflict-resolution step runs.
    const highestPublishedVersions = new Map(versionResolutions.map(resolution => [resolution.bundle.manifestPath, resolution.highestPublishedVersion]));
    const changedBundles = [];
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'prune-deb-by-build-diff'));

    try {
        for (const builtBundle of targetBundles) {
            const highestPublishedVersion = highestPublishedVersions.get(builtBundle.manifestPath) ?? null;

            if (highestPublishedVersion === null) {
                console.debug(`Publishing \`${builtBundle.packageName}\`; no published Debian bundle versions exist yet.`);
                changedBundles.push(builtBundle);
                continue;
            }

            const latestReleaseTag = `${builtBundle.releaseTagPrefix}${highestPublishedVersion}`;
            const latestAssetFileName = `${builtBundle.packageName}_${highestPublishedVersion}_${builtBundle.architecture}.deb`;
            const latestRelease = await getGitHubReleaseByTag(githubApiToken, owner, repo, latestReleaseTag);

            if (!latestRelease) {
                console.debug(`Publishing \`${builtBundle.packageName}\`; release \`${latestReleaseTag}\` was not found.`);
                changedBundles.push(builtBundle);
                continue;
            }

            const latestAsset = latestRelease.assets.find(asset => asset.name === latestAssetFileName);

            if (!latestAsset) {
                console.debug(`Publishing \`${builtBundle.packageName}\`; release \`${latestReleaseTag}\` is missing \`${latestAssetFileName}\`.`);
                changedBundles.push(builtBundle);
                continue;
            }

            const downloadedAssetPath = path.join(tempRoot, latestAssetFileName);
            await downloadGitHubReleaseAsset(githubApiToken, latestAsset.url, downloadedAssetPath);

            const { hasChanged, reason } = await hasDebChanged({
                localAssetPath:  path.join(outputDir, builtBundle.assetFileName),
                remoteAssetPath: downloadedAssetPath,
            });

            console.debug(`${hasChanged ? 'Publishing' : 'Skipping'} \`${builtBundle.packageName}\`; ${reason}.`);

            if (hasChanged) changedBundles.push(builtBundle);
        }

        // Keep the selected identifier list aligned with the subset that still needs version checks and final publication.
        const changedManifestPaths = new Set(changedBundles.map(bundle => bundle.manifestPath));
        const changedSelectionBundles = targetBundles.filter(bundle => changedManifestPaths.has(bundle.manifestPath));
        const selectedTargets = rawTargets.filter(bundle => changedManifestPaths.has(bundle.manifestPath));

        console.log('\nChanged Debian bundles:');
        if (changedSelectionBundles.length === 0) console.log('- (none)');
        else for (const bundle of changedSelectionBundles) console.log(`- ${bundle.packageName}`);

        await writeJsonToEnvVar('GITHUB_ENV', 'TARGETS_JSON', selectedTargets);
    }
    finally {
        await rm(tempRoot, { force: true, recursive: true });
    }
}

await main();
