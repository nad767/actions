import { modifyJsoncAsync } from './modifyJsoncAsync.js';

/**
 * Rewrite devcontainer feature metadata files with the resolved versions.
 *
 * @param {Array<{
 *     feature: Record<string, any>,
 *     headVersion: string,
 *     nextVersion: string,
 * }>} resolutions
 * @returns {Promise<void>}
 */
export async function writeResolvedDevcontainerFeatureVersions(resolutions) {
    await Promise.all(resolutions.map(async resolution => {
        if (resolution.headVersion === resolution.nextVersion) return;

        // `devcontainer-feature.json` officially supports JSONC (JSON with Comments).
        // Unlike native `JSON` utils, `modifyJsoncAsync` doesn't throw on JSONC comments, and performs an AST-level edit so the comments are preserved.
        await modifyJsoncAsync(
            resolution.feature.metadataFilePath,
            { version: resolution.nextVersion },
        );
    }));
}
