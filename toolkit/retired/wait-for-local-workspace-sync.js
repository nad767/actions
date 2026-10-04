import { setTimeout as delay } from 'node:timers/promises';

import { getGitHubRepository } from './utils/getGitHubRepository.js';
import { githubApi } from './utils/githubApi.js';

/**
 * @deprecated Replaced by `packages/run-workflow`.
 * 
 * Wait for the local workspace dispatcher to acknowledge that it has pulled the merged base branch,
 * and fail the workflow if that acknowledgement never arrives or arrives as an explicit failure.
 *
 * Motivation: keeping the polling logic in a standalone Node script removes the remaining inline JavaScript from the workflow and keeps the handshake logic in one reusable place.
 *
 * TODO: consider forking this from the main workflow thread.
 *
 * @returns {Promise<void>}
 */
async function main() {
    // `GITHUB_TOKEN` is set in this workflow step's env.
    // Note that it does NOT get injected automatically by GitHub Actions. See https://docs.github.com/en/actions/reference/workflows-and-actions/variables.
    const githubApiToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    if (!githubApiToken) throw new Error('Missing `GITHUB_TOKEN` or `GH_TOKEN`.');

    // `LOCAL_SYNC_CONTEXT` is set in this workflow step's env.
    const localSyncContext = process.env.LOCAL_SYNC_CONTEXT;
    if (!localSyncContext) throw new Error('Missing `LOCAL_SYNC_CONTEXT`.');

    // `PUBLISH_SHA` is set in this workflow step's env.
    const publishSha = process.env.PUBLISH_SHA;
    if (!publishSha) throw new Error('Missing `PUBLISH_SHA`.');

    const { owner, repo } = getGitHubRepository();

    const startedAt = Date.now();
    const timeoutMs = 2 * 60 * 1000; // 2 minutes

    while ((Date.now() - startedAt) < timeoutMs) {
        const commitStatuses = await githubApi({
            apiPath:     `/repos/${owner}/${repo}/statuses/${publishSha}`,
            apiToken:    githubApiToken,
            queryParams: { per_page: '100' },
        });
        const matchingStatuses = commitStatuses.filter(status => status.context === localSyncContext);
        const failedStatus = matchingStatuses.find(status => ['error', 'failure'].includes(status.state));

        if (failedStatus) {
            throw new Error(`Local workspace sync failed: ${failedStatus.description ?? failedStatus.state}`);
        }

        const successfulStatus = matchingStatuses.find(status => status.state === 'success');

        if (successfulStatus) {
            console.log(`Local workspace sync acknowledged by "${localSyncContext}".`);
            return;
        }

        await delay(5000);
    }

    throw new Error(`Timed out waiting for local workspace sync status "${localSyncContext}" on ${publishSha}.`);
}

await main();
