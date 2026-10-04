import { DEFAULT_POLICY, SUPPORTED_POLICIES } from '../toolkit/config.js';
import { normalizeDebsConf } from '../toolkit/utils/normalizeDebsConf.js';
import { parseBoolean } from '../toolkit/utils/parseBoolean.js';
import { readJsonEnvVar } from '../toolkit/utils/readJsonEnvVar.js';
import { resolveDebConfigAsync } from '../toolkit/utils/resolveDebConfigAsync.js';
import { resolveSelectedDebsVersions } from '../toolkit/utils/resolveSelectedDebsVersions.js';
import { writeJsonToEnvVar } from '../toolkit/utils/writeJsonToEnvVar.js';
import { writeListToEnvVar } from '../toolkit/utils/writeListToEnvVar.js';
import { writeResolvedDebVersions } from '../toolkit/utils/writeResolvedDebVersions.js';

/**
 * Execute the Debian bundle version-resolution workflow.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const policy = process.env.VERSION_CONFLICT_POLICY ?? DEFAULT_POLICY;
    if (!SUPPORTED_POLICIES.has(policy)) throw new Error(`Unsupported conflict policy: ${policy}`);

    const rawTargets = readJsonEnvVar('TARGETS_JSON');
    if (!Array.isArray(rawTargets)) throw new TypeError('Debian publish config must be an array.');
    const normalizedTargets = rawTargets.map(rawDebConfig => normalizeDebsConf(rawDebConfig));
    const shouldMergePr = parseBoolean(process.env.MERGE_PR, true);
    const targetBundles = await Promise.all(normalizedTargets.map(async debConfig => resolveDebConfigAsync(debConfig)));
    const resolutions = await resolveSelectedDebsVersions(targetBundles, policy);

    const versionOkManifestPathsSet = new Set(
        resolutions.filter(({ headVersion, nextVersion }) => headVersion === nextVersion).map(({ bundle }) => bundle.manifestPath),
    );

    const versionBumpManifestPaths = resolutions.filter(({ headVersion, nextVersion }) => headVersion !== nextVersion).map(({ bundle }) => bundle.manifestPath);
    await writeListToEnvVar('GITHUB_OUTPUT', 'version_files', versionBumpManifestPaths);

    // Downstream build/publish steps only read `TARGETS_JSON`. When the version-bump PR will remain open in this run,
    // prune those bumped bundles out now so later steps can stay agnostic to conflict handling.
    await writeJsonToEnvVar(
        'GITHUB_ENV',
        'TARGETS_JSON',
        shouldMergePr
            ? rawTargets
            : rawTargets.filter(debConfig => versionOkManifestPathsSet.has(debConfig.manifestPath)),
    );

    if (versionBumpManifestPaths.length > 0) {
        console.debug('Updating publishable Debian bundle versions.');
        await writeResolvedDebVersions(resolutions);
    }
    else console.debug('No version bumps were required.');
}

await main();
