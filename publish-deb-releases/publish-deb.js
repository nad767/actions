import path from 'node:path';

import { getDebsArtifactsDir } from '../toolkit/utils/getDebsArtifactsDir.js';
import { getGitHubReleaseByTag } from '../toolkit/utils/getGitHubReleaseByTag.js';
import { getGitHubRepository } from '../toolkit/utils/getGitHubRepository.js';
import { githubApi } from '../toolkit/utils/githubApi.js';
import { normalizeDebsConf } from '../toolkit/utils/normalizeDebsConf.js';
import { readJsonEnvVar } from '../toolkit/utils/readJsonEnvVar.js';
import { resolveDebConfigAsync } from '../toolkit/utils/resolveDebConfigAsync.js';
import { syncLatestGitHubDebRelease } from '../toolkit/utils/syncLatestGitHubDebRelease.js';
import { uploadGitHubReleaseAsset } from '../toolkit/utils/uploadGitHubReleaseAsset.js';
import { writeListToEnvVar } from '../toolkit/utils/writeListToEnvVar.js';

/**
 * Publish the built Debian bundle artifacts to GitHub Releases.
 *
 * Keeping release creation and asset upload in a dedicated script lets the reusable workflow host a sibling non-npm publication lane without large inline `github-script` blocks.
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
    const publishedTags = [];

    for (const builtBundle of targetBundles) {
        let release = await getGitHubReleaseByTag(githubApiToken, owner, repo, builtBundle.releaseTag);
        const assetPath = path.join(outputDir, builtBundle.assetFileName);

        if (!release) {
            release = await githubApi({
                apiPath:  `/repos/${owner}/${repo}/releases`,
                apiToken: githubApiToken,
                body:     {
                    body: [
                        `Debian package for ${builtBundle.packageName}.`,
                        '',
                        `Source path: ${builtBundle.path}`,
                        `Install root: ${builtBundle.installRoot}`,
                    ].join('\n'),
                    // Keep the release private until its asset upload succeeds so users never see a published release with a missing `.deb`.
                    // GitHub also recommends a draft-first flow for repositories that enable immutable releases.
                    draft:            true,
                    make_latest:      'false', // A string enum (`'true' | 'false' | 'legacy'`), not a boolean. See https://docs.github.com/en/rest/releases/releases?apiVersion=2026-03-10#:~:text=Default%3A%20false-,make_latest,-string.
                    name:             builtBundle.releaseName,
                    tag_name:         builtBundle.releaseTag,
                    target_commitish: process.env.GITHUB_SHA ?? process.env.BASE_BRANCH,
                },
                method: 'POST',
            });
        }

        const doesAssetExist = release.assets.some(asset => asset.name === builtBundle.assetFileName);

        if (doesAssetExist) {
            throw new Error(`Release ${builtBundle.releaseTag} already contains asset ${builtBundle.assetFileName}. Bump the Debian bundle version before publishing again.`);
        }

        console.log(`Uploading ${builtBundle.assetFileName} to release ${builtBundle.releaseTag}`);
        await uploadGitHubReleaseAsset({
            apiToken:          githubApiToken,
            assetPath,
            contentType:       'application/vnd.debian.binary-package',
            uploadUrlTemplate: release.upload_url,
        });

        // Publish only after the asset is attached so notifications and consumers see a complete release.
        if (release.draft) {
            await githubApi({
                apiPath:  `/repos/${owner}/${repo}/releases/${release.id}`,
                apiToken: githubApiToken,
                body:     {
                    draft:       false,
                    make_latest: 'false', // A string enum (`'true' | 'false' | 'legacy'`), not a boolean. See https://docs.github.com/en/rest/releases/releases?apiVersion=2026-03-10#:~:text=Default%3A%20false-,make_latest,-string.
                    name:        builtBundle.releaseName,
                },
                method: 'PATCH',
            });
        }

        await syncLatestGitHubDebRelease({
            assetPath,
            bundle: builtBundle,
            githubApiToken,
            owner,
            repo,
        });

        publishedTags.push(builtBundle.releaseTag);
        console.log(`Published ${builtBundle.assetFileName} to ${builtBundle.releaseTag}`);
    }

    await writeListToEnvVar('GITHUB_OUTPUT', 'published_debian_bundle_tags', publishedTags);
}

await main();
