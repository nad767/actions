import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { normalizeToPosixPath } from './normalizeToPosixPath.js';

/**
 * Recursively walk one publishable directory.
 *
 * Motivation: directories in package `files` must retain their internal layout
 * so subpath exports keep matching the generated `dist` tree.
 *
 * @param {string} packageDir
 * @param {string} relativeDirectory
 * @returns {Promise<string[]>}
 */
export async function walkDirectory(packageDir, relativeDirectory) {
    const absoluteDirectory = path.join(packageDir, relativeDirectory);
    const directoryEntries = await readdir(absoluteDirectory, { withFileTypes: true });
    const paths = [];

    for (const directoryEntry of directoryEntries) {
        const childRelativePath = normalizeToPosixPath(path.join(relativeDirectory, directoryEntry.name));

        if (directoryEntry.isDirectory()) {
            paths.push(...await walkDirectory(packageDir, childRelativePath));
            continue;
        }

        if (directoryEntry.isFile()) paths.push(childRelativePath);
    }

    return paths;
}
