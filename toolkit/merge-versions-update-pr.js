import { appendFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

import { getGitHubRepository } from './utils/getGitHubRepository.js';
import { githubApi } from './utils/githubApi.js';

/**
 * Merge the auto-generated version-bump pull request after GitHub reports that
 * the pull request is mergeable, and expose the merge result as workflow step
 * outputs for any downstream step that wants them.
 *
 * Motivation: keeping this orchestration in a normal Node entrypoint makes the
 * workflow YAML declarative and keeps merge behavior testable outside inline
 * `github-script` blocks.
 *
 * @returns {Promise<void>}
 */
async function main() {
    // `GITHUB_TOKEN` is set in this workflow step's env.
    // Note that it does NOT get injected automatically by GitHub Actions. See https://docs.github.com/en/actions/reference/workflows-and-actions/variables.
    const githubApiToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    if (!githubApiToken) throw new Error('Missing `GITHUB_TOKEN` or `GH_TOKEN`.');

    // `PULL_REQUEST_NUMBER` is set in this workflow step's env.
    const pullRequestNumber = Number(process.env.PULL_REQUEST_NUMBER);
    if (!pullRequestNumber) throw new Error('Expected `PULL_REQUEST_NUMBER` to contain a pull request number.');

    const { owner, repo } = getGitHubRepository();
    const pullRequestApiPath = `/repos/${owner}/${repo}/pulls/${pullRequestNumber}`;
    let pullRequest;

    for (let attempt = 0; attempt < 12; attempt += 1) {
        pullRequest = await githubApi({
            apiPath:  pullRequestApiPath,
            apiToken: githubApiToken,
        });

        if (pullRequest.mergeable !== null) break;

        await delay(5000);
    }

    if (pullRequest?.mergeable !== true) {
        const mergeableState = pullRequest?.mergeable_state ?? 'unknown';

        throw new Error(
            `Version update pull request #${pullRequestNumber} is not mergeable. mergeable=${String(pullRequest?.mergeable)} mergeable_state=${mergeableState}`,
        );
    }

    const repository = await githubApi({
        apiPath:  `/repos/${owner}/${repo}`,
        apiToken: githubApiToken,
    });
    const mergeMethods = [
        repository.allow_squash_merge && 'squash',
        repository.allow_merge_commit && 'merge',
        repository.allow_rebase_merge && 'rebase',
    ].filter(Boolean);

    if (mergeMethods.length === 0) {
        throw new Error('No merge methods are enabled for this repository.');
    }

    const mergeFailures = [];

    for (const mergeMethod of mergeMethods) {
        try {
            const mergeResponse = await githubApi({
                apiPath:  `/repos/${owner}/${repo}/pulls/${pullRequestNumber}/merge`,
                apiToken: githubApiToken,
                body:     { merge_method: mergeMethod },
                method:   'PUT',
            });

            // `GITHUB_OUTPUT` is injected automatically by GitHub Actions for workflow outputs.
            await appendFile(process.env.GITHUB_OUTPUT, `merge_commit_sha=${mergeResponse.sha}\nmerge_method=${mergeMethod}\n`);

            console.log(`Merged version update pull request #${pullRequestNumber} using ${mergeMethod}.`);
            return;
        }
        catch (err) {
            if (![405, 409, 422].includes(err.status ?? 0)) {
                throw err;
            }

            mergeFailures.push(`${mergeMethod}: ${err.message}`);
        }
    }

    throw new Error(`Unable to merge version update pull request #${pullRequestNumber}. ${mergeFailures.join(' | ')}`);
}

await main();
