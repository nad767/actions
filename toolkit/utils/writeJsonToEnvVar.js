import { appendFile } from 'node:fs/promises';

/**
 * Write a JSON value to a GitHub env file using multiline syntax.
 *
 * @param {string} envVar
 * @param {string} name
 * @param {unknown} value
 * @returns {Promise<void>}
 */
export async function writeJsonToEnvVar(envVar, name, value) {
    if ((typeof envVar !== 'string') || envVar.length === 0) {
        throw new TypeError('Expected a non-empty env file variable name.');
    }

    if ((typeof name !== 'string') || name.length === 0) {
        throw new TypeError('Expected a non-empty output/env entry name.');
    }

    const destinationPath = process.env[envVar];
    if (!destinationPath) {
        throw new Error(`Missing \`process.env.${envVar}\`.`);
    }

    const eofMarker = `${name.replaceAll(/[^A-Za-z0-9]+/gu, '_').toUpperCase()}_EOF`;
    await appendFile(destinationPath, [
        `${name}<<${eofMarker}`,
        JSON.stringify(value, null, 4),
        eofMarker,
        '',
    ].join('\n'));
}
