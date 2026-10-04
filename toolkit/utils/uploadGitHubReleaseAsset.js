import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { githubApi } from './githubApi.js';

/**
 * Upload one binary asset to a GitHub release.
 *
 * @param {{
 *     apiToken: string,
 *     assetFileNameOverride?: string,
 *     assetPath: string,
 *     contentType: string,
 *     uploadUrlTemplate: string,
 * }} options
 * @returns {Promise<any>}
 */
export async function uploadGitHubReleaseAsset({
    apiToken,
    assetFileNameOverride,
    assetPath,
    contentType,
    uploadUrlTemplate,
}) {
    const assetFileName = assetFileNameOverride ?? path.basename(assetPath);
    const uploadUrl = new URL(uploadUrlTemplate.replace('{?name,label}', ''));
    uploadUrl.searchParams.set('name', assetFileName);

    const assetContents = await readFile(assetPath);

    return await githubApi({
        apiPath: uploadUrl.href,
        apiToken,
        body:    assetContents,
        headers: {
            'Content-Length': String(assetContents.byteLength),
            'Content-Type':   contentType,
        },
        isRawBody: true,
        method:    'POST',
    });
}
