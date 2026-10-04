import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Create a plugin that copies publishable non-module assets into `dist`.
 *
 * Motivation: styles and other static assets are part of the published package surface but should be copied verbatim rather than passed through Rollup.
 *
 * @param {string} packageDir
 * @param {string} buildOutDir
 * @param {string[]} assetSourcePaths
 * @returns {import('vite').Plugin}
 */
export function copyPublishAssetsPlugin(packageDir, buildOutDir, assetSourcePaths) {
    return {
        name: 'copy-publish-assets',
        async writeBundle() {
            for (const relativePath of assetSourcePaths) {
                const sourcePath = path.join(packageDir, relativePath);
                const outputPath = path.join(packageDir, buildOutDir, relativePath);

                await mkdir(path.dirname(outputPath), { recursive: true });
                await cp(sourcePath, outputPath, { force: true });
            }
        },
    };
}
