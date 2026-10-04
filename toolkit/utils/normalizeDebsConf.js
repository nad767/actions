/**
 * Normalize one raw Debian publish config entry.
 *
 * @param {any} rawDebianBundle
 * @returns {{
 *     binWrappers: Array<{
 *         name: string,
 *         target: string,
 *     }>,
 *     installRoot: string,
 *     manifestPath: string,
 *     path: string,
 *     releaseTagPrefix: string,
 * }}
 */
export function normalizeDebsConf(rawDebianBundle) {
    if (typeof rawDebianBundle?.path !== 'string' || rawDebianBundle.path.length === 0) {
        throw new TypeError('Each Debian publish config entry must include a non-empty `path`.');
    }

    if (typeof rawDebianBundle?.manifestPath !== 'string' || rawDebianBundle.manifestPath.length === 0) {
        throw new TypeError('Each Debian publish config entry must include a non-empty `manifestPath`.');
    }

    if (typeof rawDebianBundle?.installRoot !== 'string' || rawDebianBundle.installRoot.length === 0) {
        throw new TypeError('Each Debian publish config entry must include a non-empty `installRoot`.');
    }

    if (
        rawDebianBundle?.binWrappers !== null
        && (
            !Array.isArray(rawDebianBundle.binWrappers)
            || rawDebianBundle.binWrappers.some(binWrapper => typeof binWrapper?.name !== 'string'
                || binWrapper.name.length === 0
                || binWrapper.name.includes('/')
                || typeof binWrapper?.target !== 'string'
                || binWrapper.target.length === 0
                || binWrapper.target.startsWith('/'))
        )
    ) {
        throw new TypeError('Each Debian publish config entry may include `binWrappers` only as an array of `{ name, target }` objects, where `name` is a filename and `target` is a relative path under `installRoot`.');
    }

    if (typeof rawDebianBundle?.releaseTagPrefix !== 'string' || rawDebianBundle.releaseTagPrefix.length === 0) {
        throw new TypeError('Each Debian publish config entry must include a non-empty `releaseTagPrefix`.');
    }

    return {
        binWrappers:      rawDebianBundle.binWrappers ?? [],
        installRoot:      rawDebianBundle.installRoot,
        manifestPath:     rawDebianBundle.manifestPath,
        path:             rawDebianBundle.path,
        releaseTagPrefix: rawDebianBundle.releaseTagPrefix,
    };
}
