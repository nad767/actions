import path from 'node:path';

import { readJsonAsync } from '../../../scripts/utils/readJson.js';
import { ROOT_LOCKFILE_PATH } from './config.js';
import { getExternalPackagesFromEntrypoint } from './utils/getExternalPackagesFromEntrypoint.js';
import { getPinnedPackages } from './utils/getPinnedPackages.js';
import { installPackages } from './utils/installPackages.js';

/**
 * Runs the dependency preflight for a script entrypoint.
 *
 * Motivation: resolving the script from disk lets preflight follow local
 * imports recursively, which is necessary when external packages are only used
 * by helper modules beneath the entrypoint.
 *
 * @param {string[]} argv
 * @returns {Promise<void>}
 */
async function main(argv) {
    if (argv.length !== 1) throw new Error('Pass exactly one script entrypoint path.');

    const scriptEntrypointPath = path.resolve(argv[0]);
    const scriptExtPackages = await getExternalPackagesFromEntrypoint(scriptEntrypointPath);

    const lockfile = await readJsonAsync(ROOT_LOCKFILE_PATH);
    const pinnedPackages = getPinnedPackages(lockfile, scriptExtPackages);

    if (pinnedPackages.length > 0) {
        console.log(`Installing script dependencies: ${pinnedPackages.join(', ')}`);
    }

    await installPackages(pinnedPackages);
}

await main(process.argv.slice(2));
