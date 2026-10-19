import { createStreamableBuffer } from './forkStreamToBuffer.js';
import { spawnAuthNpmAsync } from './spawnAuthNpmAsync.js';

/**
 * Reject (delete) an already staged package version on the target registry by its stage ID.
 *
 * Motivation: npm registry does not allow publishing or staging over an existing staged version.
 * Overriding requires deleting the older staged version first using `npm stage reject <stage-id>`.
 *
 * @param {string} stageId UUID of the staged package.
 * @param {import('./npmRegistries.js').NpmRegistryEntry} registryEntry
 * @param {string} [cwd]
 * @returns {Promise<string>}
 */
export async function rejectStagedNpmPackage(stageId, registryEntry, cwd) {
    const stdoutStreamableBuffer = createStreamableBuffer();
    const stderrStreamableBuffer = createStreamableBuffer();

    return spawnAuthNpmAsync(
        [
            'stage',
            'reject',
            stageId,
            '--registry',
            registryEntry.url,
        ],
        {
            cwd,
            onSpawn: childProcess => {
                childProcess.stdout.pipe(stdoutStreamableBuffer.stream);
                childProcess.stderr.pipe(stderrStreamableBuffer.stream);
            },
            registryEntry,
            stdio: ['ignore', 'pipe', 'pipe'],
        },
    )
        .then(async () => {
            const stdoutBuf = await stdoutStreamableBuffer.bufferPromise;
            return stdoutBuf.toString('utf8').trim();
        })
        .catch(async err => {
            const stderrBuf = await stderrStreamableBuffer.bufferPromise;
            const stderrStr = stderrBuf.toString('utf8');

            const isNotFound = (err?.exitCode === 1)
                && (err?.signal === null)
                && /(?:\bnpm error code E404\b|\bnpm error 404\b|not found)/iu.test(stderrStr);
            if (isNotFound) {
                console.debug(`Staged package \`${stageId}\` was already removed from registry.`);
                return '';
            }

            if (stderrStr.trim()) {
                console.error(`npm stage reject stderr for \`${stageId}\`:\n${stderrStr.trim()}`);
            }

            throw err;
        });
}

