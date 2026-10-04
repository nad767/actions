import path from 'node:path';

import { normalizeNpmsConf } from '../toolkit/utils/normalizeNpmsConf.js';
import { readJsonAsync } from '../toolkit/utils/readJsonAsync.js';
import { readJsonEnvVar } from '../toolkit/utils/readJsonEnvVar.js';
import { sortNpmsConfs } from '../toolkit/utils/sortNpmsConfs.js';
import { spawnAuthNpmAsync } from '../toolkit/utils/spawnAuthNpmAsync.js';

/**
 * Run `npm ci` for all publishable packages in the repository, so we can build them in upcoming steps.
 *
 * Supports both standalone packages (at the root or in a subdirectory) and monorepo workspace packages.
 *
 * @returns {Promise<void>}
 */
async function main() {
    // `GITHUB_WORKSPACE` is injected automatically by GitHub Actions.
    const wsPath = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const rawTargets = readJsonEnvVar('TARGETS_JSON');
    if (!Array.isArray(rawTargets)) throw new TypeError('npm publish config must be an array.');
    const normalizedTargets = sortNpmsConfs(rawTargets.map(rawNpmConfig => normalizeNpmsConf(rawNpmConfig)));

    const rootManifest = await readJsonAsync(path.join(wsPath, 'package.json')).catch(() => null);
    const isMonorepo = Boolean(rootManifest?.workspaces);

    const npmArgs = [
        'ci',
        '--legacy-peer-deps',
        '--ignore-scripts', // Suppresses lifecycle scripts (e.g. root `"postinstall": "monorepo-patch-package"`) which fail during partial workspace publishes because skipped packages (here, `monorepo-patch-package`) are omitted from `node_modules/.bin`. This is standard practice in monorepo tools like Turborepo, Nx, and Lerna, and is sound as long as target packages don't rely on `postinstall` compilation or unapplied patches to build (builds are run explicitly in `build-npm.js`).
    ];

    if (isMonorepo) {
        npmArgs.push('--include-workspace-root');

        for (const { path: pkgPath } of normalizedTargets) {
            const pkgManifestPath = path.join(wsPath, pkgPath, 'package.json');
            const pkgManifestContents = await readJsonAsync(pkgManifestPath);
            npmArgs.push('--workspace', pkgManifestContents.name);
        }
    }

    await spawnAuthNpmAsync(
        npmArgs,
        {
            cwd:   isMonorepo ? wsPath : path.join(wsPath, normalizedTargets[0]?.path ?? '.'),
            stdio: 'inherit',
        },
    );
}

await main();
