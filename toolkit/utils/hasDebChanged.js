import { createHash } from 'node:crypto';
import {
    mkdtemp,
    readFile,
    rm,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createDirectorySnapshot } from './createDirectorySnapshot.js';
import { extractDeb } from './extractDeb.js';

/**
 * Compare one built Debian package against one published Debian package.
 *
 * @param {{ localAssetPath: string, remoteAssetPath: string }} options
 * @returns {Promise<{ hasChanged: boolean, reason: string }>}
 */
export async function hasDebChanged({
    localAssetPath,
    remoteAssetPath,
}) {
    const [localBytes, remoteBytes] = await Promise.all([
        readFile(localAssetPath),
        readFile(remoteAssetPath),
    ]);
    const localSha256 = createHash('sha256').update(localBytes).digest('hex');
    const remoteSha256 = createHash('sha256').update(remoteBytes).digest('hex');

    if (localSha256 === remoteSha256) {
        return {
            hasChanged: false,
            reason:     'sha256 of package bytes match',
        };
    }

    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'has-deb-changed'));
    const localExtractDir = path.join(tempRoot, 'local-extract');
    const remoteExtractDir = path.join(tempRoot, 'remote-extract');

    try {
        const [localSnapshot, remoteSnapshot] = await Promise.all([
            extractDeb({
                outDir:      localExtractDir,
                packagePath: localAssetPath,
            })
                .then(() => createDirectorySnapshot(localExtractDir)),
            extractDeb({
                outDir:      remoteExtractDir,
                packagePath: remoteAssetPath,
            })
                .then(() => createDirectorySnapshot(remoteExtractDir)),
        ]);

        if (localSnapshot === remoteSnapshot) {
            return {
                hasChanged: false,
                reason:     'sha256 of extracted `.deb` contents match',
            };
        }

        return {
            hasChanged: true,
            reason:     'sha256 of package bytes & sha256 of extracted `.deb` contents both differ',
        };
    }
    finally {
        await rm(tempRoot, { force: true, recursive: true });
    }
}
