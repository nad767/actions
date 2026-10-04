import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/**
 * Compute the SHA256 hash of a file.
 *
 * Motivation: to perform a digest comparison between a local packaged feature
 * and the published registry tarball without extracting them.
 *
 * @param {string} filePath Path to the file.
 * @returns {Promise<string>} Hex-encoded SHA256 digest.
 */
export async function getFileSha256(filePath) {
    const content = await readFile(filePath);
    return createHash('sha256').update(content).digest('hex');
}
