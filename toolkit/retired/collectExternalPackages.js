import { readFile } from 'node:fs/promises';

import { getPackageNameFromSpecifier } from './getPackageNameFromSpecifier.js';
import { resolveLocalImportPath } from './resolveLocalImportPath.js';

const IMPORT_SPECIFIER_PATTERN = /(?:^|\n)\s*import\s+(?:[\s\S]+?\s+from\s+)?['"]([^'"]+)['"]/g;

/**
 * Depth-first walk of local ESM imports rooted at `modulePath`.
 *
 * @param {string} modulePath
 * @param {Set<string>} visitedModulePaths
 * @param {Set<string>} externalPackages
 * @returns {Promise<void>}
 */
export async function collectExternalPackages(modulePath, visitedModulePaths, externalPackages) {
    if (visitedModulePaths.has(modulePath)) return;

    visitedModulePaths.add(modulePath);

    const moduleContents = await readFile(modulePath, 'utf8');
    const importSpecifiers = [...moduleContents.matchAll(IMPORT_SPECIFIER_PATTERN)].map(([, specifier]) => specifier);

    for (const specifier of importSpecifiers) {
        if (specifier.startsWith('node:')) continue;

        if (specifier.startsWith('.') || specifier.startsWith('/')) {
            const resolvedImportPath = resolveLocalImportPath(modulePath, specifier);
            await collectExternalPackages(resolvedImportPath, visitedModulePaths, externalPackages);
            continue;
        }

        externalPackages.add(getPackageNameFromSpecifier(specifier));
    }
}
