import { rm } from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_POLICY } from '../toolkit/config.js';
import { hasDevcontainerFeatureChanged } from '../toolkit/utils/hasDevcontainerFeatureChanged.js';
import { normalizeDevcontainerFeaturesConf } from '../toolkit/utils/normalizeDevcontainerFeaturesConf.js';
import { readJsonEnvVar } from '../toolkit/utils/readJsonEnvVar.js';
import { resolveDevcontainerFeatureConfigAsync } from '../toolkit/utils/resolveDevcontainerFeatureConfigAsync.js';
import { resolveSelectedDevcontainerFeaturesVersions } from '../toolkit/utils/resolveSelectedDevcontainerFeaturesVersions.js';
import { writeJsonToEnvVar } from '../toolkit/utils/writeJsonToEnvVar.js';

/**
 * Prune staged devcontainer features by comparing each candidate against the latest published version in GHCR, discarding unchanged ones.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const githubApiToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    if (!githubApiToken) throw new Error('Missing `GITHUB_TOKEN` or `GH_TOKEN`.');

    const featuresPublishDir = process.env.FEATURES_PUBLISH_DIR;
    if (!featuresPublishDir) throw new Error('Missing `FEATURES_PUBLISH_DIR`.');

    const rawTargets = readJsonEnvVar('TARGETS_JSON');
    if (!Array.isArray(rawTargets)) throw new TypeError('Devcontainer feature publish config must be an array.');
    const normalizedTargets = rawTargets.map(rawFeatureConfig => normalizeDevcontainerFeaturesConf(rawFeatureConfig));
    const targetFeatures = await Promise.all(normalizedTargets.map(async featureConfig => resolveDevcontainerFeatureConfigAsync(featureConfig)));

    // Resolve versions to find the comparison baseline for each target feature
    const versionResolutions = await resolveSelectedDevcontainerFeaturesVersions(targetFeatures, DEFAULT_POLICY);
    const highestPublishedVersions = new Map(versionResolutions.map(res => [res.feature.manifestPath, res.highestPublishedVersion]));
    const changedFeatures = [];

    // Compare each feature's staged directory with its published baseline
    for (const builtFeature of targetFeatures) {
        const highestPublishedVersion = highestPublishedVersions.get(builtFeature.manifestPath) ?? null;
        const stageDir = path.join(featuresPublishDir, path.basename(builtFeature.path));

        const { hasChanged, reason } = await hasDevcontainerFeatureChanged({
            apiToken:               githubApiToken,
            latestPublishedVersion: highestPublishedVersion,
            packageName:            builtFeature.packageName,
            stageDir,
        });

        console.debug(`${hasChanged ? 'Publishing' : 'Skipping'} \`${builtFeature.packageName}\`; ${reason}.`);

        if (hasChanged) {
            changedFeatures.push(builtFeature);
        }
        else {
            // Remove the pruned feature from the staging directory so it is omitted from publish.
            try { await rm(stageDir, { force: true, recursive: true }); }
            catch { /* Ignore removal errors */ }
        }
    }

    console.log('\nChanged devcontainer features:');
    if (changedFeatures.length === 0) console.log('- (none)');
    else for (const feature of changedFeatures) console.log(`- ${feature.packageName}`);

    const changedFeaturePaths = new Set(changedFeatures.map(feature => feature.path));
    const selectedTargets = rawTargets.filter(featureConfig => changedFeaturePaths.has(featureConfig.path));
    await writeJsonToEnvVar('GITHUB_ENV', 'TARGETS_JSON', selectedTargets);
}

await main();
