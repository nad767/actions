import { DEFAULT_POLICY, SUPPORTED_POLICIES } from '../toolkit/config.js';
import { normalizeNpmsConf } from '../toolkit/utils/normalizeNpmsConf.js';
import { parseBoolean } from '../toolkit/utils/parseBoolean.js';
import { readJsonEnvVar } from '../toolkit/utils/readJsonEnvVar.js';
import { resolveNpmVersions } from '../toolkit/utils/resolveNpmVersions.js';
import { sortNpmsConfs } from '../toolkit/utils/sortNpmsConfs.js';
import { writeJsonToEnvVar } from '../toolkit/utils/writeJsonToEnvVar.js';
import { writeListToEnvVar } from '../toolkit/utils/writeListToEnvVar.js';
import { writeResolvedNpmVersions } from '../toolkit/utils/writeResolvedNpmVersions.js';

/**
 * Execute the version-resolution workflow.
 *
 * @param {string[]} argv
 * @returns {Promise<void>}
 */
async function main(/* argv */) {
    // `GITHUB_REPOSITORY` is injected automatically by GitHub Actions.
    const repoEnv = process.env.GITHUB_REPOSITORY ?? '';
    const [repoOwner] = repoEnv.split('/', 1);

    // `GHP_SCOPE` and `VERSION_CONFLICT_POLICY` are set in the reusable workflow job's env.
    const rawGhpScope = process.env.GHP_SCOPE ?? repoOwner ?? '';
    const ghpScope = rawGhpScope.replace(/^@/u, '');
    if (ghpScope && (ghpScope !== ghpScope.toLowerCase())) throw new Error(`GitHub Packages scope must be lowercase. Received "${rawGhpScope}".`);

    const policy = process.env.VERSION_CONFLICT_POLICY ?? DEFAULT_POLICY;
    if (!SUPPORTED_POLICIES.has(policy)) throw new Error(`Unsupported conflict policy: ${policy}`);

    const rawTargets = readJsonEnvVar('TARGETS_JSON');
    if (!Array.isArray(rawTargets)) throw new TypeError('npm publish config must be an array.');
    const normalizedTargets = sortNpmsConfs(rawTargets.map(rawNpmConfig => normalizeNpmsConf(rawNpmConfig)));
    const shouldMergePr = parseBoolean(process.env.MERGE_PR, true);

    const resolutions = await resolveNpmVersions(normalizedTargets, ghpScope, policy);

    const versionOkPackageDirs = resolutions.filter(({ headVersion, nextVersion }) => headVersion === nextVersion).map(({ pkgDir }) => pkgDir);
    const versionOkPackageDirsSet = new Set(versionOkPackageDirs);

    const versionBumpPackageDirs = resolutions.filter(({ headVersion, nextVersion }) => headVersion !== nextVersion).map(({ pkgDir }) => pkgDir);
    // `create-pull-request.add-paths` needs concrete file paths. Unlike the Debian and devcontainer lanes,
    // the npm lane also mutates `package-lock.json`, so the bumped package-dir list is not sufficient here.
    await writeListToEnvVar('GITHUB_OUTPUT', 'version_files', versionBumpPackageDirs.length > 0 ? ['package-lock.json', ...versionBumpPackageDirs.map(pkgDir => `${pkgDir}/package.json`)] : []);

    // Downstream steps only read `TARGETS_JSON`. When the version-bump PR will remain open in this run,
    // prune those bumped packages out now so publish can stay agnostic to conflict handling.
    await writeJsonToEnvVar(
        'GITHUB_ENV',
        'TARGETS_JSON',
        shouldMergePr
            ? rawTargets
            : rawTargets.filter(({ path }) => versionOkPackageDirsSet.has(path)),
    );

    if (versionBumpPackageDirs.length > 0) {
        console.debug('Updating publishable package versions and `package-lock.json`.');
        await writeResolvedNpmVersions(resolutions);
    }
    else console.debug('No version bumps were required.');
}

await main(/* process.argv.slice(2) */);
