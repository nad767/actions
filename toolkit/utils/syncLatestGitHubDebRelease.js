import { getGitHubReleaseByTag } from './getGitHubReleaseByTag.js';
import { githubApi } from './githubApi.js';
import { uploadGitHubReleaseAsset } from './uploadGitHubReleaseAsset.js';

/**
 * Recreate one Debian bundle's `*-latest` release (instead of patching current `*-latest` release), so that its timestamp and the tag's target commit are refreshed for each publish.
 *
 * Motivation: external Dockerfiles need a stable tag and asset filename so they can fetch the newest private bundle without hard-coding a version.
 *
 * @param {{
 *     assetPath: string,
 *     bundle: {
 *         installRoot: string,
 *         latestAssetFileName: string,
 *         latestReleaseName: string,
 *         latestReleaseTag: string,
 *         packageName: string,
 *         path: string,
 *         version: string,
 *     },
 *     githubApiToken: string,
 *     owner: string,
 *     repo: string,
 * }} options
 * @returns {Promise<void>}
 */
export async function syncLatestGitHubDebRelease({
    assetPath,
    bundle,
    githubApiToken,
    owner,
    repo,
}) {
    // First, delete the existing `*-latest` release, if it exists.
    const existingLatestRelease = await getGitHubReleaseByTag(githubApiToken, owner, repo, bundle.latestReleaseTag);
    if (existingLatestRelease) {
        await githubApi({
            apiPath:             `/repos/${owner}/${repo}/releases/${existingLatestRelease.id}`,
            apiToken:            githubApiToken,
            expectEmptyResponse: true,
            method:              'DELETE',
        });
    }

    // Delete its git reference tag as well, if it exists.
    try {
        await githubApi({
            apiPath:             `/repos/${owner}/${repo}/git/refs/tags/${encodeURIComponent(bundle.latestReleaseTag)}`,
            apiToken:            githubApiToken,
            expectEmptyResponse: true,
            method:              'DELETE',
        });
    }
    catch (err) {
        if ((err.status !== 404) && (err.status !== 422)) throw err; // `422` is the expected status when the specified release doesn't exist. This is NOT explicitly mentioned in https://docs.github.com/en/rest/git/refs?apiVersion=2026-03-10#delete-a-reference--status-codes, but was observed in practice.
    }

    // Then, create a new `*-latest` release as draft.
    const releaseBody = [
        `Latest Debian package for ${bundle.packageName}.`,
        '',
        `Current version: ${bundle.version}`,
        `Source path: ${bundle.path}`,
        `Install root: ${bundle.installRoot}`,
    ].join('\n');

    const latestRelease = await githubApi({
        apiPath:  `/repos/${owner}/${repo}/releases`,
        apiToken: githubApiToken,
        body:     {
            body:             releaseBody,
            draft:            true,
            make_latest:      'false', // A string enum ('true' | 'false' | 'legacy'), not a boolean. See https://docs.github.com/en/rest/releases/releases?apiVersion=2026-03-10#:~:text=Default%3A%20false-,make_latest,-string.
            name:             bundle.latestReleaseName,
            tag_name:         bundle.latestReleaseTag,
            target_commitish: process.env.GITHUB_SHA ?? process.env.BASE_BRANCH,
        },
        method: 'POST',
    });

    // Then, upload the asset to the new `*-latest` release.
    console.log(`Uploading ${bundle.latestAssetFileName} to release ${bundle.latestReleaseTag}`);
    await uploadGitHubReleaseAsset({
        apiToken:              githubApiToken,
        assetFileNameOverride: bundle.latestAssetFileName,
        assetPath,
        contentType:           'application/vnd.debian.binary-package',
        uploadUrlTemplate:     latestRelease.upload_url,
    });

    // Finally, set the release to non-draft once the asset is attached, so notifications and consumers see a complete release.
    await githubApi({
        apiPath:  `/repos/${owner}/${repo}/releases/${latestRelease.id}`,
        apiToken: githubApiToken,
        body:     {
            draft:       false,
            make_latest: 'false', // A string enum ('true' | 'false' | 'legacy'), not a boolean. See https://docs.github.com/en/rest/releases/releases?apiVersion=2026-03-10#:~:text=Default%3A%20false-,make_latest,-string.
        },
        method: 'PATCH',
    });
}
