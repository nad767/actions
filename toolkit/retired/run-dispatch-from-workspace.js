import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';

import { DEFAULT_POLICY, SUPPORTED_POLICIES } from './config.js';
import { ensureGitHubApiToken } from './utils/ensureGitHubApiToken.js';
import { githubApi } from './utils/githubApi.js';

/**
 * @deprecated Replaced by `packages/run-workflow`.
 *
 * Dispatch the selected publish workflow from the local workspace,
 * wait for any auto-merged version-bump pull requests for its lane,
 * pull (fast-forward) the local default branch,
 * and acknowledge that sync back to the workflow.
 *
 * @param {{
 *   repositoryDispatchEvent: string,
 *   versionUpdateLanes: Array<{
 *     branchPrefix: string,
 *     localSyncContextPrefix: string,
 *     name: string,
 *   }>,
 *   workflowFilename: string,
 *   workflowName: string,
 * }} dispatchWorkflowDefinition
 * @returns {Promise<void>}
 */
export async function runDispatchFromWorkspace(dispatchWorkflowDefinition) { // export async function main(/* argv */) {
    // `GITHUB_WORKSPACE` injected automatically by GitHub Actions.
    const wsPath = process.env.GITHUB_WORKSPACE ?? process.cwd();

    const parsedArgs = parseArgs({
        options: {
            policy:                    { type: 'string' }, // alias for `version-conflict-policy`
            tag:                       { type: 'string' },
            'version-conflict-policy': { type: 'string' },
        },
        // args:    argv, // `process.argv.slice(2)` is already the default, see https://nodejs.org/api/util.html#utilparseargsconfig.
        // strict: true, // Disallow unknown arguments and type mismatches. `true` is already the default.
    });

    // While `parseArgs` supports default values for the arguments, resolving them afterwards allows us to use other parsed values (e.g. `owner`) as fallbacks for related defaults (e.g. `namespace`).
    const policy = parsedArgs.values['version-conflict-policy'] ?? parsedArgs.values.policy ?? DEFAULT_POLICY;
    const tag = parsedArgs.values.tag ?? 'latest';

    if (!SUPPORTED_POLICIES.has(policy)) throw new Error(`Unsupported version conflict policy: ${policy}`);

    const originUrl = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: wsPath, encoding: 'utf8' }).trim();
    const githubApiToken = ensureGitHubApiToken(wsPath, originUrl);
    const repositoryMatch = originUrl.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/.]+?)(?:\.git)?$/u);

    if (!repositoryMatch?.groups) {
        throw new Error(`Unable to derive the GitHub repository from origin URL: ${originUrl}`);
    }

    const { owner, repo } = repositoryMatch.groups;
    const { repositoryDispatchEvent, versionUpdateLanes: configuredLanes, workflowFilename, workflowName } = dispatchWorkflowDefinition;
    const viewer = await githubApi({ apiPath: '/user', apiToken: githubApiToken });
    const repository = await githubApi({ apiPath: `/repos/${owner}/${repo}`, apiToken: githubApiToken });
    const defaultBranch = repository.default_branch;
    const currentBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: wsPath, encoding: 'utf8' }).trim();

    if (currentBranch !== defaultBranch) {
        throw new Error(`The local launcher only supports the default branch. Current branch: ${currentBranch}. Default branch: ${defaultBranch}.`);
    }

    execFileSync('git', ['fetch', 'origin', defaultBranch], { cwd: wsPath, stdio: 'inherit' });

    const localHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: wsPath, encoding: 'utf8' }).trim();
    const remoteHead = execFileSync('git', ['rev-parse', `origin/${defaultBranch}`], { cwd: wsPath, encoding: 'utf8' }).trim();

    if (localHead !== remoteHead) {
        throw new Error(`The local \`${defaultBranch}\` branch must match \`origin/${defaultBranch}\` before dispatching. Run \`git pull --ff-only origin ${defaultBranch}\` first.`);
    }

    const dispatchStartedAt = Date.now();
    const localSyncNonce = randomUUID();
    const versionUpdateLanes = configuredLanes.map(lane => ({
        ...lane,
        localSyncAcknowledged:   false,
        localSyncContext:        `${lane.localSyncContextPrefix}/${localSyncNonce}`,
        pullRequest:             null,
        pullRequestsApiPath:     `/repos/${owner}/${repo}/pulls`,
        pullRequestsQueryParams: {
            base:      defaultBranch,
            direction: 'desc',
            head:      `${owner}:${lane.branchPrefix}/${defaultBranch}`,
            per_page:  '1',
            sort:      'updated',
            state:     'all',
        },
    }));

    await githubApi({
        apiPath:  `/repos/${owner}/${repo}/dispatches`,
        apiToken: githubApiToken,
        body:     {
            client_payload: {
                local_sync_nonce:        localSyncNonce,
                tag,
                version_conflict_policy: policy,
            },
            event_type: repositoryDispatchEvent,
        },
        expectEmptyResponse: true,
        method:              'POST',
    });

    console.log(`Dispatched \`${workflowName}\` for \`${owner}/${repo}\` on \`${defaultBranch}\` branch.`);
    console.log('If local uncommitted changes later block the required fast-forward pull, the dispatcher will report that failure back to the workflow.');

    let workflowRun = null;
    const workflowRunLookupDeadline = dispatchStartedAt + 120_000;

    while (true) {
        if (!workflowRun) {
            const workflowRuns = await githubApi({
                apiPath:     `/repos/${owner}/${repo}/actions/workflows/${workflowFilename}/runs`,
                apiToken:    githubApiToken,
                queryParams: {
                    branch:   defaultBranch,
                    event:    'repository_dispatch',
                    per_page: '20',
                },
            });
            workflowRun = workflowRuns.workflow_runs.find(run => {
                const runCreatedAt = new Date(run.created_at).getTime();
                return run.actor?.login === viewer.login && runCreatedAt >= dispatchStartedAt - 10_000;
            }) ?? null;

            if (workflowRun) {
                console.log(`Tracking workflow run #${workflowRun.run_number}: ${workflowRun.html_url}`);
            }
            else if (Date.now() > workflowRunLookupDeadline) {
                throw new Error(`Timed out waiting for \`${workflowName}\` to start.`);
            }
        }

        if (workflowRun) {
            workflowRun = await githubApi({
                apiPath:  `/repos/${owner}/${repo}/actions/runs/${workflowRun.id}`,
                apiToken: githubApiToken,
            });
        }

        const pullRequestsByLane = await Promise.all(versionUpdateLanes.map(async versionUpdateLane => {
            const pullRequests = await githubApi({
                apiPath:     versionUpdateLane.pullRequestsApiPath,
                apiToken:    githubApiToken,
                queryParams: versionUpdateLane.pullRequestsQueryParams,
            });
            const matchedPullRequest = pullRequests.find(pullRequest => {
                const pullRequestUpdatedAt = new Date(pullRequest.updated_at).getTime();
                return pullRequestUpdatedAt >= dispatchStartedAt - 10_000;
            });

            versionUpdateLane.pullRequest = matchedPullRequest ?? versionUpdateLane.pullRequest;
            return versionUpdateLane;
        }));

        for (const versionUpdateLane of pullRequestsByLane) {
            if (!versionUpdateLane.pullRequest?.merged_at || versionUpdateLane.localSyncAcknowledged) {
                continue;
            }

            const mergedCommitSha = versionUpdateLane.pullRequest.merge_commit_sha ?? null;

            console.log(
                `${versionUpdateLane.name} version-update pull request #${versionUpdateLane.pullRequest.number} merged${mergedCommitSha ? ` as ${mergedCommitSha}` : ''}.`,
                `Pulling ${defaultBranch} locally before publish continues.`,
            );

            try {
                execFileSync('git', ['pull', '--ff-only', 'origin', defaultBranch], { cwd: wsPath, stdio: 'inherit' });

                const pulledHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: wsPath, encoding: 'utf8' }).trim();
                const localSyncStatusShas = [...new Set([pulledHead, mergedCommitSha].filter(Boolean))];

                if (mergedCommitSha) {
                    try {
                        execFileSync('git', ['merge-base', '--is-ancestor', mergedCommitSha, pulledHead], { cwd: wsPath, stdio: 'ignore' });
                    }
                    catch {
                        throw new Error(`Local HEAD ${pulledHead} does not contain merged commit ${mergedCommitSha}.`);
                    }
                }

                for (const localSyncStatusSha of localSyncStatusShas) {
                    await githubApi({
                        apiPath:  `/repos/${owner}/${repo}/statuses/${localSyncStatusSha}`,
                        apiToken: githubApiToken,
                        body:     {
                            context:     versionUpdateLane.localSyncContext,
                            description: `Local workspace pulled ${defaultBranch} after ${versionUpdateLane.name} version-update merge.`,
                            state:       'success',
                            target_url:  workflowRun?.html_url,
                        },
                        method: 'POST',
                    });
                }

                versionUpdateLane.localSyncAcknowledged = true;
                console.log(`Local workspace synchronized and acknowledged for the ${versionUpdateLane.name} workflow lane.`);
            }
            catch (err) {
                const failureStatusSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: wsPath, encoding: 'utf8' }).trim();

                await githubApi({
                    apiPath:  `/repos/${owner}/${repo}/statuses/${failureStatusSha}`,
                    apiToken: githubApiToken,
                    body:     {
                        context:     versionUpdateLane.localSyncContext,
                        description: `Local workspace pull failed for ${versionUpdateLane.name}: ${String(err.message ?? err).slice(0, 120)}`,
                        state:       'failure',
                        target_url:  workflowRun?.html_url,
                    },
                    method: 'POST',
                });

                throw err;
            }
        }

        if (workflowRun?.status === 'completed') {
            if (workflowRun.conclusion !== 'success') {
                throw new Error(`${workflowName} failed: ${workflowRun.html_url}`);
            }

            const unacknowledgedMergedLanes = versionUpdateLanes
                .filter(versionUpdateLane => versionUpdateLane.pullRequest?.merged_at && !versionUpdateLane.localSyncAcknowledged)
                .map(versionUpdateLane => versionUpdateLane.name);

            if (unacknowledgedMergedLanes.length > 0) {
                throw new Error(
                    `${workflowName} finished before the local workspace sync was acknowledged for: ${unacknowledgedMergedLanes.join(', ')}. ${workflowRun.html_url}`,
                );
            }

            console.log(`Workflow completed successfully: ${workflowRun.html_url}`);
            return;
        }

        await delay(5000);
    }
}
