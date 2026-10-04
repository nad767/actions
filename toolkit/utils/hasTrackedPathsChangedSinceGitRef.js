import { execFileSync } from 'node:child_process';

/**
 * Return whether any tracked paths differ from the given Git reference.
 *
 * This lets the release lane skip unchanged bundles on normal publish runs,
 * while still failing fast if a bundle changed without a corresponding version bump.
 *
 * @param {object} params
 * @param {string} [params.cwd]
 * @param {string} params.gitRef
 * @param {string[]} params.trackedPaths
 * @returns {boolean}
 */
export function hasTrackedPathsChangedSinceGitRef({ cwd, gitRef, trackedPaths }) {
    try {
        execFileSync(
            'git',
            [
                'diff',
                '--quiet',
                gitRef,
                '--',
                ...trackedPaths,
            ],
            { cwd, stdio: 'ignore' },
        );
        return false;
    }
    catch (err) {
        if (err.status === 1) return true;
        throw err;
    }
}
