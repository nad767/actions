/**
 * Parse a boolean string, boolean, or environment variable value into an actual boolean.
 *
 * Case-insensitive values:
 * - Truthy: `"true"`, `"1"`, `true`, `1`.
 * - Falsy: `"false"`, `"0"`, `false`, `0`.
 * - Fallback: Returns `defaultValue` if `value` is undefined, null, empty string, or unparseable.
 *
 * @param {unknown} value Value to parse.
 * @param {boolean} [defaultValue=false] Fallback boolean if value is undefined, null, or empty string.
 * @returns {boolean}
 */
export function parseBoolean(value, defaultValue = false) {
    if ((value === undefined) || (value === null) || (value === '')) {
        return defaultValue;
    }

    if (typeof value === 'boolean') return value;

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length === 0) return defaultValue;
        if (/^(1|true)$/iu.test(trimmed)) return true;
        if (/^(0|false)$/iu.test(trimmed)) return false;
    }

    if (typeof value === 'number') {
        if (value === 1) return true;
        if (value === 0) return false;
    }

    return defaultValue;
}
