import { stat } from 'node:fs/promises';
import path from 'node:path';

import { normalizeToPosixPath } from './normalizeToPosixPath.js';
import { walkDirectory } from './walkDirectory.js';

/**
 * Resolve the files that should end up in the published tarball.
 *
 * Motivation: package `files` already defines the intended public surface, so the publish build should derive its input set from that source of truth.
 *
 * @param {string} packageDir
 * @param {string[]} publishEntries
 * @returns {Promise<string[]>}
 */
export async function collectPublishSourcePaths(packageDir, publishEntries) {
    const sourcePaths = new Set();

    for (const publishEntry of publishEntries) {
        const sourceEntryPath = path.join(packageDir, publishEntry);
        // Files generated dynamically by lifecycle scripts (e.g. `prepack`) or optional entries might not exist on disk yet at this stage.
        const sourceEntryStats = await stat(sourceEntryPath).catch(err => {
            if (err?.code === 'ENOENT') return null;
            throw err;
        });
        if (!sourceEntryStats) continue;

        if (sourceEntryStats.isDirectory()) {
            const childPaths = await walkDirectory(packageDir, publishEntry);

            for (const childPath of childPaths) sourcePaths.add(childPath);

            continue;
        }

        sourcePaths.add(normalizeToPosixPath(publishEntry));
    }

    return [...sourcePaths].toSorted();
}
