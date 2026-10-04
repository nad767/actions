import {
    cp,
    mkdir,
    rm,
    writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { getDebsArtifactsDir } from '../toolkit/utils/getDebsArtifactsDir.js';
import { normalizeDebsConf } from '../toolkit/utils/normalizeDebsConf.js';
import { normalizeDebTreeAsync } from '../toolkit/utils/normalizeDebTreeAsync.js';
import { readJsonEnvVar } from '../toolkit/utils/readJsonEnvVar.js';
import { resolveDebConfigAsync } from '../toolkit/utils/resolveDebConfigAsync.js';
import { spawnAsync } from '../toolkit/utils/spawnAsync.js';
import { stageDebBinWrappersAsync } from '../toolkit/utils/stageDebBinWrappersAsync.js';
import { stageDebLifecycleScriptsAsync } from '../toolkit/utils/stageDebLifecycleScriptsAsync.js';

/**
 * Build the selected Debian bundles into `.deb` artifacts.
 *
 * The package build step stages the reusable files under the configured shared
 * data root, materializes any declared `/usr/bin` wrappers, and keeps the
 * workflow YAML free from inline packaging shell.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const rawTargets = readJsonEnvVar('TARGETS_JSON');
    if (!Array.isArray(rawTargets)) throw new TypeError('Debian publish config must be an array.');
    const normalizedTargets = rawTargets.map(rawDebConfig => normalizeDebsConf(rawDebConfig));
    const targetBundles = await Promise.all(normalizedTargets.map(async debConfig => resolveDebConfigAsync(debConfig)));
    const outputDir = getDebsArtifactsDir();

    await mkdir(outputDir, { recursive: true });

    for (const targetBundle of targetBundles) {
        const packageRootDir = path.join(outputDir, targetBundle.packageName, 'pkgroot');
        await rm(packageRootDir, { force: true, recursive: true });

        const assetPath = path.join(outputDir, targetBundle.assetFileName);
        await rm(assetPath, { force: true, recursive: true });

        const debianControlDir = path.join(packageRootDir, 'DEBIAN');
        await mkdir(debianControlDir, { recursive: true });
        await writeFile(
            path.join(debianControlDir, 'control'),
            [
                `Package: ${targetBundle.packageName}`,
                `Version: ${targetBundle.version}`,
                `Section: ${targetBundle.section}`,
                `Priority: ${targetBundle.priority}`,
                `Architecture: ${targetBundle.architecture}`,
                `Maintainer: ${targetBundle.maintainer}`,
                `Depends: ${targetBundle.depends.join(', ')}`,
                `Description: ${targetBundle.description}`,
                '',
            ].join('\n'),
        );

        const installDir = path.join(packageRootDir, targetBundle.installRoot.replace(/^\//u, ''));
        await mkdir(path.dirname(installDir), { recursive: true });
        await cp(targetBundle.sourceDir, installDir, { recursive: true });
        await stageDebLifecycleScriptsAsync({ debianControlDir, installDir, sourceDir: targetBundle.sourceDir });
        await normalizeDebTreeAsync(installDir);

        if (targetBundle.binWrappers.length > 0) {
            const binDir = path.join(packageRootDir, 'usr', 'bin');
            await mkdir(binDir, { recursive: true });
            await stageDebBinWrappersAsync({ binDir, binWrappers: targetBundle.binWrappers, installRoot: targetBundle.installRoot });
            await normalizeDebTreeAsync(binDir);
        }

        console.log(`Building Debian package ${targetBundle.assetFileName}`);
        await spawnAsync(
            'dpkg-deb',
            [
                '--build',
                '--root-owner-group',
                packageRootDir,
                assetPath,
            ],
            {
                cwd:   path.dirname(outputDir),
                env:   process.env,
                stdio: 'inherit',
            },
        );
    }
}

await main();
