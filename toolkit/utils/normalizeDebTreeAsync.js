import {
    chmod,
    open,
    readdir,
} from 'node:fs/promises';
import path from 'node:path';

async function checkShebangAsync(filePath) {
    let fileHandle;
    try {
        fileHandle = await open(filePath, 'r');
        const buffer = Buffer.alloc(2);
        const { bytesRead } = await fileHandle.read(buffer, 0, 2, 0);
        return (bytesRead >= 2) && (buffer[0] === 0x23) && (buffer[1] === 0x21);
    }
    catch {
        return false;
    }
    finally {
        await fileHandle?.close();
    }
}

/**
 * Normalize the staged Debian package payload tree to predictable file modes.
 *
 * The scripts repository can carry developer-local permissions, so the package build normalizes:
 * - staged directories to 755.
 * - script entrypoints to 755.
 * - non-script files to 644 before `dpkg-deb` captures the archive.
 *
 * Public executables in this repository intentionally omit a `.sh` suffix, so the normalizer also treats shebang-prefixed files as executable payloads.
 *
 * @param {string} rootDir
 * @returns {Promise<void>}
 */
export async function normalizeDebTreeAsync(rootDir) {
    const pendingDirectories = [rootDir];

    while (pendingDirectories.length > 0) {
        const currentDirectory = pendingDirectories.pop();

        if (!currentDirectory) continue;

        await chmod(currentDirectory, 0o755);

        const directoryEntries = await readdir(currentDirectory, { withFileTypes: true });

        for (const directoryEntry of directoryEntries) {
            const childPath = path.join(currentDirectory, directoryEntry.name);

            if (directoryEntry.isDirectory()) {
                pendingDirectories.push(childPath);
                continue;
            }

            if (!directoryEntry.isFile()) continue;

            const isExecutable = directoryEntry.name.endsWith('.sh') || await checkShebangAsync(childPath);

            await chmod(childPath, isExecutable ? 0o755 : 0o644);
        }
    }
}
