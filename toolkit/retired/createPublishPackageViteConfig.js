import path from 'node:path';

import { collectDeps } from './collectDeps.js';
import { collectPublicModuleEntrySourcePaths } from './collectPublicModuleEntrySourcePaths.js';
import { collectPublishSourcePaths } from './collectPublishSourcePaths.js';
import { copyPublishAssetsPlugin } from './copyPublishAssetsPlugin.js';
import { isExternalPackageSpecifier } from './isExternalPackageSpecifier.js';
import { isModuleSourceFile } from './isModuleSourceFile.js';
import { normalizeNpmsConf } from './normalizeNpmsConf.js';
import { readJsonAsync } from './readJsonAsync.js';
import { readJsonEnvVar } from './readJsonEnvVar.js';
import { sortNpmsConfs } from './sortNpmsConfs.js';

/**
 * Create a Vite config that transpiles a publishable package into `dist`.
 *
 * Motivation:
 * Published packages need plain JavaScript ESM entrypoints.
 * This utility lets you define a dedicated Vite build config within each package, instead of coupling it to a single root-level transpiler.
 *
 * TODO: consider simplifying by deleting this utility, and instead just importing the following boilerplate from some shared file into the `vite.config.js` of every package that needs a build step.
 *
 * @param {string} packageDir Absolute path to the package directory.
 * @returns {Promise<import('vite').UserConfig>}
 */
export async function createPublishPackageViteConfig(packageDir) {
    const manifestPath = path.join(packageDir, 'package.json');
    const manifestContents = await readJsonAsync(manifestPath);
    const rawTargets = readJsonEnvVar('TARGETS_JSON');
    if (!Array.isArray(rawTargets)) throw new TypeError('npm publish config must be an array.');
    const normalizedTargets = sortNpmsConfs(rawTargets.map(rawNpmConfig => normalizeNpmsConf(rawNpmConfig)));

    const packageConfig = normalizedTargets.find(({ path: pkgDir }) => pkgDir === path.relative(process.env.GITHUB_WORKSPACE ?? process.cwd(), packageDir)); // `GITHUB_WORKSPACE` injected automatically by GitHub Actions.
    if (!packageConfig) throw new Error(`Package at ${packageDir} is not configured in the npm publish workflow config.`);
    if (!packageConfig.buildScript || !packageConfig.buildOutDir) throw new Error(`Package at ${packageDir} must declare both \`buildScript\` and \`buildOutDir\` in the npm publish workflow config.`);

    const publishEntries = manifestContents.files;
    if (!Array.isArray(publishEntries) || (publishEntries.length === 0)) {
        throw new Error(`Package at ${packageDir} does not declare any publishable files.`);
    }

    const publishSourcePaths = await collectPublishSourcePaths(packageDir, publishEntries);
    const assetSourcePaths = publishSourcePaths.filter(relativePath => !isModuleSourceFile(relativePath));
    const publicModuleEntrySourcePaths = collectPublicModuleEntrySourcePaths(manifestContents, publishSourcePaths);
    if (publicModuleEntrySourcePaths.length === 0) throw new Error(`Package at ${packageDir} does not declare any public JavaScript entrypoints.`);

    const externalPackageNames = collectDeps(manifestContents);

    /** @type {import('vite').UserConfig} */
    return {
        appType: 'custom',
        build:   {
            copyPublicDir:        false,
            emptyOutDir:          true,
            minify:               false,
            outDir:               path.join(packageDir, packageConfig.buildOutDir),
            reportCompressedSize: false,
            rolldownOptions:      {
                external: specifier => isExternalPackageSpecifier(specifier, externalPackageNames),
                input:    publicModuleEntrySourcePaths.map(relativePath => path.join(packageDir, relativePath)),
                output:   {
                    assetFileNames:      '[name][extname]',
                    chunkFileNames:      '[name].js',
                    entryFileNames:      '[name].js',
                    format:              'esm',
                    preserveModules:     true,
                    preserveModulesRoot: packageDir,
                },
                preserveEntrySignatures: 'strict',
                treeshake:               false,
            },
            sourcemap: false,
            target:    'es2023',
        },
        esbuild: {
            jsx: 'automatic',
        },
        plugins: [copyPublishAssetsPlugin(packageDir, packageConfig.buildOutDir, assetSourcePaths)],
        resolve: {
            alias:            [{ find: '#root', replacement: packageDir }],
            preserveSymlinks: true,
        },
        root: packageDir,
    };
}
