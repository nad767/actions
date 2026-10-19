
import { createStreamableBuffer } from './forkStreamToBuffer.js';
import { spawnAuthNpmAsync } from './spawnAuthNpmAsync.js';

/**
 * Fetch currently staged package records from the target registry.
 *
 * Motivation: npm stage publish does not allow overwriting an already staged version of a package.
 * By listing staged packages, we can detect whether the version being staged already exists in the staging area.
 *
 * @param {string} packageName
 * @param {import('./npmRegistries.js').NpmRegistryEntry} registryEntry
 * @param {string} [cwd]
 * @returns {Promise<Array<{
 *     id: string,
 *     packageName: string,
 *     version: string,
 *     tag?: string,
 *     status?: string,
 *     createdAt?: string,
 *     actor?: string,
 *     actorType?: string,
 *     shasum?: string,
 * }>>}
 */
export async function getStagedNpmPackages(packageName, registryEntry, cwd) {
    const stdoutStreamableBuffer = createStreamableBuffer();
    const stderrStreamableBuffer = createStreamableBuffer();

    return spawnAuthNpmAsync(
        [
            'stage',
            'list',
            packageName,
            '--json',
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
            const stdoutStr = stdoutBuf.toString('utf8').trim();
            if (stdoutStr.length === 0) return [];
            const stdoutJson = JSON.parse(stdoutStr);
            return Array.isArray(stdoutJson) ? stdoutJson : [stdoutJson];
        })
        .catch(async err => {
            const stderrBuf = await stderrStreamableBuffer.bufferPromise;
            const stderrStr = stderrBuf.toString('utf8');

            const isPackageNotFound = (err?.exitCode === 1)
                && (err?.signal === null)
                && /(?:\bnpm error code E404\b|\bnpm error 404\b|does not exist under owner|could not be found|No staged packages)/iu.test(stderrStr);
            if (isPackageNotFound) {
                console.debug(`Treating missing staged package list for \`${packageName}\` as empty.`);
                return [];
            }

            if (stderrStr.trim()) {
                console.error(`npm stage list stderr for \`${packageName}\`:\n${stderrStr.trim()}`);
            }

            throw err;
        });
}

