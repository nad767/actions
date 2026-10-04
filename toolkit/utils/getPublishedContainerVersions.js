import semver from 'semver';

import { getGitHubOwnerType } from './getGitHubOwnerType.js';
import { githubApi } from './githubApi.js';

/**
 * Fetch every published semver tag currently stored for one GHCR container package.
 *
 * @param {string} packageName
 * @param {{ apiToken: string, owner: string }} options
 * @returns {Promise<string[]>}
 */
export async function getPublishedContainerVersions(packageName, { apiToken, owner }) {
    const ownerType = await getGitHubOwnerType(apiToken, owner);
    const ownerApiPrefix = (ownerType === 'Organization') ? `/orgs/${owner}` : `/users/${owner}`;
    const versions = new Set();

    for (let page = 1; ; page += 1) {
        let packageVersions;

        try {
            packageVersions = await githubApi({
                apiPath:     `${ownerApiPrefix}/packages/container/${encodeURIComponent(packageName)}/versions`,
                apiToken,
                queryParams: {
                    page,
                    per_page: 100,
                },
            });
        }
        catch (err) {
            if (err.status === 404) return [];
            throw err;
        }

        for (const packageVersion of packageVersions) {
            const tags = packageVersion.metadata?.container?.tags ?? [];
            for (const tag of tags) {
                if (semver.valid(tag)) versions.add(tag);
            }
        }

        if (packageVersions.length < 100) break;
    }

    return [...versions];
}
