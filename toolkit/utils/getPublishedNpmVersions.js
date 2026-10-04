import { createStreamableBuffer } from './forkStreamToBuffer.js';
import { spawnAuthNpmAsync } from './spawnAuthNpmAsync.js';

/**
 * Fetch every published version currently stored for one GitHub Packages package.
 *
 * Motivation: comparing only the dist-tag target is not sufficient because npm and GitHub Packages reject republishing any version that already exists.
 *
 * @param {string} packageName
 * @param {import('./npmRegistries.js').NpmRegistryEntry} registryEntry
 * @param {string} [cwd]
 * @returns {Promise<string[]>}
 */
export async function getPublishedNpmVersions(packageName, registryEntry, cwd) {
    // const forkedStdout = forkStreamToBuffer(process.stdout); // Deprecated in favor using `createStreamableBuffer` directly, since `forkStreamToBuffer` doesn't play well with `spawn()`'s `options.stdio` (see its JSDoc for details). That said, the commented-out implementation that follows does work, but because it merely adds another layer of abstraction, I've resorted to using `createStreamableBuffer` directly, as said.
    const stdoutStreamableBuffer = createStreamableBuffer();
    const stderrStreamableBuffer = createStreamableBuffer();

    // Capture npm stderr so we can distinguish a first publish (package missing) from real failures.
    return spawnAuthNpmAsync(
        [
            'view',
            packageName,
            'versions',
            '--json',
            '--registry',
            registryEntry.url,
        ],
        {
            cwd,
            onSpawn: childProcess => {
                // childProcess.stdout.pipe(forkedStdout.stream);
                // childProcess.stdout.pipe(process.stdout); // Too verbose for console, commented-out (can be re-enabled for debugging).
                childProcess.stdout.pipe(stdoutStreamableBuffer.stream);
                childProcess.stderr.pipe(stderrStreamableBuffer.stream);
            },
            registryEntry,
            stdio: ['ignore', 'pipe', 'pipe'], // Passing `forkedStdout` instead of 'pipe' introduces an error, so we've resorted to using `createStreamableBuffer` directly. See `forkStreamToBuffer`'s JSDoc for details.
        },
    )
        .then(async () => {
            // const buffer = await forkedStdout.bufferPromise;
            const stdoutBuf = await stdoutStreamableBuffer.bufferPromise; // Generally should resolve at the same time with `spawnAuthNpmAsync`.
            const stdoutStr = stdoutBuf.toString('utf8').trim();
            if (stdoutStr.length === 0) return [];
            const stdoutJson = JSON.parse(stdoutStr);
            return Array.isArray(stdoutJson) ? stdoutJson : [stdoutJson];
        })
        .catch(async err => {
            const stderrBuf = await stderrStreamableBuffer.bufferPromise;
            const stderrStr = stderrBuf.toString('utf8');

            // GitHub Packages returns a 404 for first-time publishes because the package has no registry record yet, so we need to detect that case and treat it as an empty version list rather than a failure.
            const isPackageNotFound = (err?.exitCode === 1)
                && (err?.signal === null)
                && /(?:\bnpm error code E404\b|\bnpm error 404\b|does not exist under owner|could not be found)/iu.test(stderrStr);
            if (isPackageNotFound) {
                console.debug(`Treating missing registry package \`${packageName}\` as unpublished because npm view returned a package-not-found response.`);
                return [];
            }

            if (stderrStr.trim()) {
                console.error(`npm view stderr for \`${packageName}\`:\n${stderrStr.trim()}`);
            }

            throw err;
        });
}
