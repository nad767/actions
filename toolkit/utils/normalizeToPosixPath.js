import path from 'node:path';

/**
 * Normalize filesystem paths into manifest-safe POSIX paths.
 *
 * Motivation: package exports and import specifiers always use POSIX path
 * separators, even when the build runs on non-POSIX machines.
 *
 * @param {string} filePath
 * @returns {string}
 */
export function normalizeToPosixPath(filePath) {
    return filePath.split(path.sep).join(path.posix.sep);
}
