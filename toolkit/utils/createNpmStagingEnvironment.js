import {
    cp,
    mkdtemp,
    readdir,
    symlink,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Create a temporary staging root directory with monorepo root-level files and directories copied into it.
 *
 * Motivation: Copying root-level monorepo files and directories into staging ensures that lifecycle
 * scripts referencing root files via relative paths (e.g. `"prepack": "cp ../../README.md ."`) maintain
 * full monorepo context while providing complete filesystem isolation from the actual working tree.
 *
 * @param {object} options
 * @param {string[]} [options.excludeNames=['.git']] Directory or file names to exclude from copying.
 * @param {string} [options.prefix='npm-staging-'] Temporary directory prefix (e.g. 'publish-npm' or 'prune-npm-by-build-diff').
 * @param {Array<{ path: string }>} [options.targets=[]] Publish targets whose parent root directories must not be copied at the root level.
 * @param {string} [options.wsPath] Root workspace directory.
 * @returns {Promise<string>} Path to the created temporary staging root directory.
 */
export async function createNpmStagingEnvironment({
    excludeNames = ['.git'],
    prefix = 'npm-staging-',
    targets = [],
    wsPath = process.env.GITHUB_WORKSPACE ?? process.cwd(),
}) {
    const tempDirPrefix = path.join(os.tmpdir(), prefix.endsWith('-') ? prefix : `${prefix}-`);
    const stagingRoot = await mkdtemp(tempDirPrefix);

    // Root-level directories that contain publishable packages (e.g. 'packages' or 'libs') must NOT be copied at the root level.
    // Each target package is individually staged into its specific path (e.g. `stagingRoot/packages/core`).
    const targetRootDirs = targets
        .map(target => target.path?.split(/[\\/]/u, 1)?.[0])
        .filter(Boolean);

    const rootEntries = await readdir(wsPath, { withFileTypes: true });
    const excludeSet = new Set([...excludeNames, ...targetRootDirs]);

    await Promise.all(
        rootEntries
            .filter(entry => !excludeSet.has(entry.name))
            .map(async entry => {
                const srcPath = path.join(wsPath, entry.name);
                const destPath = path.join(stagingRoot, entry.name);

                // Copy root files/directories directly to ensure complete filesystem isolation from the workspace. `node_modules` is an exception due to its typical volume and rarely being targeted to life-cycle scripts.
                if (entry.name === 'node_modules') {
                    await symlink(srcPath, destPath, 'junction').catch(() => { /* noop */ });
                    return;
                }
                await cp(srcPath, destPath, { recursive: true });
            }),
    );

    return stagingRoot;
}
