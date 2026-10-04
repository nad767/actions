import { writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Stage `/usr/bin` wrapper scripts for the package's public commands.
 *
 * The real payload stays under the package's shared-data install root so helper
 * scripts can remain colocated, while the wrapper makes the command available
 * on the default system `PATH`.
 *
 * @param {{
 *     binWrappers: Array<{
 *         name: string,
 *         target: string,
 *     }>,
 *     installRoot: string,
 *     binDir: string,
 * }} options
 * @returns {Promise<void>}
 */
export async function stageDebBinWrappersAsync({ binDir, binWrappers, installRoot }) {
    for (const binWrapper of binWrappers) {
        const wrapperPath = path.join(binDir, binWrapper.name);
        const wrappedCommandPath = path.posix.join(installRoot, binWrapper.target);

        await writeFile(
            wrapperPath,
            [
                '#!/usr/bin/env bash',
                '',
                'set -euo pipefail',
                '',
                `exec "${wrappedCommandPath}" "$@"`,
                '',
            ].join('\n'),
        );
    }
}
