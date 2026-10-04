import { writeFile } from 'node:fs/promises';

/**
 * Download one GitHub release asset to disk.
 *
 * Debian bundle pruning needs the raw published asset bytes, so this mirrors the release upload helper with binary response handling.
 *
 * @param {string} githubApiToken
 * @param {string} assetUrl
 * @param {string} assetPath
 * @returns {Promise<void>}
 */
export async function downloadGitHubReleaseAsset(githubApiToken, assetUrl, assetPath) {
    const response = await fetch(
        assetUrl,
        {
            headers: {
                Accept:                 'application/octet-stream',
                Authorization:          `Bearer ${githubApiToken}`,
                'X-GitHub-Api-Version': '2026-03-10', // See https://docs.github.com/en/rest/about-the-rest-api/api-versions?apiVersion=2026-03-10#supported-api-versions
            },
        },
    );

    if (!response.ok) {
        let responseMessage = response.statusText;

        const responseText = await response.text();
        if (responseText) {
            try { responseMessage = JSON.parse(responseText)?.message ?? responseText; }
            catch { responseMessage = responseText; }
        }

        throw new Error(`GitHub release asset download failed (${response.status} ${response.statusText}): ${responseMessage}`);
    }

    const assetBytes = Buffer.from(await response.arrayBuffer());
    await writeFile(assetPath, assetBytes);
}
