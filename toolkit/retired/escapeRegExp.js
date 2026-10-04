/**
 * Escape one string so it can be embedded in a regular expression.
 *
 * Motivation: rewritten package names become part of a specifier-matching regex, so literal scope and slash characters must stay literal.
 *
 * @deprecated Redundant since Node 24 introduced `RegExp.escape()`. Use the native API instead of this archived helper.
 * @param {string} value
 * @returns {string}
 */
export function escapeRegExp(value) {
    return value.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);
}