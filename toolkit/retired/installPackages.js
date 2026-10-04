import { spawn } from 'node:child_process';
import {
    mkdtemp,
    rm,
    writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { copyInstalledModulesToRoot } from './copyInstalledModulesToRoot.js';

const NPM_REGISTRY_URL = 'https://registry.npmjs.org';

/**
 * Install the provided packages without letting npm treat the repository
 * manifests as installation input.
 *
 * @param {string[]} packages
 * @returns {Promise<void>}
 */
export async function installPackages(packages) {
    if (packages.length === 0) {
        console.log('No external script dependencies detected.');
        return;
    }

    const stagingRoot = await mkdtemp(path.join(os.tmpdir(), 'repo-foo-script-deps-'));

    try {
        await writeFile(
            path.join(stagingRoot, 'package.json'),
            `${JSON.stringify({ name: 'repo-foo-script-deps', private: true }, null, 4)}\n`,
        );

        await new Promise((resolve, reject) => {
            const childProcess = spawn(
                'npm',
                ['install', '--ignore-scripts', '--package-lock=false', `--registry=${NPM_REGISTRY_URL}`, ...packages],
                {
                    cwd:   stagingRoot,
                    env:   process.env,
                    stdio: 'inherit',
                },
            );

            childProcess.on('exit', exitCode => {
                if (exitCode === 0) {
                    resolve();
                    return;
                }

                reject(new Error(`npm install failed with exit code ${exitCode}.`));
            });
            childProcess.on('error', reject);
        });

        await copyInstalledModulesToRoot(path.join(stagingRoot, 'node_modules'));
    }
    finally {
        await rm(stagingRoot, { force: true, recursive: true });
    }
}
