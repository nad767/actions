import { mkdir } from 'node:fs/promises';

import { spawnAsync } from './spawnAsync.js';

/**
 * Extract one Debian package into a directory that includes both payload files and control metadata.
 *
 * @param {{ outDir: string, packagePath: string }} options
 * @returns {Promise<void>}
 */
export async function extractDeb({
    outDir,
    packagePath,
}) {
    await mkdir(outDir, { recursive: true });

    await spawnAsync(
        'dpkg-deb',
        [
            '--raw-extract',
            packagePath,
            outDir,
        ],
        { env: process.env },
    );
}
