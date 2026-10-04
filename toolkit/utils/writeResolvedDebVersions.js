import { writeFile } from 'node:fs/promises';

import { readJsonAsync } from './readJsonAsync.js';

/**
 * Rewrite Debian bundle metadata files with the resolved versions.
 *
 * @param {Array<{
 *     bundle: Record<string, any>,
 *     headVersion: string,
 *     nextVersion: string,
 * }>} resolutions
 * @returns {Promise<void>}
 */
export async function writeResolvedDebVersions(resolutions) {
    await Promise.all(resolutions.map(async resolution => {
        if (resolution.headVersion === resolution.nextVersion) return;

        const metadata = await readJsonAsync(resolution.bundle.metadataFilePath);
        metadata.version = resolution.nextVersion;
        await writeFile(resolution.bundle.metadataFilePath, `${JSON.stringify(metadata, null, 4)}\n`);
    }));
}
