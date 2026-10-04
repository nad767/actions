import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Check if a devcontainer feature has git changes since a reference,
 * ignoring files specific to Debian packaging.
 *
 * Motivation: Devcontainer feature directories share sources with Debian releases.
 * However, we do not want updates to Debian-specific files (e.g. release.json) to trigger a new devcontainer feature release.
 *
 * @param {object} params
 * @param {string} [params.cwd] Working directory path
 * @param {string} params.gitRef The git tag/branch/ref to compare against
 * @param {string[]} params.trackedPaths Paths tracked for git diff comparison
 * @returns {boolean} True if devcontainer feature files have changed
 */
export function hasDevcontainerFeatureGitChanges({ cwd, gitRef, trackedPaths }) {
    try {
        // Run git diff to get the names of all changed files under the tracked paths
        const output = execFileSync(
            'git',
            [
                'diff',
                '--name-only',
                gitRef,
                '--',
                ...trackedPaths,
            ],
            { cwd, encoding: 'utf8' },
        );

        const changedFiles = output.split('\n').map(line => line.trim()).filter(Boolean);

        // Filter out Debian-specific files from the change list
        const devcontainerChanges = changedFiles.filter(file => {
            const basename = path.basename(file);
            return ![
                'config.example.env',
                'postinst',
                'postrm',
                'prerm',
                'release.json',
            ].includes(basename);
        });

        // We only report changes if there is at least one non-Debian file modified.
        return devcontainerChanges.length > 0;
    }
    catch {
        // If git ref doesn't exist or git diff fails, assume it has changed to be safe.
        return true;
    }
}
