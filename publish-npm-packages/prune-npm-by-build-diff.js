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
import { getHighestSemverVersion } from '../toolkit/utils/getHighestSemverVersion.js';
import { getPublishedNpmVersions } from '../toolkit/utils/getPublishedNpmVersions.js';
import { hasNpmPackageChanged } from '../toolkit/utils/hasNpmPackageChanged.js';
import { normalizeNpmsConf } from '../toolkit/utils/normalizeNpmsConf.js';
import { readJsonAsync } from '../toolkit/utils/readJsonAsync.js';
import { readJsonEnvVar } from '../toolkit/utils/readJsonEnvVar.js';
import { rewriteNpmManifest } from '../toolkit/utils/rewriteNpmManifest.js';
import { rewriteStagedNpmPackagesSpecifiers } from '../toolkit/utils/rewriteStagedNpmPackagesSpecifiers.js';
import { sortNpmsConfs } from '../toolkit/utils/sortNpmsConfs.js';
import { writeJsonToEnvVar } from '../toolkit/utils/writeJsonToEnvVar.js';

/**
 * Compare the built publish artifacts against the latest published versions and persist only changed package configs.
 *
 * @returns {Promise<void>}
 */
async function main() {
    // `GITHUB_WORKSPACE` injected automatically by GitHub Actions.
    const wsPath = process.env.GITHUB_WORKSPACE ?? process.cwd();

    const rootManifestPath = path.join(wsPath, 'package.json');
    const rootManifestContents = await readJsonAsync(rootManifestPath).catch(() => ({})); // The root directory might not have a `package.json` (for example the package being published in a subdir). Catch an exception so that we don't fail the job over this.

    // `GITHUB_REPOSITORY` is injected automatically by GitHub Actions.
    const repoEnv = process.env.GITHUB_REPOSITORY ?? '';
    const [repoOwner, repoName] = repoEnv.split('/', 2);

    // `GHP_SCOPE` is set in the reusable workflow job's env.
    const rawGhpScope = process.env.GHP_SCOPE ?? repoOwner ?? '';
    const ghpScope = rawGhpScope.replace(/^@/u, '');
    if (ghpScope && (ghpScope !== ghpScope.toLowerCase())) {
        throw new Error(`GitHub Packages scope must be lowercase. Received "${rawGhpScope}".`);
    }

    const owner = repoOwner ?? rootManifestContents.author;
    if (!owner) throw new Error('Missing GitHub repository owner. GitHub Actions should set `GITHUB_REPOSITORY`, or the root manifest must declare `author`.');

    const repo = repoName ?? rootManifestContents.name;
    if (!repo) throw new Error('Missing GitHub repository name. GitHub Actions should set `GITHUB_REPOSITORY`, or the root manifest must declare `name`.');

    const rawTargets = readJsonEnvVar('TARGETS_JSON');
    if (!Array.isArray(rawTargets)) throw new TypeError('npm publish config must be an array.');
    const normalizedTargets = sortNpmsConfs(rawTargets.map(rawNpmConfig => normalizeNpmsConf(rawNpmConfig)));

    // Rewrite names against the full publishable graph (`packageConfigs`) even when the current run only publishes a filtered subset, otherwise downstream packages can leak unre-written internal references for pruned dependencies.
    const rawAllTargets = readJsonEnvVar('ALL_TARGETS_JSON');
    if (!Array.isArray(rawAllTargets)) throw new TypeError('npm publish config must be an array.');
    const normalizedAllTargets = sortNpmsConfs(rawAllTargets.map(rawNpmConfig => normalizeNpmsConf(rawNpmConfig)));

    const changedPkgDirs = [];

    for (const { buildOutDir, buildScript, path: pkgDir, registryEntries } of normalizedTargets) {
        const srcDir = path.join(wsPath, pkgDir);
        const manifestPath = path.join(srcDir, 'package.json');
        const manifestContents = await readJsonAsync(manifestPath);
        const hasBuildStep = Boolean(buildScript);

        if (hasBuildStep) {
            const distPath = path.join(srcDir, buildOutDir);
            await access(distPath)
                .catch(() => { throw new Error(`Package \`${manifestContents.name}\` is missing \`${buildOutDir}\`. Run its \`${buildScript}\` script first.`); });
        }

        let isPackageChanged = false;

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

            const stagingRoot = await createNpmStagingEnvironment({
                prefix:  'prune-npm-by-build-diff',
                targets: normalizedAllTargets,
                wsPath,
            });

            try {
                const stageDir = path.join(stagingRoot, pkgDir);
                await mkdir(path.dirname(stageDir), { recursive: true });
                await cp(srcDir, stageDir, { recursive: true });

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
                const packageJsonContents = `${JSON.stringify(rewrittenManifest, null, 4)}\n`;
                await writeFile(path.join(stageDir, 'package.json'), packageJsonContents);

                const publishedVersions = [...new Set(await getPublishedNpmVersions(publishedName, registryEntry, stageDir))];
                const highestPublishedVersion = getHighestSemverVersion(publishedVersions); // TODO: consider just comparing against `latest`.

                if (highestPublishedVersion === null) {
                    console.debug(`Publishing \`${publishedName}\` to registry "${registryEntry.name}"; no published versions exist yet.`);
                    isPackageChanged = true;
                    break;
                }

                const { hasChanged, reason } = await hasNpmPackageChanged({
                    latestPublishedVersion: highestPublishedVersion,
                    publishedName,
                    registryEntry,
                    stageDir,
                });

                console.debug(`${hasChanged ? 'Publishing' : 'Skipping'} \`${publishedName}\` for registry "${registryEntry.name}"; ${reason}.`);

                if (hasChanged) {
                    isPackageChanged = true;
                    break;
                }
            }
            finally {
                await rm(stagingRoot, { force: true, recursive: true });
            }
        }

        if (isPackageChanged) changedPkgDirs.push(pkgDir);
    }

    const changedPkgDirsSet = new Set(changedPkgDirs);
    const selectedTargets = rawTargets.filter(({ path: pkgDir }) => changedPkgDirsSet.has(pkgDir));

    console.log('\nModified-build package dirs:');
    if (changedPkgDirs.length === 0) console.log('- (none)');
    else for (const pkgDir of changedPkgDirs) console.log(`- ${pkgDir}`);

    await writeJsonToEnvVar('GITHUB_ENV', 'TARGETS_JSON', selectedTargets);
}

await main();
