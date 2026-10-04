import path from 'node:path';

import { readJsoncAsync } from './readJsoncAsync.js';

/**
 * Resolve a normalized devcontainer feature config entry into its publish metadata.
 *
 * @param {{ manifestPath: string, path: string }} featureConfig
 * @returns {Promise<{
 *     id: string,
 *     manifestPath: string,
 *     metadataFilePath: string,
 *     packageName: string,
 *     path: string,
 *     releaseTag: string,
 *     releaseTagPrefix: string,
 *     version: string,
 * }>}
 */
export async function resolveDevcontainerFeatureConfigAsync(featureConfig) {
    // `devcontainer-feature.json` officially supports JSONC (JSON with Comments).
    // Unlike native `JSON` utils, `readJsoncAsync` doesn't throw on JSONC comments.
    const wsPath = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const metadataFilePath = path.join(wsPath, featureConfig.manifestPath);
    const manifest = await readJsoncAsync(metadataFilePath);

    if (typeof manifest.id !== 'string' || manifest.id.length === 0) {
        throw new TypeError(`Devcontainer feature metadata at ${featureConfig.manifestPath} is missing \`id\`.`);
    }

    if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
        throw new TypeError(`Devcontainer feature metadata at ${featureConfig.manifestPath} is missing \`version\`.`);
    }

    const releaseTagPrefix = `devcontainer-feature-${manifest.id}-v`;

    const namespaceParts = (process.env.NAMESPACE || '').split('/');
    const scope = namespaceParts.slice(1).join('/');
    const packageName = scope ? `${scope}/${manifest.id}` : manifest.id;

    return {
        id:           manifest.id,
        manifestPath: featureConfig.manifestPath,
        metadataFilePath,
        packageName,
        path:         featureConfig.path,
        releaseTag:   `${releaseTagPrefix}${manifest.version}`,
        releaseTagPrefix,
        version:      manifest.version,
    };
}
