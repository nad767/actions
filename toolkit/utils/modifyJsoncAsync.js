import { applyEdits as applyEditsToJsonc, modify as modifyJsonc } from 'jsonc-parser';
import toPath from 'lodash/toPath.js';
import { readFile, writeFile } from 'node:fs/promises';

/**
 * Convert a lodash-style dot/bracket path string into the `(string | number)[]` tuple that `jsonc-parser`'s `modify()` expects.
 *
 * lodash's `toPath` tokenises the string correctly (`'a.b[2]'` → `['a','b','2']`) but returns every segment as a string.
 * We manually cast purely-numeric segments to `number`, so `jsonc-parser` treats them as array indices rather than object keys.
 *
 * @param {string} pathStr
 * @returns {(string | number)[]}
 */
function parsePathString(pathStr) {
    return toPath(pathStr).map(segment => (/^\d+$/).test(segment) ? Number(segment) : segment);
}

/**
 * Normalise a single path entry from the `assignments` iterable into the `(string | number)[]` format that `jsonc-parser` requires.
 *
 * - If the path is already an array, it is forwarded as-is.
 * - If the path is a string, it is parsed as a lodash-style dot/bracket path (e.g. `'foo.bar[1]'` → `['foo', 'bar', 1]`).
 *
 * @param {string | readonly (string | number)[]} path
 * @returns {(string | number)[]}
 */
function normalisePath(path) {
    return Array.isArray(path) ? path : parsePathString(path);
}

/**
 * Apply a set of property assignments to a JSONC file in-place, preserving all existing comments and formatting.
 *
 * Note: `readJsoncAsync` is intentionally not used here — it returns a parsed POJO, but the AST editor (`modify`/`applyEdits`) requires the original raw text string.
 *
 * @param {string} filePath
 *   Absolute or CWD-relative path to the JSONC file to modify.
 * @param {Record<string, unknown> | Iterable<readonly [string | readonly (string | number)[], unknown]>} assignments
 *   Either:
 *   - a plain object whose keys are lodash dot/bracket path strings; or
 *   - an iterable of `[path, value]` entries where each path is a lodash-style string or a pre-parsed `(string | number)[]` array.
 * @returns {Promise<void>}
 */
export async function modifyJsoncAsync(filePath, assignments) {
    let rawText;

    // Filesystem errors reported separately from AST editing errors.
    try { rawText = await readFile(filePath, 'utf8'); }
    catch (err) { throw new Error(`Failed to read JSONC file at ${filePath}.`, { cause: err }); }

    // Accept either a plain object (keys as lodash path strings) or an already-iterable collection of `[path, value]` entries.
    // Plain objects don't have `Symbol.iterator`, so we use that to distinguish the two forms.
    const entries = (typeof assignments?.[Symbol.iterator] === 'function') ? assignments : Object.entries(assignments);

    // Apply assignments.
    let updatedText = rawText;
    for (const [path, value] of entries) {
        const jsonPath = normalisePath(path);
        const edits = modifyJsonc(updatedText, jsonPath, value, { formattingOptions: { insertSpaces: true, tabSize: 4 } });
        updatedText = applyEditsToJsonc(updatedText, edits);
    }

    // Rewrite the jsonc file.
    try { await writeFile(filePath, updatedText); }
    catch (err) { throw new Error(`Failed to write JSONC file at ${filePath}.`, { cause: err }); }
}
