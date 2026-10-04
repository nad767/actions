import {
    chmod,
    copyFile,
    readdir,
    rm,
} from 'node:fs/promises';
import path from 'node:path';

const DEBIAN_LIFECYCLE_SCRIPT_MODE = 0o755;
// eslint-disable-next-line perfectionist/sort-sets
const SUPPORTED_DEBIAN_LIFECYCLE_SCRIPTS = new Set(['postinst', 'preinst', 'prerm', 'postrm']);

/**
 * Stage any Debian lifecycle scripts found in the package source directory.
 *
 * Packages may provide top-level Debian maintainer scripts such as `postinst`.
 * The build copies supported scripts into `DEBIAN/`, marks them executable, and removes them from the installed runtime payload tree before `dpkg-deb` packages the install root.
 * If a package does not define any lifecycle scripts, the build proceeds unchanged.
 *
 * @param {{ debianControlDir: string, installDir: string, sourceDir: string }} options
 * @returns {Promise<void>}
 */
export async function stageDebLifecycleScriptsAsync({ debianControlDir, installDir, sourceDir }) {
    const sourceEntries = await readdir(sourceDir, { withFileTypes: true });

    for (const sourceEntry of sourceEntries) {
        if (!sourceEntry.isFile() || !SUPPORTED_DEBIAN_LIFECYCLE_SCRIPTS.has(sourceEntry.name)) continue;

        const sourceScriptPath = path.join(sourceDir, sourceEntry.name);
        const stagedScriptPath = path.join(debianControlDir, sourceEntry.name);
        const installedScriptPath = path.join(installDir, sourceEntry.name);

        await copyFile(sourceScriptPath, stagedScriptPath);
        await chmod(stagedScriptPath, DEBIAN_LIFECYCLE_SCRIPT_MODE);
        await rm(installedScriptPath);
    }
}
