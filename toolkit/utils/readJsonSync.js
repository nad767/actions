import { readFileSync } from 'node:fs';

/**
 * Read and parse a JSON file synchronously.
 *
 * @template T
 * @param {string} filePath Path to the JSON file (absolute or relative to cwd).
 * @returns {T}
 */
export function readJsonSync(filePath) {
    let rawJson;

    // Read the file first so filesystem failures can be reported distinctly from JSON syntax errors.
    try { rawJson = readFileSync(filePath, 'utf8'); }
    catch (err) { throw new Error(`Failed to read JSON file at ${filePath}.`, { cause: err }); }

    // Parse the already-loaded text separately so malformed JSON points back to the source file.
    try { return JSON.parse(rawJson); }
    catch (err) { throw new SyntaxError(`Failed to parse JSON file at ${filePath}.`, { cause: err }); }
}
