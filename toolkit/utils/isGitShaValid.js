import { execFileSync } from 'node:child_process';

/**
 * Validate that a given commit SHA exists in the local Git repository.
 *
 * @param {string} cwd
 * @param {string} sha
 * @returns {boolean}
 */
export function isGitShaValid(cwd, sha) {
    try {
        execFileSync('git', ['cat-file', '-t', sha], { cwd, stdio: 'ignore' });
        return true;
    }
    catch {
        return false;
    }
}
