import { githubApi } from './githubApi.js';

const ownerTypePromiseByKey = new Map();

/**
 * Resolve the GitHub owner type for package API routing.
 *
 * @param {string} apiToken
 * @param {string} owner
 * @returns {Promise<'Organization' | 'User' | string>}
 */
export function getGitHubOwnerType(apiToken, owner) {
    const cacheKey = `${owner}:${apiToken}`;

    ownerTypePromiseByKey.set(
        cacheKey,
        ownerTypePromiseByKey.get(cacheKey)
        ?? githubApi({
            apiPath: `/users/${owner}`,
            apiToken,
        }).then(response => response.type),
    );

    return ownerTypePromiseByKey.get(cacheKey);
}
