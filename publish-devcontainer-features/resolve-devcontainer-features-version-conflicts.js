import { DEFAULT_POLICY, SUPPORTED_POLICIES } from '../toolkit/config.js';
import { normalizeDevcontainerFeaturesConf } from '../toolkit/utils/normalizeDevcontainerFeaturesConf.js';
import { parseBoolean } from '../toolkit/utils/parseBoolean.js';
import { readJsonEnvVar } from '../toolkit/utils/readJsonEnvVar.js';
import { resolveDevcontainerFeatureConfigAsync } from '../toolkit/utils/resolveDevcontainerFeatureConfigAsync.js';
import { resolveSelectedDevcontainerFeaturesVersions } from '../toolkit/utils/resolveSelectedDevcontainerFeaturesVersions.js';
import { writeJsonToEnvVar } from '../toolkit/utils/writeJsonToEnvVar.js';
import { writeListToEnvVar } from '../toolkit/utils/writeListToEnvVar.js';
import { writeResolvedDevcontainerFeatureVersions } from '../toolkit/utils/writeResolvedDevcontainerFeatureVersions.js';

async function main() {
    const policy = process.env.VERSION_CONFLICT_POLICY ?? DEFAULT_POLICY;
    if (!SUPPORTED_POLICIES.has(policy)) throw new Error(`Unsupported conflict policy: ${policy}`);

    const rawTargets = readJsonEnvVar('TARGETS_JSON');
    if (!Array.isArray(rawTargets)) throw new TypeError('Devcontainer feature publish config must be an array.');
    const featureConfigs = rawTargets.map(rawFeatureConfig => normalizeDevcontainerFeaturesConf(rawFeatureConfig));
    const shouldMergePr = parseBoolean(process.env.MERGE_PR, true);

    const targetFeatures = await Promise.all(featureConfigs.map(async featureConfig => resolveDevcontainerFeatureConfigAsync(featureConfig)));
    const resolutions = await resolveSelectedDevcontainerFeaturesVersions(targetFeatures, policy);

    const versionOkFeaturePathsSet = new Set(
        resolutions
            .filter(({ headVersion, nextVersion }) => headVersion === nextVersion)
            .map(({ feature }) => feature.path),
    );

    const versionBumpManifestPaths = resolutions
        .filter(({ headVersion, nextVersion }) => headVersion !== nextVersion)
        .map(({ feature }) => feature.manifestPath);
    await writeListToEnvVar('GITHUB_OUTPUT', 'version_files', versionBumpManifestPaths);

    // Downstream stage/publish steps only read `TARGETS_JSON`. When the version-bump PR will remain open in this run,
    // prune those bumped features out now so later steps can stay agnostic to conflict handling.
    await writeJsonToEnvVar(
        'GITHUB_ENV',
        'TARGETS_JSON',
        shouldMergePr
            ? rawTargets
            : rawTargets.filter(featureConfig => versionOkFeaturePathsSet.has(featureConfig.path)),
    );

    if (versionBumpManifestPaths.length > 0) {
        console.debug('Updating publishable devcontainer feature versions.');
        await writeResolvedDevcontainerFeatureVersions(resolutions);
    }
    else console.debug('No version bumps were required.');
}

await main();
