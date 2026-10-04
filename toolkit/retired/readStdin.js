/**
 * Read UTF-8 script contents from standard input.
 *
 * @returns {Promise<string>}
 */
export async function readStdin() {
    const chunks = [];

    for await (const chunk of process.stdin) {
        chunks.push((typeof chunk === 'string') ? chunk : chunk.toString('utf8'));
    }

    return chunks.join('');
}
