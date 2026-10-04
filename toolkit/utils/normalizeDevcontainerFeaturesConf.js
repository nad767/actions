/**
 * Normalize one raw devcontainer feature publish config entry.
 *
 * @param {any} rawFeatureConfig
 * @returns {{ manifestPath: string, path: string }}
 */
export function normalizeDevcontainerFeaturesConf(rawFeatureConfig) {
    if (typeof rawFeatureConfig?.path !== 'string' || rawFeatureConfig.path.length === 0) {
        throw new TypeError('Each devcontainer feature publish config entry must include a non-empty `path`.');
    }

    if (rawFeatureConfig.manifestPath !== undefined && (typeof rawFeatureConfig.manifestPath !== 'string' || rawFeatureConfig.manifestPath.length === 0)) {
        throw new TypeError('Each devcontainer feature publish config entry has an invalid `manifestPath`.');
    }

    return {
        manifestPath: rawFeatureConfig.manifestPath ?? `${rawFeatureConfig.path}/devcontainer-feature.json`,
        path:         rawFeatureConfig.path,
    };
}
