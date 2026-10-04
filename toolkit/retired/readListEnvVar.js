/**
 * Read a newline-delimited list from an environment variable.
 *
 * @param {string} variableName
 * @returns {string[]}
 */
export function readListEnvVar(variableName) {
    const rawValue = process.env[variableName];

    if (rawValue === undefined || rawValue === null || rawValue.trim() === '') return [];

    return rawValue.split('\n').map(value => value.trim()).filter(Boolean);
}
