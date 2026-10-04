/**
 * Read and parse JSON configuration from an environment variable synchronously.
 *
 * Motivation: This allows scripts to directly access configuration passed as stringified JSON in the environment.
 *
 * @template T
 * @param {string} [envVarName] The name of the environment variable (default: 'TARGETS_JSON').
 * @returns {T}
 */
export function readJsonEnvVar(envVarName = 'TARGETS_JSON') {
    const inlineJson = process.env[envVarName];
    if (inlineJson === undefined || inlineJson.trim() === '') {
        throw new Error(`Missing or empty environment variable: process.env.${envVarName}.`);
    }

    try {
        return JSON.parse(inlineJson);
    }
    catch (err) {
        throw new SyntaxError(`Failed to parse inline JSON configuration from process.env.${envVarName}.`, { cause: err });
    }
}
