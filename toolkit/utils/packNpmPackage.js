import path from 'node:path';

import { createStreamableBuffer } from './forkStreamToBuffer.js';
import { spawnAuthNpmAsync } from './spawnAuthNpmAsync.js';

const isNonEmptyString = value => (typeof value === 'string') && (value.length > 0);

/**
 * Materialize one package tarball and return npm's metadata for that tarball.
 *
 * For a local directory, `npm pack` builds the tarball that `npm publish` would upload.
 * For a package specifier like `name@version`, `npm pack` downloads the already-published tarball into `outDir` rather than repacking it.
 *
 * @param {{
 *     cwd?: string,
 *     outDir: string,
 *     packTarget?: string,
 *     registryEntry?: import('./npmRegistries.js').NpmRegistryEntry,
 * }} options
 * @returns {Promise<{
 *     integrity: string | null,
 *     shasum: string | null,
 *     tarballPath: string,
 * }>}
 */
export async function packNpmPackage({
    cwd,
    outDir,
    packTarget,
    registryEntry,
}) {
    // Pass `--no-include-workspace-root` defensively against `include-workspace-root=true` in `.npmrc`, which would otherwise cause `npm pack` to bundle the monorepo root.
    const args = ['pack', '--json', '--pack-destination', outDir, '--no-include-workspace-root'];
    if (registryEntry?.url) args.push('--registry', registryEntry.url);
    // Downloading remote tarballs (e.g. in `hasNpmPackageChanged`) requires `--allow-remote=true`.
    if (packTarget) args.push('--allow-remote=all', packTarget);

    // const forkedStdout = forkStreamToBuffer(process.stdout); // Deprecated in favor using `createStreamableBuffer` directly, since `forkStreamToBuffer` doesn't play well with `spawn()`'s `options.stdio` (see its JSDoc for details). That said, the commented-out implementation that follows does work, but because it merely adds another layer of abstraction, I've resorted to using `createStreamableBuffer` directly, as said.
    const streamableBuffer = createStreamableBuffer();

    await spawnAuthNpmAsync(
        args,
        {
            cwd,
            onSpawn: childProcess => {
                // childProcess.stdout.pipe(forkedStdout.stream);
                // childProcess.stdout.pipe(process.stdout); // Too verbose for console, commented-out (can be re-enabled for debugging).
                childProcess.stdout.pipe(streamableBuffer.stream);
            },
            registryEntry,
            stdio: ['ignore', 'pipe', 'inherit'], // Passing `forkedStdout` instead of 'pipe' introduces an error, so we've resorted to using `createStreamableBuffer` directly. See `forkStreamToBuffer`'s JSDoc for details.
        },
    );

    // const buffer = await forkedStdout.bufferPromise; // Generally should resolve at the same time with `spawnAuthNpmAsync`.
    const buffer = await streamableBuffer.bufferPromise; // Generally should resolve at the same time with `spawnAuthNpmAsync`.

    const rawJson = buffer.toString('utf8').trim();
    if (rawJson.length === 0) throw new Error('Expected JSON output from `npm pack --json`, but received nothing.');

    const parsedJson = JSON.parse(rawJson);
    const packResult = Array.isArray(parsedJson) ? parsedJson[0] : parsedJson;

    const tarballName = packResult?.filename;
    if ((typeof tarballName !== 'string') || (tarballName.length === 0)) {
        throw new Error('Expected `npm pack --json` to return a tarball filename.');
    }

    const integrity = isNonEmptyString(packResult?.integrity) ? packResult.integrity : null;
    const shasum = isNonEmptyString(packResult?.shasum) ? packResult.shasum : null;

    return {
        integrity,
        shasum,
        tarballPath: path.join(outDir, tarballName),
    };
}
