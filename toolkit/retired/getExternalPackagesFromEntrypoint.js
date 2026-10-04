import path from 'node:path';

import { collectExternalPackages } from './collectExternalPackages.js';

/**
 * Collect external package imports for a script entrypoint, following local
 * imports recursively so preflight installation covers transitive dependencies.
 *
 * Motivation:
 * Script entrypoints often delegate CLI parsing or other external package usage to nearby helpers,
 * and preflight needs to see those imports too.
 *
 * @param {string} entrypointPath Absolute or relative path to the script entrypoint.
 * @returns {Promise<string[]>}
 */
export async function getExternalPackagesFromEntrypoint(entrypointPath) {
    const visitedModulePaths = new Set();
    const externalPackages = new Set();

    await collectExternalPackages(path.resolve(entrypointPath), visitedModulePaths, externalPackages);

    return [...externalPackages];
}
