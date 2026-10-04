import path from 'node:path';

import { readJsonAsync } from './readJsonAsync.js';

/**
 * Resolve one Debian bundle config entry into the concrete metadata needed by the build and release scripts.
 *
 * This keeps the workflow config small while letting the scripts package own
 * its version and Debian control metadata independently from the npm packages.
 *
 * @param {{
 *     binWrappers: Array<{
 *         name: string,
 *         target: string,
 *     }>,
 *     installRoot: string,
 *     manifestPath: string,
 *     path: string,
 *     releaseTagPrefix: string,
 * }} debianBundleConfig
 * @returns {Promise<{
 *     architecture: string,
 *     assetFileName: string,
 *     binWrappers: Array<{
 *         name: string,
 *         target: string,
 *     }>,
 *     depends: string[],
 *     description: string,
 *     installRoot: string,
 *     latestAssetFileName: string,
 *     latestReleaseName: string,
 *     latestReleaseTag: string,
 *     maintainer: string,
 *     metadataFilePath: string,
 *     manifestPath: string,
 *     packageName: string,
 *     path: string,
 *     priority: string,
 *     releaseName: string,
 *     releaseTag: string,
 *     releaseTagPrefix: string,
 *     releaseTitle: string,
 *     section: string,
 *     sourceDir: string,
 *     version: string,
 * }>}
 */
export async function resolveDebConfigAsync(debianBundleConfig) {
    // `GITHUB_WORKSPACE` injected automatically by GitHub Actions.
    const wsPath = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const metadataFilePath = path.join(wsPath, debianBundleConfig.manifestPath);
    const metadata = await readJsonAsync(metadataFilePath);

    if ((typeof metadata.packageName !== 'string') || metadata.packageName.length === 0) {
        throw new TypeError(`Debian bundle metadata at ${debianBundleConfig.manifestPath} is missing \`packageName\`.`);
    }

    if ((typeof metadata.version !== 'string') || metadata.version.length === 0) {
        throw new TypeError(`Debian bundle metadata at ${debianBundleConfig.manifestPath} is missing \`version\`.`);
    }

    if ((typeof metadata.description !== 'string') || metadata.description.length === 0) {
        throw new TypeError(`Debian bundle metadata at ${debianBundleConfig.manifestPath} is missing \`description\`.`);
    }

    if ((typeof metadata.maintainer !== 'string') || metadata.maintainer.length === 0) {
        throw new TypeError(`Debian bundle metadata at ${debianBundleConfig.manifestPath} is missing \`maintainer\`.`);
    }

    if (!Array.isArray(metadata.depends) || metadata.depends.some(dependency => (typeof dependency !== 'string') || dependency.length === 0)) {
        throw new TypeError(`Debian bundle metadata at ${debianBundleConfig.manifestPath} has an invalid \`depends\` array.`);
    }

    const architecture = metadata.architecture ?? 'all';
    const releaseTitle = metadata.releaseTitle ?? metadata.packageName;

    return {
        architecture,
        assetFileName:       `${metadata.packageName}_${metadata.version}_${architecture}.deb`,
        binWrappers:         debianBundleConfig.binWrappers,
        depends:             metadata.depends,
        description:         metadata.description,
        installRoot:         debianBundleConfig.installRoot,
        latestAssetFileName: `${metadata.packageName}_latest_${architecture}.deb`,
        latestReleaseName:   `${releaseTitle} latest`,
        latestReleaseTag:    `${metadata.packageName}-latest`,
        maintainer:          metadata.maintainer,
        manifestPath:        debianBundleConfig.manifestPath,
        metadataFilePath,
        packageName:         metadata.packageName,
        path:                debianBundleConfig.path,
        priority:            metadata.priority ?? 'optional',
        releaseName:         `${releaseTitle} ${metadata.version}`,
        releaseTag:          `${debianBundleConfig.releaseTagPrefix}${metadata.version}`,
        releaseTagPrefix:    debianBundleConfig.releaseTagPrefix,
        releaseTitle,
        section:             metadata.section ?? 'devel',
        sourceDir:           path.join(wsPath, debianBundleConfig.path),
        version:             metadata.version,
    };
}
