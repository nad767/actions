/**
 * Send a GitHub REST API request and parse its JSON response.
 *
 * Centralizing the fetch boilerplate keeps the local dispatcher focused on the
 * publish orchestration rather than repetitive header and error handling.
 *
 * @param {{
 *     apiPath: string,
 *     apiToken: string,
 *     body?: any,
 *     expectEmptyResponse?: boolean,
 *     headers?: Record<string, string>,
 *     isRawBody?: boolean,
 *     method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT',
 *     queryParams?: Record<string, boolean | number | string | Array<boolean | number | string> | null | undefined>,
 * }} options
 * @returns {Promise<any>}
 */
export async function githubApi({
    apiPath,
    apiToken,
    body,
    expectEmptyResponse,
    headers = {},
    isRawBody,
    method,
    queryParams = {},
}) {
    // Build url
    const url = new URL(apiPath, 'https://api.github.com');
    for (const [key, value] of Object.entries(queryParams)) {
        if (value === null || value === undefined) continue;
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) url.searchParams.append(key, String(item));
    }

    const isJsonBody = (body !== undefined) && !isRawBody;

    // Send request
    const response = await fetch(
        url,
        {
            body:    isJsonBody ? JSON.stringify(body) : body,
            headers: {
                Accept:                 'application/vnd.github+json',
                Authorization:          `Bearer ${apiToken}`,
                'X-GitHub-Api-Version': '2026-03-10', // See https://docs.github.com/en/rest/about-the-rest-api/api-versions?apiVersion=2026-03-10#supported-api-versions
                ...isJsonBody && { 'Content-Type': 'application/json' },
                ...headers,
            },
            method: method ?? (body ? 'POST' : 'GET'),
        },
    );

    if (expectEmptyResponse && response.status === 204) return null;

    const responseText = await response.text();
    let responseJson = null;
    if (responseText) {
        try { responseJson = JSON.parse(responseText); }
        catch { responseJson = { message: responseText }; }
    }

    if (!response.ok) {
        const message = responseJson?.message ?? responseText ?? response.statusText;
        const err = new Error(`GitHub API request failed. status ${response.status}; statusText '${response.statusText}'; message '${message}'.`);
        err.url = url;
        err.method = method;
        err.headers = headers;
        err.body = body;
        err.status = response.status;
        err.statusText = response.statusText;
        err.responseJson = responseJson;
        throw err;
    }

    return responseJson;
}
