import path from 'node:path';

import { readJsonSync } from './readJsonSync.js';

/**
 * Sort the normalized npm publish packages topologically so internal dependencies are before their dependants.
 *
 * Motivation: during dependency resolution, installation, and publication, packages with internal dependencies should be processed in a topological order to avoid missing dependency references.
 *
 * @param {Array<{ buildScript?: string, buildOutDir?: string, path: string }>} normalizedConfig
 * @returns {Array<{ buildScript?: string, buildOutDir?: string, path: string }>}
 */
export function sortNpmsConfs(normalizedConfig) {
    // `GITHUB_WORKSPACE` injected automatically by GitHub Actions.
    const wsPath = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const dependencyNamesByPackageName = new Map();
    const configByPackageName = new Map();
    const dependantsByPackageName = new Map();
    const indegreeByPackageName = new Map();
    const originalIndexByPackageName = new Map();

    // Resolve each listed directory to its published package name so dependency edges use manifest names.
    for (const [idx, packageConfig] of normalizedConfig.entries()) {
        const packageJsonPath = path.join(wsPath, packageConfig.path, 'package.json');
        const packageJsonContents = readJsonSync(packageJsonPath);

        if ((typeof packageJsonContents.name !== 'string') || packageJsonContents.name.length === 0) {
            throw new TypeError(`Publishable package ${packageConfig.path} must declare a non-empty package.json \`name\`.`);
        }

        if (configByPackageName.has(packageJsonContents.name)) {
            throw new TypeError(`Duplicate npm publish config entries resolve to package ${packageJsonContents.name}.`);
        }

        configByPackageName.set(packageJsonContents.name, packageConfig);
        dependencyNamesByPackageName.set(packageJsonContents.name, new Set([
            ...Object.keys(packageJsonContents.dependencies ?? {}),
            ...Object.keys(packageJsonContents.optionalDependencies ?? {}),
            ...Object.keys(packageJsonContents.peerDependencies ?? {}),
        ]));
        dependantsByPackageName.set(packageJsonContents.name, new Set());
        indegreeByPackageName.set(packageJsonContents.name, 0);
        originalIndexByPackageName.set(packageJsonContents.name, idx);
    }

    // Build a graph among only the listed publishable packages, then sort it topologically.
    for (const [packageName, dependencyNames] of dependencyNamesByPackageName) {
        for (const dependencyName of dependencyNames) {
            if (!configByPackageName.has(dependencyName) || (dependencyName === packageName)) continue;
            dependantsByPackageName.get(dependencyName).add(packageName);
            indegreeByPackageName.set(packageName, indegreeByPackageName.get(packageName) + 1);
        }
    }

    let readyPackageNames = configByPackageName
        .keys()
        .filter(packageName => indegreeByPackageName.get(packageName) === 0)
        .toArray()
        .toSorted((packageNameA, packageNameB) => originalIndexByPackageName.get(packageNameA) - originalIndexByPackageName.get(packageNameB));
    const orderedConfig = [];

    // Preserve the original relative order for unrelated packages while ensuring dependencies come first.
    while (readyPackageNames.length > 0) {
        const packageName = readyPackageNames.shift();
        orderedConfig.push(configByPackageName.get(packageName));

        for (const dependantPackageName of dependantsByPackageName.get(packageName)) {
            indegreeByPackageName.set(dependantPackageName, indegreeByPackageName.get(dependantPackageName) - 1);

            if (indegreeByPackageName.get(dependantPackageName) === 0) {
                readyPackageNames = [...readyPackageNames, dependantPackageName]
                    .toSorted((packageNameA, packageNameB) => originalIndexByPackageName.get(packageNameA) - originalIndexByPackageName.get(packageNameB));
            }
        }
    }

    if (orderedConfig.length !== normalizedConfig.length) {
        const cyclicPackageNames = indegreeByPackageName.entries()
            .filter(([, indegree]) => indegree > 0)
            .map(([packageName]) => packageName)
            .toArray()
            .toSorted((a, b) => a.localeCompare(b));

        throw new Error(`npm publish config contains a dependency cycle among listed packages: ${cyclicPackageNames.join(', ')}`);
    }

    return orderedConfig;
}
