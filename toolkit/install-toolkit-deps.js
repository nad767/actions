import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { spawnAsync } from './utils/spawnAsync.js';

/**
 * Install the toolkit's own runtime npm dependencies.
 *
 * Motivation: Debian action should not pay the cost of installing all npm dependencies of all publishable npm workspaces, just to satisfy the action runtime.
 */
async function main() {
    // `TOOLKIT_PATH` is set by the composite action wrapper.
    const toolkitDir = process.env.TOOLKIT_PATH ?? path.dirname(fileURLToPath(import.meta.url));

    // Install only the toolkit's own runtime dependencies and stream npm output directly.
    // Note: not using my `spawnAuthNpmAsync` utility because for this part doesn't need to authenticate any private npm registry.
    await spawnAsync(
        'npm',
        ['ci'],
        {
            cwd:   toolkitDir,
            stdio: 'inherit',
        },
    );
}

await main();
