/**
 * Parse the current repository owner and name from the GitHub Actions runtime.
 *
 * @returns {{ owner: string, repo: string }}
 */
export function getGitHubRepository() {
    // `GITHUB_REPOSITORY` is injected automatically by GitHub Actions.
    const repository = process.env.GITHUB_REPOSITORY ?? '';
    const [owner, repo] = repository.split('/');

    if (!owner || !repo) {
        throw new Error('Missing `GITHUB_REPOSITORY`. This script must run inside GitHub Actions or with that variable set explicitly.');
    }

    return { owner, repo };
}
