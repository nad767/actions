import { readFile } from 'node:fs/promises';

/**
 * Read and parse a JSON file asynchronously.
 *
 * @template T
 * @param {string} filePath Path to the JSON file (absolute or relative to cwd).
 * @returns {Promise<T>}
 */
export async function readJsonAsync(filePath) {
    let rawJson;

    // Read the file first so filesystem failures can be reported distinctly from JSON syntax errors.
    try { rawJson = await readFile(filePath, 'utf8'); }
    catch (err) { throw new Error(`Failed to read JSON file at ${filePath}.`, { cause: err }); }

    // Parse the already-loaded text separately so malformed JSON points back to the source file.
    try { return JSON.parse(rawJson); }
    catch (err) { throw new SyntaxError(`Failed to parse JSON file at ${filePath}.`, { cause: err }); }
}
