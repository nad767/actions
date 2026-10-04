import { getGitHubRepository } from '../toolkit/utils/getGitHubRepository.js';
import { getPublishedContainerVersions } from '../toolkit/utils/getPublishedContainerVersions.js';
import { getPublishedDevcontainerFeatureGitHead } from '../toolkit/utils/getPublishedDevcontainerFeatureGitHead.js';
import { hasDevcontainerFeatureGitChanges } from '../toolkit/utils/hasDevcontainerFeatureGitChanges.js';
import { normalizeDevcontainerFeaturesConf } from '../toolkit/utils/normalizeDevcontainerFeaturesConf.js';
import { prunePackagesByGitDiff } from '../toolkit/utils/prunePackagesByGitDiff.js';
import { readJsonEnvVar } from '../toolkit/utils/readJsonEnvVar.js';
import { resolveDevcontainerFeatureConfigAsync } from '../toolkit/utils/resolveDevcontainerFeatureConfigAsync.js';
import { writeJsonToEnvVar } from '../toolkit/utils/writeJsonToEnvVar.js';

/**
 * Prune Devcontainer Features based on git differences against registry versions.
 *
 * This script identifies which Devcontainer features have changes to their source files
 * or manifests relative to the version currently published in the container registry.
 *
 * @returns {Promise<void>}
 */
async function main() {
    // Resolve GITHUB_WORKSPACE or fallback to current working directory.
    const wsPath = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const apiToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '';

    // Determine target namespace/owner for Devcontainer Features.
    const { owner: repoOwner } = getGitHubRepository();
    const namespace = process.env.NAMESPACE ?? repoOwner ?? '';
    if (namespace && (namespace !== namespace.toLowerCase())) {
        throw new Error(`GitHub Packages namespace must be lowercase. Received "${namespace}".`);
    }
    const [owner] = namespace.split('/');

    const rawTargets = readJsonEnvVar('TARGETS_JSON');
    if (!Array.isArray(rawTargets)) throw new TypeError('Devcontainer feature publish config must be an array.');
    const normalizedTargets = rawTargets.map(rawFeatureConfig => normalizeDevcontainerFeaturesConf(rawFeatureConfig));
    const packages = [];

    // Map feature configurations to the unified pruning format.
    for (const rawFeatureConfig of normalizedTargets) {
        const featureConfig = await resolveDevcontainerFeatureConfigAsync(rawFeatureConfig);

        packages.push({
            displayName:    featureConfig.packageName,
            fetchGitHead:   async (pkgName, ver) => getPublishedDevcontainerFeatureGitHead(pkgName, ver, apiToken),
            fetchVersions:  async pkgName => getPublishedContainerVersions(pkgName, { apiToken, owner }),
            hasGitChanges:  (gitRef, paths) => hasDevcontainerFeatureGitChanges({ cwd: wsPath, gitRef, trackedPaths: paths }),
            packageName:    featureConfig.packageName,
            rawConfig:      rawFeatureConfig,
            resolvedConfig: featureConfig,
            trackedPaths:   [featureConfig.path, featureConfig.manifestPath],
            version:        featureConfig.version,
        });
    }

    // Perform registry-driven Git diff pruning.
    const selected = await prunePackagesByGitDiff({ packages, wsPath });

    // Rewrite `TARGETS_JSON` to include only the selected features for publication.
    const selectedPaths = new Set(selected.map(pkg => pkg.resolvedConfig.path));
    const selectedTargets = rawTargets.filter(featureConfig => selectedPaths.has(featureConfig.path));
    await writeJsonToEnvVar('GITHUB_ENV', 'TARGETS_JSON', selectedTargets);
}

await main();
