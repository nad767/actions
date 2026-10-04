import {
    cp,
    mkdir,
    readdir,
} from 'node:fs/promises';
import path from 'node:path';

const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const ROOT_NODE_MODULES_PATH = path.join(ROOT_DIR, 'node_modules');

/**
 * Copy installed modules from a staging `node_modules` directory into the repo root.
 * The helper script resolves packages from the repository root, so staged installs need to be surfaced there after npm finishes.
 *
 * @param {string} sourceNodeModulesPath
 * @returns {Promise<void>}
 */
export async function copyInstalledModulesToRoot(sourceNodeModulesPath) {
    await mkdir(ROOT_NODE_MODULES_PATH, { recursive: true });

    const installedEntries = await readdir(sourceNodeModulesPath);

    await Promise.all(
        installedEntries.map(entryName => cp(
            path.join(sourceNodeModulesPath, entryName),
            path.join(ROOT_NODE_MODULES_PATH, entryName),
            { recursive: true },
        )),
    );
}
