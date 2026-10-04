import { parseBoolean } from './parseBoolean.js';
import { resolveNpmRegistries } from './resolveNpmRegistries.js';

/**
 * Normalize one raw npm publish config entry.
 *
 * @param {any} rawPublishableDir
 * @returns {{
 *     buildOutDir?: string,
 *     buildScript?: string,
 *     ghpName?: string,
 *     ghpScope?: string,
 *     npmjsName?: string,
 *     npmjsScope?: string,
 *     path: string,
 *     registryEntries: import('./npmRegistries.js').NpmRegistryEntry[],
 *     stageToNpmjs?: boolean,
 * }}
 */
export function normalizeNpmsConf(rawPublishableDir) {
    if ((typeof rawPublishableDir?.path !== 'string') || (rawPublishableDir.path.length === 0)) {
        throw new TypeError('Each npm publish config entry must include a non-empty `path`.');
    }

    if ((rawPublishableDir.buildScript !== undefined) && ((typeof rawPublishableDir.buildScript !== 'string') || (rawPublishableDir.buildScript.length === 0))) {
        throw new TypeError(`Publishable package ${rawPublishableDir.path} has an invalid \`buildScript\` value.`);
    }

    const hasBuildStep = typeof rawPublishableDir.buildScript === 'string';

    if (hasBuildStep && ((typeof rawPublishableDir.buildOutDir !== 'string') || (rawPublishableDir.buildOutDir.length === 0))) {
        throw new TypeError(`Buildable publishable package ${rawPublishableDir.path} is missing \`buildOutDir\`.`);
    }

    if (!hasBuildStep && (rawPublishableDir.buildOutDir !== undefined)) {
        throw new TypeError(`Non-buildable publishable package ${rawPublishableDir.path} must not declare \`buildOutDir\`.`);
    }

    if (rawPublishableDir.registries !== undefined) {
        throw new TypeError(`Publishable package ${rawPublishableDir.path} uses deprecated \`registries\`. Use \`registry\` with a comma-separated string instead.`);
    }

    const rawRegistry = rawPublishableDir.registry;
    if ((rawRegistry !== undefined) && ((typeof rawRegistry !== 'string') || (rawRegistry.trim().length === 0))) {
        throw new TypeError(`Publishable package ${rawPublishableDir.path} has an invalid \`registry\` value. Expected a non-empty string.`);
    }

    const ghpScope = rawPublishableDir.ghpScope;
    if ((ghpScope !== undefined) && ((typeof ghpScope !== 'string') || (ghpScope.trim().length === 0))) {
        throw new TypeError(`Publishable package ${rawPublishableDir.path} has an invalid \`ghpScope\` value. Expected a non-empty string.`);
    }

    const ghpName = rawPublishableDir.ghpName;
    if ((ghpName !== undefined) && ((typeof ghpName !== 'string') || (ghpName.trim().length === 0))) {
        throw new TypeError(`Publishable package ${rawPublishableDir.path} has an invalid \`ghpName\` value. Expected a non-empty string.`);
    }

    const npmjsScope = rawPublishableDir.npmjsScope;
    if ((npmjsScope !== undefined) && ((typeof npmjsScope !== 'string') || (npmjsScope.trim().length === 0))) {
        throw new TypeError(`Publishable package ${rawPublishableDir.path} has an invalid \`npmjsScope\` value. Expected a non-empty string.`);
    }

    const npmjsName = rawPublishableDir.npmjsName;
    if ((npmjsName !== undefined) && ((typeof npmjsName !== 'string') || (npmjsName.trim().length === 0))) {
        throw new TypeError(`Publishable package ${rawPublishableDir.path} has an invalid \`npmjsName\` value. Expected a non-empty string.`);
    }

    let stageToNpmjs;
    if (rawPublishableDir.stageToNpmjs !== undefined) {
        if (typeof rawPublishableDir.stageToNpmjs === 'boolean' || typeof rawPublishableDir.stageToNpmjs === 'string') {
            stageToNpmjs = parseBoolean(rawPublishableDir.stageToNpmjs);
        } else {
            throw new TypeError(`Publishable package ${rawPublishableDir.path} has an invalid \`stageToNpmjs\` value. Expected a boolean.`);
        }
    }

    const registryEntries = resolveNpmRegistries(rawRegistry, { fallback: process.env.REGISTRY });

    return {
        buildOutDir: hasBuildStep ? rawPublishableDir.buildOutDir : undefined,
        buildScript: hasBuildStep ? rawPublishableDir.buildScript : undefined,
        ghpName,
        ghpScope,
        npmjsName,
        npmjsScope,
        path:        rawPublishableDir.path,
        registryEntries,
        stageToNpmjs,
    };
}
