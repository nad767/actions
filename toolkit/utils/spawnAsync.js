import { spawn } from 'node:child_process';

/**
 * A promisified version of `node:child_process.spawn`.
 *
 * Resolves if the spawned process exits with code 0.
 *
 * Rejects if the spawned process exits with a non-zero code, is terminated by a signal, or if an error is encountered while spawning or running.
 * TODO: add a mechanism that would allow caller to catch non-fatal errors while keep awaiting for the process to finish. Can be done, for example, by returning a new promise in the error object, that would settle on the next error or when the process terminates/exits.
 *
 * Because the spawned child process itself is not returned from this function, this function provides an optional `onSpawn` callback to allow the caller to interact with the child process as it's being created (e.g. to pipe stdio, add event listeners, etc.).
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{import('node:child_process').SpawnOptions & { onSpawn?: (childProcess: import('node:child_process').ChildProcess) => void }} } [options={}]
 * @returns {Promise<{
 *     exitCode: number | null,
 *     signal: NodeJS.Signals | null,
 * }>}
 */
export function spawnAsync(
    command,
    args,
    { onSpawn, ...spawnOptions } = {},
) {
    return new Promise((resolve, reject) => {
        const childProcess = spawn(command, args, spawnOptions);
        onSpawn?.(childProcess);

        const spawnCommand = [command, ...args].join(' ');
        const spawnCwd = spawnOptions.cwd ? `"${spawnOptions.cwd}"` : '`process.cwd()`';

        // Raise a flag when a subprocess settles, so we can guard against Node emitting both `error` and `close` for the same subprocess.
        // Note: this is only desired because we don't tolerate ANY errors. If we did, then we would want to allow both events to be emitted so that we can handle partial failures (e.g. a subprocess that fails but still produces some output on stdout that we want to consume).
        let didSettle = false;

        childProcess.once('error', err => {
            if (didSettle) return;
            didSettle = true;

            reject(Object.assign(
                new Error(`Spawned "${spawnCommand}" in ${spawnCwd} ran into the following error.`, { cause: err }),
                {
                    exitCode: childProcess.exitCode,
                    reason:   'error',
                    signal:   childProcess.signalCode,
                },
            ));
        });

        // Resolve on `close` (rather than on `exit`) to ensure all i/o streams finish draining before the promise settles.
        childProcess.once('close', (exitCode, signal) => {
            if (didSettle) return;
            didSettle = true;

            if (signal) {
                reject(Object.assign(
                    new Error(`Spawned "${spawnCommand}" in ${spawnCwd} terminated due to a ${signal} signal (exit code was ${exitCode}).`),
                    {
                        exitCode,
                        reason: 'signal',
                        signal,
                    },
                ));
                return;
            }

            if (exitCode > 0) {
                reject(Object.assign(
                    new Error(`Spawned "${spawnCommand}" in ${spawnCwd} exited with non-zero code ${exitCode}.`),
                    {
                        exitCode,
                        reason: 'exit',
                        signal,
                    },
                ));
                return;
            }

            resolve({ exitCode, signal });
        });
    });
}
