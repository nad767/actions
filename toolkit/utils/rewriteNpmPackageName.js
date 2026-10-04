/**
 * Rewrite an NPM package name for a target publish registry according to target configuration and default scope.
 *
 * Motivation: Monorepo packages can maintain their internal names/scopes locally while publishing under different
 * scopes or names per registry (such as GitHub Packages or npmjs).
 *
 * Behavior:
 * - `targetConfig[registryName + 'Scope']`: Prefixes the package's current name (if unscoped) or overwrites its current scope (e.g. 'nad767' or '@nad767').
 * - `targetConfig[registryName + 'Name']`: Replaces the package's current name as-is with this full package name (scoped or unscoped, e.g. 'foo', 'nad767/foo', '@nad767/foo').
 * - If both scope and name are provided for the registry, throws an error if they are inconsistent with each other.
 * - If neither is provided, falls back to `defaultScope` (if provided and no name is specified) or leaves the package name as-is.
 *
 * @param {string} packageName The original package name (e.g. '@repo-foo/eslint-config' or 'my-package').
 * @param {{
 *     defaultScope?: string,
 *     registryName?: string,
 *     targetConfig?: { ghpName?: string, ghpScope?: string, npmjsName?: string, npmjsScope?: string },
 * }} [options={}] Target configuration with registry details and fallback default scope.
 * @returns {string} The rewritten package name.
 */
export function rewriteNpmPackageName(
    packageName,
    {
        defaultScope,
        registryName,
        targetConfig,
    } = {},
) {
    if ((typeof packageName !== 'string') || (packageName.trim().length === 0)) {
        throw new TypeError(`Expected a non-empty package name string, received "${packageName}".`);
    }

    // 1. Normalize requested `scope` override (if provided).
    let normalizedScope;
    const requestedScope = registryName && targetConfig?.[`${registryName}Scope`];
    if ((requestedScope !== undefined) && (requestedScope !== null)) {
        if ((typeof requestedScope !== 'string') || (requestedScope.trim().length === 0)) {
            throw new TypeError(`Expected scope to be a non-empty string, received ${JSON.stringify(requestedScope)}.`);
        }

        normalizedScope = requestedScope.trim().replace(/^@/u, '');
        if (normalizedScope.includes('/')) throw new Error(`Scope must not contain slashes, received "${requestedScope}".`);
        if (normalizedScope.length === 0) throw new Error(`Invalid empty scope "${requestedScope}".`);
    }

    // 2. Parse, validate, and return requested full `name` override (if provided).
    const requestedName = registryName && targetConfig?.[`${registryName}Name`];
    if ((requestedName !== undefined) && (requestedName !== null)) {
        if ((typeof requestedName !== 'string') || (requestedName.trim().length === 0)) {
            throw new TypeError(`Expected name to be a non-empty string, received ${JSON.stringify(requestedName)}.`);
        }

        const trimmedName = requestedName.trim();
        const slashIdx = trimmedName.indexOf('/');

        if (slashIdx !== -1) {
            // Scoped full name override (e.g. "@nad767/foo" or "nad767/foo").
            const scope = trimmedName.startsWith('@')
                ? trimmedName.slice(1, slashIdx)
                : trimmedName.slice(0, slashIdx);
            const descopedName = trimmedName.slice(slashIdx + 1);

            if ((scope.length === 0) || (descopedName.length === 0) || descopedName.includes('/')) {
                throw new Error(`Invalid scoped package name format: "${requestedName}".`);
            }

            if ((normalizedScope !== undefined) && (scope.toLowerCase() !== normalizedScope.toLowerCase())) {
                throw new Error(`Inconsistent scope and name: scope is "${requestedScope}" but name is "${requestedName}".`);
            }

            return `@${scope}/${descopedName}`;
        }

        // Unscoped full name override (e.g. "foo").
        if (trimmedName.startsWith('@')) {
            throw new Error(`Invalid package name "${requestedName}". Scoped package names must contain a slash (e.g. "@scope/name").`);
        }

        if (normalizedScope !== undefined) {
            throw new Error(`Inconsistent scope and name: scope is "${requestedScope}" but name "${requestedName}" is unscoped.`);
        }

        return trimmedName;
    }

    // 3. Apply `scope` override (or fallback `defaultScope`): prefix unscoped package name or overwrite existing scope.
    const effectiveScope = normalizedScope ?? (((typeof defaultScope === 'string') && (defaultScope.trim().length > 0)) ? defaultScope.trim().replace(/^@/u, '') : undefined);
    if ((effectiveScope !== undefined) && (effectiveScope.length > 0)) {
        const slashIdx = packageName.indexOf('/');
        const descopedPackageName = (slashIdx !== -1) ? packageName.slice(slashIdx + 1) : packageName;
        return `@${effectiveScope}/${descopedPackageName}`;
    }

    // 4. No overrides -> leave package name as-is.
    return packageName;
}
