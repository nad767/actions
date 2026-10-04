import { parse as parseJsonc } from 'jsonc-parser';
import { readFile } from 'node:fs/promises';

/**
 * Read and parse a JSONC (JSON with Comments) file asynchronously.
 *
 * This is necessary because `devcontainer-feature.json` officially supports JSONC syntax (see the VS Code devcontainers spec), but a plain `JSON.parse` call throws a SyntaxError as soon as any comment is present. Using `jsonc-parser` allows the file to contain both `//` and `/* *\/` style comments without breaking the parse.
 *
 * @template T
 * @param {string} filePath Path to the JSONC file (absolute or relative to cwd).
 * @returns {Promise<T>}
 */
export async function readJsoncAsync(filePath) {
    let rawText;

    // Read the file first so filesystem failures can be reported distinctly from parse errors.
    try { rawText = await readFile(filePath, 'utf8'); }
    catch (err) { throw new Error(`Failed to read JSONC file at ${filePath}.`, { cause: err }); }

    // `jsonc-parser` returns `undefined` on an empty/comment-only document, and collects errors into the array instead of throwing, so we surface those errors manually.
    /** @type {import('jsonc-parser').ParseError[]} */
    const errs = [];
    const result = parseJsonc(rawText, errs, { allowTrailingComma: true });
    if (errs.length > 0) {
        const firstErr = errs[0];
        throw new SyntaxError(`Failed to parse JSONC file at ${filePath} (error code ${firstErr.error} at offset ${firstErr.offset}).`);
    }

    return result;
}
