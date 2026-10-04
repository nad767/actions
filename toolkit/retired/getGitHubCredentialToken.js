import { execFileSync } from 'node:child_process';

/**
 * Read a GitHub API token from git's configured credential helpers.
 *
 * This lets the local dispatcher reuse the same GitHub authentication that is
 * already available for normal git network operations in the workspace.
 *
 * @param {string} rootDir
 * @param {string} originUrl
 * @returns {string | null}
 */
export function getGitHubCredentialToken(rootDir, originUrl) {
    const repositoryMatch = originUrl.match(/(?<protocol>https?):\/\/(?<host>[^/]+)(?:\/(?<path>.+))?$/u)
        ?? originUrl.match(/git@(?<host>[^:]+):(?<path>.+)$/u);

    if (!repositoryMatch?.groups) return null;

    const {
        host,
        path: repositoryPath,
        protocol = 'https',
    } = repositoryMatch.groups;
    const credentialQuery = [
        `protocol=${protocol}`,
        `host=${host}`,
        repositoryPath ? `path=${repositoryPath}` : '',
        '',
    ].filter(Boolean).join('\n');

    const credentialResponse = execFileSync('git', ['credential', 'fill'], {
        cwd:      rootDir,
        encoding: 'utf8',
        input:    `${credentialQuery}\n`,
    });
    const passwordLine = credentialResponse
        .split('\n')
        .find(line => line.startsWith('password='));

    return passwordLine?.slice('password='.length) || null;
}
