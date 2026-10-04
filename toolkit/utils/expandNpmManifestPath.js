import { normalizeToPosixPath } from './normalizeToPosixPath.js';

/**
 * Expand one manifest path or wildcard pattern into concrete source paths.
 *
 * Motivation: wildcard export targets such as `./styles/*` still need to map
 * back onto real package files before the build can classify them.
 *
 * @param {string} manifestPath
 * @param {string[]} publishSourcePaths
 * @returns {string[]}
 */
export function expandNpmManifestPath(manifestPath, publishSourcePaths) {
    if (!manifestPath.startsWith('./')) return [];

    const normalizedPath = normalizeToPosixPath(manifestPath).replace(/^\.\//u, '');

    if (!normalizedPath.includes('*')) return [normalizedPath];

    const pathPattern = normalizedPath
        .split('*')
        .map(segment => segment.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`))
        .join('.*');
    const pathRegex = new RegExp(`^${pathPattern}$`, 'u');

    return publishSourcePaths.filter(relativePath => pathRegex.test(relativePath));
}
