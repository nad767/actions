import { execFileSync } from 'node:child_process';
import {
    access,
    cp,
    mkdir,
    rm,
    writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { createNpmPackageNameMappings } from '../toolkit/utils/createNpmPackageNameMappings.js';
import { createNpmStagingEnvironment } from '../toolkit/utils/createNpmStagingEnvironment.js';
import { getPublishedNpmVersions } from '../toolkit/utils/getPublishedNpmVersions.js';
import { findOverlappingStagedNpmPackages } from '../toolkit/utils/findOverlappingStagedNpmPackages.js';
import { getStagedNpmPackages } from '../toolkit/utils/getStagedNpmPackages.js';
import { normalizeNpmsConf } from '../toolkit/utils/normalizeNpmsConf.js';
import { parseBoolean } from '../toolkit/utils/parseBoolean.js';
import { readJsonAsync } from '../toolkit/utils/readJsonAsync.js';
import { readJsonEnvVar } from '../toolkit/utils/readJsonEnvVar.js';
import { rejectStagedNpmPackage } from '../toolkit/utils/rejectStagedNpmPackage.js';
import { rewriteNpmManifest } from '../toolkit/utils/rewriteNpmManifest.js';
import { rewriteStagedNpmPackagesSpecifiers } from '../toolkit/utils/rewriteStagedNpmPackagesSpecifiers.js';
import { sortNpmsConfs } from '../toolkit/utils/sortNpmsConfs.js';
import { spawnAuthNpmAsync } from '../toolkit/utils/spawnAuthNpmAsync.js';

/**
 * Publish configured packages in dependency order, to one or more registries per package.
 *
 * Each package's `registry` field determines which registries receive the publish.
 * The manifest's `publishConfig` and the auth token env var are derived from the resolved registry entries.
 *
 * @param {string[]} argv
 * @returns {Promise<void>}
 */
async function main(/* argv */) {
    // `GITHUB_WORKSPACE` injected automatically by GitHub Actions.
    const wsPath = process.env.GITHUB_WORKSPACE ?? process.cwd();

    const rawTargets = readJsonEnvVar('TARGETS_JSON');
    if (!Array.isArray(rawTargets)) throw new TypeError('npm publish config must be an array.');
    const normalizedTargets = sortNpmsConfs(rawTargets.map(rawNpmConfig => normalizeNpmsConf(rawNpmConfig)));

    const rootManifestPath = path.join(wsPath, 'package.json');
    const rootManifestContents = await readJsonAsync(rootManifestPath).catch(() => ({})); // The root directory might not have a `package.json` (for example the package being published in a subdir). Catch an exception so that we don't fail the job over this.

    // `GITHUB_REPOSITORY` is injected automatically by GitHub Actions.
    const repoEnv = process.env.GITHUB_REPOSITORY ?? '';
    const [repoOwner, repoName] = repoEnv.split('/', 2);

    // `PUBLISH_DRY_RUN`, `GHP_SCOPE`, and `PUBLISH_TAG` are set by the caller via workflow env.
    const isDryRun = parseBoolean(process.env.PUBLISH_DRY_RUN, false);

    // `STAGE_TO_NPMJS` determines whether npmjs releases are staged via `npm stage publish` for onsite approval (defaults to `true`).
    const isStageToNpmjs = parseBoolean(process.env.STAGE_TO_NPMJS, true);

    const rawGhpScope = process.env.GHP_SCOPE ?? repoOwner ?? '';
    const ghpScope = rawGhpScope.replace(/^@/u, '');
    if (ghpScope && (ghpScope !== ghpScope.toLowerCase())) {
        throw new Error(`GitHub Packages scope must be lowercase. Received "${rawGhpScope}".`);
    }

    const owner = repoOwner ?? rootManifestContents.author;
    if (!owner) throw new Error('Missing GitHub repository owner. GitHub Actions should set `GITHUB_REPOSITORY`, or the root manifest must declare `author`.');

    const repo = repoName ?? rootManifestContents.name;
    if (!repo) throw new Error('Missing GitHub repository name. GitHub Actions should set `GITHUB_REPOSITORY`, or the root manifest must declare `name`.');

    const tag = process.env.PUBLISH_TAG ?? 'latest';

    // Rewrite names against the full publishable graph (`packageConfigs`) even when the current run only publishes a filtered subset, otherwise downstream packages can leak unre-written internal references for pruned dependencies.
    const rawAllTargets = readJsonEnvVar('ALL_TARGETS_JSON');
    if (!Array.isArray(rawAllTargets)) throw new TypeError('npm publish config must be an array.');
    const normalizedAllTargets = sortNpmsConfs(rawAllTargets.map(rawNpmConfig => normalizeNpmsConf(rawNpmConfig)));

    // Normally, `npm publish` adds "gitHead" to the published package's `package.json` automatically.
    // Here, however, since we publish from a clean staging directory *without* a `.git` folder, this doesn't happen.
    // Rather than polluting the workspace by publishing at the checkout, or copying the whole repository and publishing with `npm publish --git`, we just inject the commit SHA to the manifest manually.
    const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: wsPath, encoding: 'utf8' }).trim();

    console.log(
        `Publishing packages (default GitHub Packages scope: @${ghpScope || '<none>'}).`,
        `Repository link: https://github.com/${owner}/${repo}`,
    );
    if (isDryRun) console.log('Dry run enabled. No package will be published.');

    /** @type {string[]} */
    const publishedRecords = [];

    // Keep publication sequential so later packages can resolve renamed internal dependencies that were published earlier in the same run.
    for (const target of normalizedTargets) {
        const { buildOutDir, buildScript, path: pkgDir, registryEntries } = target;
        const srcDir = path.join(wsPath, pkgDir);
        const manifestPath = path.join(srcDir, 'package.json');
        const manifestContents = await readJsonAsync(manifestPath);
        const hasBuildStep = Boolean(buildScript);

        if (hasBuildStep) {
            const distPath = path.join(srcDir, buildOutDir);
            await access(distPath).catch(() => { throw new Error(`Package ${manifestContents.name} is missing ${buildOutDir}. Run its \`${buildScript}\` script first.`); });
        }

        // Publish to each target registry sequentially.
        for (const registryEntry of registryEntries) {
            const defaultScope = (registryEntry.name === 'ghp') ? ghpScope : undefined;
            const pkgsNameMappings = await createNpmPackageNameMappings({
                defaultScope,
                registryName: registryEntry.name,
                targets:      normalizedAllTargets,
                wsPath,
            });
            const publishedName = pkgsNameMappings.get(manifestContents.name);
            if (!publishedName) throw new Error(`No rewritten package name was generated for ${manifestContents.name}.`);

            // By the time this step runs, upstream prune and conflict resolution steps have already validated
            // that if a package's version was not bumped, its source diff and build output match the published release.
            // Therefore, if this specific registry already has this version, we can safely skip republishing to it while allowing
            // any other target registries that are missing this version to catch up.
            const publishedVersions = [...new Set(await getPublishedNpmVersions(publishedName, registryEntry, wsPath))];
            if (publishedVersions.includes(manifestContents.version)) {
                console.log(`\nSkipping ${publishedName}@${manifestContents.version} on registry "${registryEntry.name}" (${registryEntry.url}) because it is already published.`);
                publishedRecords.push(`${publishedName}@${manifestContents.version} -> ${registryEntry.name} (${registryEntry.url}) [already published; skipped]`);
                continue;
            }

            const stagingRoot = await createNpmStagingEnvironment({
                prefix:  'publish-npm',
                targets: normalizedAllTargets,
                wsPath,
            });

            try {
                const stageDir = path.join(stagingRoot, pkgDir);
                await mkdir(path.dirname(stageDir), { recursive: true });
                await cp(srcDir, stageDir, { recursive: true });

                // Rewrite source-file specifiers for this registry.
                const entrypoints = hasBuildStep ? [buildOutDir] : manifestContents.files;
                await rewriteStagedNpmPackagesSpecifiers(stageDir, entrypoints, pkgsNameMappings);

                const rewrittenManifest = rewriteNpmManifest(
                    manifestContents,
                    publishedName,
                    hasBuildStep,
                    buildOutDir,
                    pkgsNameMappings,
                    owner,
                    repo,
                    registryEntry,
                );
                rewrittenManifest.gitHead = headSha;

                const packageJsonContents = `${JSON.stringify(rewrittenManifest, null, 4)}\n`;
                await writeFile(path.join(stageDir, 'package.json'), packageJsonContents);

                const isNpmjsStaging = (registryEntry.name === 'npmjs') && (target.stageToNpmjs ?? isStageToNpmjs);
                const actionVerb = isNpmjsStaging ? 'Staging' : 'Publishing';
                const stagingNote = isNpmjsStaging ? ' (for onsite approval)' : '';
                console.log(`\n${actionVerb} ${publishedName}@${manifestContents.version} to registry "${registryEntry.name}" (${registryEntry.url}) from ${pkgDir}${stagingNote}`);

                let didOverrideStaged = false;
                if (isNpmjsStaging) {
                    const stagedPackages = await getStagedNpmPackages(publishedName, registryEntry, wsPath);
                    const overlappingStages = findOverlappingStagedNpmPackages(stagedPackages, publishedName, manifestContents.version);

                    if (overlappingStages.length > 0) {
                        didOverrideStaged = true;
                        for (const stageItem of overlappingStages) {
                            console.log(`Version ${manifestContents.version} of ${publishedName} is already staged on npmjs (stage ID: ${stageItem.id}). Overriding by deleting the older staged version.`);
                            if (isDryRun) {
                                console.log(`[dry-run] Would reject staged package ${stageItem.id}`);
                            }
                            else {
                                await rejectStagedNpmPackage(stageItem.id, registryEntry, wsPath);
                                console.log(`Deleted older staged package ${stageItem.id}.`);
                            }
                        }
                    }
                }

                // Pass `--no-include-workspace-root` defensively against `include-workspace-root=true` in `.npmrc`, which would otherwise target and publish the workspace root.
                // Pass `--loglevel=warn` to suppress verbose file-by-file tarball manifests (`npm notice`) while preserving errors and warnings.
                const subCommands = isNpmjsStaging ? ['stage', 'publish'] : ['publish'];
                const npmArgs = [...subCommands, '--tag', tag, '--access', registryEntry.access, '--no-include-workspace-root', '--loglevel=warn'];
                if (isDryRun) npmArgs.push('--dry-run');

                const publishedScope = publishedName.startsWith('@')
                    ? publishedName.slice(1, publishedName.indexOf('/'))
                    : (registryEntry.name === 'ghp') ? ghpScope : undefined;

                await spawnAuthNpmAsync(
                    npmArgs,
                    {
                        cwd:      stageDir,
                        ghpScope: publishedScope ?? ghpScope,
                        registryEntry,
                        stdio:    'inherit',
                    },
                );

                const stagedSuffix = isNpmjsStaging
                    ? ` [staged on npmjs${didOverrideStaged ? '; overridden older staged version' : ''}; pending onsite approval]`
                    : '';
                publishedRecords.push(`${publishedName}@${manifestContents.version} -> ${registryEntry.name} (${registryEntry.url})${stagedSuffix}`);
            }
            finally {
                await rm(stagingRoot, { force: true, recursive: true }); // Ephemeral cleanup.
            }
        }
    }

    console.log('\nPublished packages (in publishing order):');
    if (publishedRecords.length === 0) console.log('- (none)');
    else for (const record of publishedRecords) console.log(`- ${record}`);

    if (publishedRecords.some(record => record.includes('[staged on npmjs'))) {
        console.log('\nPackages staged on npmjs are held in the npm staging queue awaiting proof-of-presence (2FA).');
        console.log('Maintainers can approve and publish onsite at https://www.npmjs.com (Staged Packages tab) or via CLI with: `npm stage approve <stage-id>`.');
    }
}

await main(/* process.argv.slice(2) */);
