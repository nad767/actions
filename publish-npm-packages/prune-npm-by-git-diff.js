import path from 'node:path';

import { getGitHubRepository } from '../toolkit/utils/getGitHubRepository.js';
import { getHighestSemverVersion } from '../toolkit/utils/getHighestSemverVersion.js';
import { getPublishedNpmGitHead } from '../toolkit/utils/getPublishedNpmGitHead.js';
import { getPublishedNpmVersions } from '../toolkit/utils/getPublishedNpmVersions.js';
import { hasTrackedPathsChangedSinceGitRef } from '../toolkit/utils/hasTrackedPathsChangedSinceGitRef.js';
import { isGitShaValid } from '../toolkit/utils/isGitShaValid.js';
import { normalizeNpmsConf } from '../toolkit/utils/normalizeNpmsConf.js';
import { readJsonAsync } from '../toolkit/utils/readJsonAsync.js';
import { readJsonEnvVar } from '../toolkit/utils/readJsonEnvVar.js';
import { rewriteNpmPackageName } from '../toolkit/utils/rewriteNpmPackageName.js';
import { sortNpmsConfs } from '../toolkit/utils/sortNpmsConfs.js';
import { writeJsonToEnvVar } from '../toolkit/utils/writeJsonToEnvVar.js';

/**
 * Prune NPM packages based on git differences against registry versions.
 *
 * This script identifies which NPM packages have source code modifications since their
 * last published version or are missing from any of their configured target registries.
 *
 * @returns {Promise<void>}
 */
async function main() {
    // Resolve GITHUB_WORKSPACE or fallback to current working directory.
    const wsPath = process.env.GITHUB_WORKSPACE ?? process.cwd();

    // Determine target GitHub Packages scope for NPM packages.
    const { owner: repoOwner } = getGitHubRepository();
    const rawGhpScope = process.env.GHP_SCOPE ?? repoOwner ?? '';
    const ghpScope = rawGhpScope.replace(/^@/u, '');
    if (ghpScope && (ghpScope !== ghpScope.toLowerCase())) {
        throw new Error(`GitHub Packages scope must be lowercase. Received "${rawGhpScope}".`);
    }

    const rawTargets = readJsonEnvVar('TARGETS_JSON');
    if (!Array.isArray(rawTargets)) throw new TypeError('npm publish config must be an array.');
    const normalizedTargets = sortNpmsConfs(rawTargets.map(rawNpmConfig => normalizeNpmsConf(rawNpmConfig)));
    const rawConfigByPath = new Map(rawTargets.map(rawNpmConfig => [rawNpmConfig.path, rawNpmConfig]));

    const selectedTargets = [];

    // Construct the structured packages list from raw NPM configuration.
    for (const target of normalizedTargets) {
        const { path: pkgDir, registryEntries = [] } = target;
        const packageJsonPath = path.join(wsPath, pkgDir, 'package.json');
        const packageJson = await readJsonAsync(packageJsonPath);

        let needsPublish = false;

        for (const registryEntry of registryEntries) {
            const publishedName = rewriteNpmPackageName(packageJson.name, {
                defaultScope: (registryEntry.name === 'ghp') ? ghpScope : undefined,
                registryName: registryEntry.name,
                targetConfig: target,
            });

            const publishedVersions = [...new Set(await getPublishedNpmVersions(publishedName, registryEntry, wsPath))];
            const highestPublishedVersion = getHighestSemverVersion(publishedVersions);
            const isCurrentVersionPublished = publishedVersions.includes(packageJson.version);
            const versionToCompare = isCurrentVersionPublished ? packageJson.version : highestPublishedVersion;

            if (!versionToCompare) {
                console.log(`Selecting \`${packageJson.name}\` (${publishedName}); no previous published version exists on registry "${registryEntry.name}".`);
                needsPublish = true;
                break;
            }

            const gitHead = await getPublishedNpmGitHead(publishedName, versionToCompare, registryEntry, wsPath);
            if (!gitHead) {
                console.log(`Selecting \`${packageJson.name}\` (${publishedName}); no \`gitHead\` metadata found for version ${versionToCompare} on registry "${registryEntry.name}".`);
                needsPublish = true;
                break;
            }

            if (!isGitShaValid(wsPath, gitHead)) {
                console.log(`Selecting \`${packageJson.name}\` (${publishedName}); commit ${gitHead} from registry "${registryEntry.name}" is missing locally.`);
                needsPublish = true;
                break;
            }

            const hasChanges = hasTrackedPathsChangedSinceGitRef({ cwd: wsPath, gitRef: gitHead, trackedPaths: [pkgDir] });
            if (hasChanges) {
                console.log(`Selecting \`${packageJson.name}\` (${publishedName}); tracked files changed since version ${versionToCompare} (${gitHead}) on registry "${registryEntry.name}".`);
                needsPublish = true;
                break;
            }

            console.log(`Tracked files for \`${packageJson.name}\` (${publishedName}) match published version ${versionToCompare} on registry "${registryEntry.name}".`);
        }

        if (needsPublish) {
            selectedTargets.push(rawConfigByPath.get(pkgDir));
        }
        else {
            console.log(`Skipping \`${packageJson.name}\`; all configured registries (${registryEntries.map(r => r.name).join(', ')}) are up to date.`);
        }
    }

    await writeJsonToEnvVar('GITHUB_ENV', 'TARGETS_JSON', selectedTargets);
}

await main();
