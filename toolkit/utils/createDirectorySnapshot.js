import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { walkDirectory } from './walkDirectory.js';

/**
 * Create a stable content snapshot for all files under one directory.
 *
 * The snapshot intentionally ignores archive container bytes so callers can compare extracted package contents across different packagers.
 *
 * @param {string} rootDir
 * @returns {Promise<string>}
 */
export async function createDirectorySnapshot(rootDir) {
    const relativePaths = await walkDirectory(rootDir, '');
    const relativePathsSorted = relativePaths.toSorted((a, b) => a.localeCompare(b));
    const snapshotEntries = await Promise.all(
        relativePathsSorted.map(
            async relativePath => {
                const filePath = path.join(rootDir, relativePath);
                const fileStats = await stat(filePath);
                let fileContents = await readFile(filePath);

                // Strip the `gitHead` property from `package.json` and `devcontainer-feature.json` to prevent metadata-only differences from triggering rebuilds.
                if (relativePath === 'package.json' || relativePath === 'devcontainer-feature.json') {
                    try {
                        const json = JSON.parse(fileContents.toString('utf8'));
                        delete json.gitHead;
                        fileContents = Buffer.from(JSON.stringify(json, null, 2));
                    }
                    catch { /* Fall back to original contents on JSON syntax errors */ }
                }

                const contentHash = createHash('sha256').update(fileContents).digest('hex');
                const normalizedMode = fileStats.mode & 0o777;

                return `${relativePath}\0${normalizedMode}\0${contentHash}`;
            },
        ),
    );

    return snapshotEntries.join('\n');
}
