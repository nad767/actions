import { githubApi } from './githubApi.js';

/**
 * Fetch a GitHub release by tag, returning null when the tag has no release.
 *
 * The release publication step needs an existence check that distinguishes a
 * missing release from a real API failure.
 *
 * @param {string} githubApiToken
 * @param {string} owner
 * @param {string} repo
 * @param {string} tag
 * @returns {Promise<any | null>}
 */
export async function getGitHubReleaseByTag(githubApiToken, owner, repo, tag) {
    try {
        return await githubApi({
            apiPath:  `/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
            apiToken: githubApiToken,
        });
    }
    catch (err) {
        if (err.status === 404) return null;
        throw err;
    }
}
