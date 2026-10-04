import { DEFAULT_REGISTRY_NAME, NPM_REGISTRIES } from './npmRegistries.js';

function tokenizeRegistryInput(input) {
    if ((input === undefined) || (input === null)) return [];

    if (typeof input !== 'string') {
        throw new TypeError(`Invalid npm registry input ${JSON.stringify(input)}. Expected a string.`);
    }

    return input
        .split(/[\s,]+/u)
        .map(value => value.trim())
        .filter(Boolean);
}

function lookupNpmRegistryEntry(token) {
    const lower = token.toLowerCase();

    if (Object.hasOwn(NPM_REGISTRIES, lower)) return NPM_REGISTRIES[lower];

    for (const entry of Object.values(NPM_REGISTRIES)) {
        if (entry.aliases.includes(lower)) return entry;
    }

    const supported = Object.values(NPM_REGISTRIES)
        .flatMap(entry => [entry.name, ...entry.aliases])
        .map(value => `"${value}"`)
        .join(', ');
    throw new Error(`Unknown npm registry "${token}". Supported values: ${supported}.`);
}

/**
 * Resolve one or more registry name(s) / alias(es) to their `NpmRegistryEntry` objects.
 *
 * @param {string | undefined} input — A comma-and/or-whitespace-separated list
 *     of registry names or aliases. When `undefined` or empty,
 *     falls back to `fallback` (if provided) or `DEFAULT_REGISTRY_NAME`.
 * @param {{ fallback?: string }} [options={}]
 * @returns {import('./npmRegistries.js').NpmRegistryEntry[]} — Deduplicated,
 *     order-preserving array of resolved registry entries.
 */
export function resolveNpmRegistries(input, { fallback } = {}) {
    const primaryTokens = tokenizeRegistryInput(input);
    const fallbackTokens = tokenizeRegistryInput(fallback);
    const tokens = (primaryTokens.length > 0)
        ? primaryTokens
        : (fallbackTokens.length > 0)
            ? fallbackTokens
            : [DEFAULT_REGISTRY_NAME];

    /** @type {Map<string, import('./npmRegistries.js').NpmRegistryEntry>} */
    const seen = new Map();

    for (const token of tokens) {
        const entry = lookupNpmRegistryEntry(token);
        if (!seen.has(entry.name)) seen.set(entry.name, entry);
    }

    return [...seen.values()];
}

/**
 * Resolve a registry name, alias, or list to the first canonical entry.
 *
 * @param {string | undefined} input
 * @param {{ fallback?: string }} [options={}]
 * @returns {import('./npmRegistries.js').NpmRegistryEntry}
 */
export function resolveNpmRegistryEntry(input, { fallback } = {}) {
    return resolveNpmRegistries(input, { fallback })[0];
}
