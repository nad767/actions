import path from 'node:path';

import { normalizeNpmsConf } from '../toolkit/utils/normalizeNpmsConf.js';
import { readJsonAsync } from '../toolkit/utils/readJsonAsync.js';
import { readJsonEnvVar } from '../toolkit/utils/readJsonEnvVar.js';
import { sortNpmsConfs } from '../toolkit/utils/sortNpmsConfs.js';
import { spawnAuthNpmAsync } from '../toolkit/utils/spawnAuthNpmAsync.js';

/**
 * Build each publishable workspace package through its own package-local build script.
 *
 * Supports both standalone packages (at the root or in a subdirectory) and monorepo workspace packages.
 *
 * Motivation: the root workflow should only orchestrate package publication,
 * while each package remains free to define and evolve its own publish build.
 *
 * @returns {Promise<void>}
 */
async function main() {
    // `GITHUB_WORKSPACE` injected automatically by GitHub Actions.
    const wsPath = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const rawTargets = readJsonEnvVar('TARGETS_JSON');
    if (!Array.isArray(rawTargets)) throw new TypeError('npm publish config must be an array.');
    const normalizedTargets = sortNpmsConfs(rawTargets.map(rawNpmConfig => normalizeNpmsConf(rawNpmConfig)));

    const rootManifest = await readJsonAsync(path.join(wsPath, 'package.json')).catch(() => null);
    const isMonorepo = Boolean(rootManifest?.workspaces);

    for (const { buildScript, path: pkgDir } of normalizedTargets) {
        const pkgManifestPath = path.join(wsPath, pkgDir, 'package.json');
        const pkgManifestContents = await readJsonAsync(pkgManifestPath);

        if (!buildScript) {
            console.log(`Skipping \`${pkgManifestContents.name}\` from ${pkgDir} (no build script configured)`);
            continue;
        }

        console.log(`Building \`${pkgManifestContents.name}\` from ${pkgDir}`);

        const npmArgs = ['run', buildScript];

        const isWorkspace = isMonorepo && (pkgDir !== '.') && (pkgDir !== '');
        if (isWorkspace) {
            npmArgs.push(
                '--workspace',
                pkgManifestContents.name,
                '--no-include-workspace-root',
            );
        }

        // Run the package-local build script with inherited stdio so workflow logs stay transparent.
        // Pass `--no-include-workspace-root` defensively against `include-workspace-root=true` in `.npmrc`, which would otherwise also invoke the build script against the workspace root.
        await spawnAuthNpmAsync(
            npmArgs,
            {
                cwd:   isWorkspace ? wsPath : path.join(wsPath, pkgDir),
                stdio: 'inherit',
            },
        );
    }
}

await main();
