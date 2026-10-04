import { readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Collect staged JavaScript files under one directory tree.
 *
 * Motivation: specifier rewriting only applies to emitted JavaScript modules, so the publish step should skip assets and package metadata files.
 *
 * @param {string} directoryPath
 * @returns {Promise<string[]>}
 */
export async function collectJsFiles(directoryPath) {
    const directoryEntries = await readdir(directoryPath, { withFileTypes: true });
    const filePaths = [];

    for (const directoryEntry of directoryEntries) {
        const entryPath = path.join(directoryPath, directoryEntry.name);

        if (directoryEntry.isDirectory()) {
            filePaths.push(...await collectJsFiles(entryPath));
            continue;
        }

        if (directoryEntry.isFile() && entryPath.endsWith('.js')) filePaths.push(entryPath);
    }

    return filePaths;
}
