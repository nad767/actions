import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { collectJsFiles } from './collectJsFiles.js';
import { collectPublishSourcePaths } from './collectPublishSourcePaths.js';
import { rewriteInternalNpmPackageSpecifiers } from './rewriteInternalNpmPackageSpecifiers.js';

/**
 * Rewrite internal workspace package specifiers throughout staged publish files.
 *
 * Motivation: package manifest rewrites are not enough on their own because the emitted modules still contain import specifiers that point at the original workspace package names.
 *
 * TODO: perhaps this can be more easily resolved by defining aliases in the package manifest rewrites?
 *
 * @param {string} stagedPkgDir
 * @param {string[]} entrypoints
 * @param {Map<string, string>} pkgsNameMappings
 * @returns {Promise<void>}
 */
export async function rewriteStagedNpmPackagesSpecifiers(stagedPkgDir, entrypoints, pkgsNameMappings) {
    let filePaths;

    if (entrypoints?.length) {
        const publishSourcePaths = await collectPublishSourcePaths(stagedPkgDir, entrypoints);

        filePaths = publishSourcePaths
            .filter(relativePath => relativePath.endsWith('.js') || relativePath.endsWith('.mjs'))
            .map(relativePath => path.join(stagedPkgDir, relativePath));
    }
    else {
        filePaths = await collectJsFiles(stagedPkgDir);
    }

    await Promise.all(filePaths.map(async filePath => {
        const sourceText = await readFile(filePath, 'utf8');
        const rewrittenSourceText = rewriteInternalNpmPackageSpecifiers(sourceText, pkgsNameMappings);

        if (rewrittenSourceText !== sourceText) {
            await writeFile(filePath, rewrittenSourceText);
        }
    }));
}
