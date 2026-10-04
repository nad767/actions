/**
 * Registry details for supported package publish target registries.
 *
 * Motivation: Provide a static, declarative POJO dictionary for npm registry metadata,
 * including accepted aliases, auth token environment variable, and access level.
 * This is the single source of truth — avoid back-and-forth conversions between
 * a registry's canonical host and its URL by storing both.
 *
 * @typedef {{
 *     access:   'public' | 'restricted',
 *     aliases:  readonly string[],
 *     canon:    string,
 *     name:     string,
 *     tokenVar: string,
 *     url:      string,
 * }} NpmRegistryEntry
 *
 * @type {Readonly<Record<'ghp' | 'npmjs', Readonly<NpmRegistryEntry>>>}
 */
export const NPM_REGISTRIES = Object.freeze({
    // GitHub Packages (ghp) publishes with restricted access by default.
    ghp: Object.freeze({
        access:   'restricted',
        aliases:  Object.freeze(['github-packages', 'github packages', 'npm.pkg.github.com']),
        canon:    'npm.pkg.github.com',
        name:     'ghp',
        tokenVar: 'GITHUB_TOKEN',
        url:      'https://npm.pkg.github.com',
    }),

    // Official npm Registry (npmjs) publishes with public access by default.
    npmjs: Object.freeze({
        access:   'public',
        aliases:  Object.freeze(['npm', 'npmjs.org', 'registry.npmjs.org']),
        canon:    'registry.npmjs.org',
        name:     'npmjs',
        tokenVar: 'NPMJS_TOKEN',
        url:      'https://registry.npmjs.org/',
    }),
});

/** @type {string} */
export const DEFAULT_REGISTRY_NAME = 'ghp';
