import { PassThrough, Writable } from 'node:stream';
import { finished } from 'node:stream/promises';

/**
 * Returns a writable stream and a promise that resolves to a buffer once the stream finishes writing to it.
 *
 * Unlike native `node:stream/promises.buffer()` and `stream.toArray()`, doesn't start consuming the stream right away, which allows piping more downstreams without being concerned with their attachment order.
 *
 * @returns {{stream: Writable, bufferPromise: Promise<Buffer>}} An object containing the buffer stream and a promise that resolves to the buffer once the stream finishes writing to it.
 */
export function createStreamableBuffer() {
    // <DEPRECATED> (succeeded by Node's native `finished` function)
    // // Without a promise, the buffer is returned before the stream is finished writing to it.
    // const { promise: bufferPromise, resolve: bufferResolve } = Promise.withResolvers();
    // </DEPRECATED>

    // The buffer. Alternatively, we can use an array, and use `array.push(chunk)` instead of `Buffer.concat([buffer, chunk])`, but a buffer is more performant, and works with all types data types. It might even be the case that Array is risky with `utf8` strings, if a chunk ends in the middle of a multi-byte character (see https://stackoverflow.com/questions/10623798/how-do-i-read-the-contents-of-a-node-js-stream-into-a-string-variable#comment102307555_49428486).
    let buffer = Buffer.alloc(0);

    // Create a stream dedicated to writing to the buffer.
    // In the context of `forkStreamToBuffer`, it's possible to skip the extra writable stream, and instead hook into `passthrough`'s (below) `write` and `end` events. However, having a dedicated stream right before the buffer with an increased `highWaterMark` may help mitigate backpressure upstream.
    const stream = new Writable({
        highWaterMark: 1024 * 1024, // 1 MiB.
        write:         (chunk, encoding, callback) => {
            buffer = Buffer.concat([buffer, chunk]);
            callback();
        },
        // <DEPRECATED> (succeeded by Node's native `finished` function)
        // final: callback => {
        //     bufferResolve(buffer);
        //     callback();
        // },
        // </DEPRECATED>
    });

    const bufferPromise = finished(stream).then(() => buffer);

    return { bufferPromise, stream };
}

/**
 * Takes a writable stream instance and returns a new stream instance which forks the flow of data from an upstream to both:
 * (a) the argument stream, as normal; and
 * (b) a buffer, which is accessible via a promise that resolves once the upstream finishes writing to it.
 *
 * **Caveat:** cannot be used in `spawn()`'s `options.stdio` array, since the returned `stream` is in fact not a "real" unix-like stream with a file descriptor, which is required for `stdio`.
 *
 * Useful for piping some stream to `stdout`/`stderr` while also capturing it for processing.
 *
 * @param {Writable} stream
 * @returns {{stream: PassThrough, bufferPromise: Promise<Buffer>}} An object containing the fork stream and a promise that resolves to the buffer once the upstream finishes writing to it.
 *
 * @example
 * ```js
 * const forkedStdout = forkStreamToBuffer(process.stdout);
 * someReadableStream.pipe(forkedStdout.stream);
 * const buffer = await forkedStdout.bufferPromise;
 * const str = buffer.toString('utf8'); // If data is a string. Encoding may vary.
 * ```
 */
export function forkStreamToBuffer(stream) {
    const { bufferPromise, stream: bufferStream } = createStreamableBuffer();

    // Create a passthrough stream that will be used to fork the flow of data to both the argument stream and the buffer stream.
    const passthrough = new PassThrough();
    passthrough.pipe(stream);
    passthrough.pipe(bufferStream);
    // passthru.on('data', chunk => { buf = Buffer.concat([buf, chunk]); });

    return {
        bufferPromise,
        stream: passthrough,
    };
}
