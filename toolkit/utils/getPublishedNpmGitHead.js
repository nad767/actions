import { createStreamableBuffer } from './forkStreamToBuffer.js';
import { spawnAuthNpmAsync } from './spawnAuthNpmAsync.js';

/**
 * Fetch the gitHead (commit SHA) of a published NPM Package version from the registry.
 *
 * @param {string} packageName
 * @param {string} version
 * @param {import('./npmRegistries.js').NpmRegistryEntry} registryEntry
 * @param {string} [cwd]
 * @returns {Promise<string | null>}
 */
export async function getPublishedNpmGitHead(packageName, version, registryEntry, cwd) {
    const stdoutStreamableBuffer = createStreamableBuffer();
    const stderrStreamableBuffer = createStreamableBuffer();

    // Query the registry to find the gitHead field for the specific package version
    return spawnAuthNpmAsync(
        [
            'view',
            `${packageName}@${version}`,
            'gitHead',
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
            if (stdoutStr.length === 0) return null;

            // The output of npm view --json is JSON-formatted.
            try {
                const stdoutJson = JSON.parse(stdoutStr);
                return (typeof stdoutJson === 'string') ? stdoutJson.trim() : null;
            } catch {
                // If it fails to parse as JSON, strip surrounding quotes manually
                return stdoutStr.replaceAll(/^"|"$/g, '').trim();
            }
        })
        .catch(async err => {
            const stderrBuf = await stderrStreamableBuffer.bufferPromise;
            const stderrStr = stderrBuf.toString('utf8');

            // Treat registry missing package/version responses as null instead of throwing an error
            const isPackageNotFound = (err?.exitCode === 1)
                && (err?.signal === null)
                && /(?:\bnpm error code E404\b|\bnpm error 404\b|does not exist under owner|could not be found)/iu.test(stderrStr);
            if (isPackageNotFound) {
                console.debug(new Error(`Treating missing package \`${packageName}@${version}\` as having no gitHead.`));
                return null;
            }

            if (stderrStr.trim()) {
                console.error(`npm view gitHead stderr for \`${packageName}@${version}\`:\n${stderrStr.trim()}`);
            }

            throw err;
        });
}
