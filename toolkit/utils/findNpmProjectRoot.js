import path from 'node:path';

import { readJsonAsync } from './readJsonAsync.js';

/**
 * Locate the root directory of an npm project/workspace starting from a given directory.
 *
 * Motivation:
 * In npm workspaces, npm ignores `.npmrc` files located inside child workspace package directories (logging `npm warn config ignoring workspace config at ...`).
 * To ensure npm child processes pick up temporary project-level registry mappings and auth tokens,
 * `.npmrc` must be created/patched at the project/workspace root where the root `package.json` resides.
 *
 * @param {string} startDir Directory to start searching upward from.
 * @returns {Promise<string>} Path to the detected project or workspace root directory.
 */
export async function findNpmProjectRoot(startDir) {
    let currentDir = path.resolve(startDir);
    let topProjectDir = currentDir;

    while (true) {
        const manifestPath = path.join(currentDir, 'package.json');
        const manifest = await readJsonAsync(manifestPath).catch(() => null);

        if (manifest) {
            topProjectDir = currentDir;
            if (manifest.workspaces) {
                // Found the workspace root with `workspaces` declared.
                return currentDir;
            }
        }

        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
            // Reached filesystem root.
            break;
        }
        currentDir = parentDir;
    }

    return topProjectDir;
}
