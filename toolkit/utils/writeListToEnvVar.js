import { appendFile } from 'node:fs/promises';

/**
 * Write a newline-delimited list to a GitHub env file using multiline syntax.
 *
 * @param {string} envVar
 * @param {string} name
 * @param {string[]} values
 * @returns {Promise<void>}
 */
export async function writeListToEnvVar(envVar, name, values) {
    if ((typeof envVar !== 'string') || envVar.length === 0) {
        throw new TypeError('Expected a non-empty env file variable name.');
    }

    if ((typeof name !== 'string') || name.length === 0) {
        throw new TypeError('Expected a non-empty output/env entry name.');
    }

    if (!Array.isArray(values)) {
        throw new TypeError(`Expected an array for ${name}.`);
    }

    const destinationPath = process.env[envVar];
    if (!destinationPath) {
        throw new Error(`Missing \`process.env.${envVar}\`.`);
    }

    const eofMarker = `${name.replaceAll(/[^A-Za-z0-9]+/gu, '_').toUpperCase()}_EOF`;
    await appendFile(destinationPath, [
        `${name}<<${eofMarker}`,
        ...values,
        eofMarker,
        '',
    ].join('\n'));
}
