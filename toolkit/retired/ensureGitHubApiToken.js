import { getGitHubCredentialToken } from './getGitHubCredentialToken.js';

/**
 * Return a GitHub API token for **local** workflow dispatch and sync acknowledgement.
 *
 * The local launcher needs repository API access, which is distinct from the
 * package registry token used by the publish scripts.
 *
 * @param {string} rootDir
 * @param {string} originUrl
 * @returns {string}
 */
export function ensureGitHubApiToken(rootDir, originUrl) {
    // `GITHUB_TOKEN` is set in this workflow step's env.
    // Note that it does NOT get injected automatically by GitHub Actions. See https://docs.github.com/en/actions/reference/workflows-and-actions/variables.
    const githubApiToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN; // Shouldn't be defined locally, but check just in case
    if (githubApiToken) return githubApiToken;

    const gitCredentialToken = getGitHubCredentialToken(rootDir, originUrl);
    if (gitCredentialToken) return gitCredentialToken;

    throw new Error('Missing a GitHub API token. Set `GITHUB_TOKEN` or `GH_TOKEN`, or configure a git credential helper that can authenticate to GitHub.');
}
