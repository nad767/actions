import { execFileSync } from 'node:child_process';
import {
    cp,
    mkdir,
    rm,
} from 'node:fs/promises';
import path from 'node:path';

import { modifyJsoncAsync } from '../toolkit/utils/modifyJsoncAsync.js';
import { normalizeDevcontainerFeaturesConf } from '../toolkit/utils/normalizeDevcontainerFeaturesConf.js';
import { readJsonEnvVar } from '../toolkit/utils/readJsonEnvVar.js';
import { resolveDevcontainerFeatureConfigAsync } from '../toolkit/utils/resolveDevcontainerFeatureConfigAsync.js';

async function main() {
    const wsPath = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const featuresPublishDir = process.env.FEATURES_PUBLISH_DIR;
    if (!featuresPublishDir) throw new Error('Missing `FEATURES_PUBLISH_DIR`.');

    const rawTargets = readJsonEnvVar('TARGETS_JSON');
    if (!Array.isArray(rawTargets)) throw new TypeError('Devcontainer feature publish config must be an array.');
    const normalizedTargets = rawTargets.map(rawFeatureConfig => normalizeDevcontainerFeaturesConf(rawFeatureConfig));

    await rm(featuresPublishDir, { force: true, recursive: true });
    await mkdir(featuresPublishDir, { recursive: true });

    for (const rawFeatureConfig of normalizedTargets) {
        const featureConfig = await resolveDevcontainerFeatureConfigAsync(rawFeatureConfig);
        const sourceDir = path.join(wsPath, featureConfig.path);
        const destinationDir = path.join(featuresPublishDir, path.basename(featureConfig.path));

        console.log(`Staging ${featureConfig.packageName} from ${featureConfig.path} to ${destinationDir}.`);
        await cp(sourceDir, destinationDir, { recursive: true });

        // Inject current Git HEAD commit SHA as `gitHead` into the staged `devcontainer-feature.json` manifest.
        // `devcontainer-feature.json` officially supports JSONC (JSON with Comments).
        // Unlike native `JSON` utils, `modifyJsoncAsync` doesn't throw on JSONC comments, and performs an AST-level edit so the comments are preserved.
        const manifestPathInDest = path.join(destinationDir, 'devcontainer-feature.json');
        const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: wsPath, encoding: 'utf8' }).trim();
        await modifyJsoncAsync(manifestPathInDest, { gitHead: headSha });
    }
}

await main();
