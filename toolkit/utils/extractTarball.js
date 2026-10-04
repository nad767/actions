import { mkdir } from 'node:fs/promises';

import { spawnAsync } from './spawnAsync.js';

/**
 * Extract one npm package tarball into a destination directory for content comparison.
 *
 * @param {{
 *     outDir: string,
 *     tarballPath: string,
 * }} options
 * @returns {Promise<void>}
 */
export async function extractTarball({
    outDir,
    tarballPath,
}) {
    await mkdir(outDir, { recursive: true });

    await spawnAsync(
        'tar',
        [
            // Use `-xf` (without `-z`) so tar automatically detects the compression format.
            // This allows it to handle both gzip-compressed tarballs (from registry) and uncompressed tarballs (from `@devcontainers/cli`).
            '-xf',
            tarballPath,
            '-C',
            outDir,
        ],
        { env: process.env },
    );
}
