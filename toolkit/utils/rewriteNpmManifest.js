import { rewriteNpmDependencyMap } from './rewriteNpmDependencyMap.js';
import { rewriteNpmManifestPaths } from './rewriteNpmManifestPaths.js';

/**
 * Rewrite a package manifest for a target publish registry entry.
 *
 * Motivation: the entry script should stay as the publish workflow's main orchestration method while this utility owns the manifest transformation.
 *
 * @param {Record<string, any>} manifestContents
 * @param {string} publishedName
 * @param {boolean} hasBuildStep
 * @param {string | undefined} buildOutDir
 * @param {Map<string, string>} pkgsNameMappings
 * @param {string} owner
 * @param {string} repo
 * @param {import('./npmRegistries.js').NpmRegistryEntry} registryEntry
 * @returns {Record<string, any>}
 */
export function rewriteNpmManifest(
    manifestContents,
    publishedName,
    hasBuildStep,
    buildOutDir,
    pkgsNameMappings,
    owner,
    repo,
    registryEntry,
) {
    if (hasBuildStep && ((typeof buildOutDir !== 'string') || (buildOutDir.length === 0))) {
        throw new Error(`Package ${manifestContents.name} is missing a configured \`buildOutDir\`.`);
    }

    return {
        ...manifestContents,

        files:         hasBuildStep ? [buildOutDir] : manifestContents.files,
        name:          publishedName,
        private:       undefined,
        publishConfig: {
            ...manifestContents.publishConfig,
            access:   registryEntry.access,
            registry: registryEntry.url,
        },
        repository: {
            type: 'git',
            url:  `git+https://github.com/${owner}/${repo}.git`,
        },

        dependencies:         rewriteNpmDependencyMap(manifestContents.dependencies, pkgsNameMappings),
        devDependencies:      rewriteNpmDependencyMap(manifestContents.devDependencies, pkgsNameMappings),
        optionalDependencies: rewriteNpmDependencyMap(manifestContents.optionalDependencies, pkgsNameMappings),
        peerDependencies:     rewriteNpmDependencyMap(manifestContents.peerDependencies, pkgsNameMappings),

        exports: hasBuildStep ? rewriteNpmManifestPaths(manifestContents.exports, buildOutDir) : manifestContents.exports,
        imports: hasBuildStep ? rewriteNpmManifestPaths(manifestContents.imports, buildOutDir) : manifestContents.imports,
        main:    hasBuildStep ? rewriteNpmManifestPaths(manifestContents.main, buildOutDir) : manifestContents.main,
        module:  hasBuildStep ? rewriteNpmManifestPaths(manifestContents.module, buildOutDir) : manifestContents.module,
        types:   hasBuildStep ? rewriteNpmManifestPaths(manifestContents.types, buildOutDir) : manifestContents.types,
    };
}
