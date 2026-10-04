import {
    readFile,
    unlink,
    writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { findNpmProjectRoot } from './findNpmProjectRoot.js';
import { resolveNpmRegistries } from './resolveNpmRegistries.js';
import { spawnAsync } from './spawnAsync.js';

const ANSI_GRAY = '\u{1B}[90m';
const ANSI_GREEN = '\u{1B}[32m';
const ANSI_STRIKETHROUGH = '\u{1B}[9m';
const ANSI_RESET = '\u{1B}[0m';

/**
 * Format `.npmrc` line entries for logging, annotating environment variable placeholders with resolution status.
 * Replaced lines are rendered with ANSI strikethrough, and replacement/added lines are highlighted in green.
 *
 * @param {Array<{ type: 'unchanged', line: string } | { type: 'replaced', oldLine: string, newLine: string } | { type: 'added', newLine: string }>} entries
 * @param {Record<string, string>} npmEnv
 * @returns {string}
 */
function formatNpmrcLogBlock(entries, npmEnv) {
    const annotatePlaceholders = str => str.replaceAll(
        /\$\{([^}]+)\}/gu,
        (_, envVarName) => `\${${envVarName} ${Object.hasOwn(npmEnv, envVarName) ? '✅' : '❌'}}`,
    );

    const formattedLines = [];

    for (const entry of entries) {
        switch (entry.type) {
            case 'unchanged': {
                // `.npmrc` comments start with `#` or `;` and end with EOL. They can be in their own line, or trailing after a config entry. See https://docs.npmjs.com/cli/v11/configuring-npm/npmrc#comments.
                const lineStripped = entry.line.replace(/\s*[#;].*$/u, '');
                if (lineStripped.trim() !== '') {
                    formattedLines.push(`  ${ANSI_GRAY}${annotatePlaceholders(lineStripped)}${ANSI_RESET}`);
                }
                break;
            }
            case 'replaced': {
                const oldLineStripped = entry.oldLine.replace(/\s*[#;].*$/u, '');
                const newLineStripped = entry.newLine.replace(/\s*[#;].*$/u, '');
                if (oldLineStripped.trim() !== '') {
                    formattedLines.push(`  ${ANSI_STRIKETHROUGH}${ANSI_GRAY}${annotatePlaceholders(oldLineStripped)}${ANSI_RESET}`);
                }
                if (newLineStripped.trim() !== '') {
                    formattedLines.push(`  ${ANSI_GREEN}${annotatePlaceholders(newLineStripped)}${ANSI_RESET}`);
                }
                break;
            }
            case 'added': {
                const newLineStripped = entry.newLine.replace(/\s*[#;].*$/u, '');
                if (newLineStripped.trim() !== '') {
                    formattedLines.push(`  ${ANSI_GREEN}${annotatePlaceholders(newLineStripped)}${ANSI_RESET}`);
                }
                break;
            }
            // no-default-case
        }
    }

    const annotatedNpmrcContents = formattedLines.join('\n');

    return (annotatedNpmrcContents !== '')
        ? annotatedNpmrcContents
        : `${ANSI_GRAY}<empty after stripping comments>${ANSI_RESET}`;
}

/**
 * Create/patch a "per-project" `.npmrc` file, ensuring npm can authenticate to the target registry, then spawn the desired npm command as a child process with the appropriate env vars for auth. Finally, restore the original `.npmrc` content if it was modified.
 *
 * Motivation:
 * `@actions/setup-node` generates a "per-user" `.npmrc`, which, in cases of conflicting configurations, loses to a "per-project" `.npmrc` (when both exist). See https://docs.npmjs.com/cli/v11/configuring-npm/npmrc#:~:text=config%20options%20are%20resolved%20in%20priority%20order.
 * Some projects that call this workflow indeed contain a "per-project" `.npmrc` that already contains an `authToken` to the target registry, which is based on some internal secret. This we can't know in advance. We can mitigate this by always injecting the target repo's npmrc secrets in each step that needs npm auth and call it a day.
 * Our solution aims to be more robust, and consists of:
 * - Not relying on `@actions/setup-node` for auth setup at all (also good for separation of concerns).
 * - Creating/patching the target repository's `.npmrc` in-place to ensure it has both:
 *   - A mapping to the target scoped-registry.
 *   - A hard-coded *or* resolvable `authToken` to that registry.
 *
 * @param {string[]} args Command-line arguments passed to `npm`.
 * @param {object} [options={}] Options for spawning the authenticated npm process.
 * @param {string} [options.cwd] Working directory to spawn the child process in (defaults to `process.cwd()`).
 * @param {NodeJS.ProcessEnv} [options.env=process.env] Environment variables for the child process.
 * @param {string} [options.ghpScope] GitHub Packages scope name (without leading `@`).
 * @param {string} [options.npmrcPath] Optional explicit path to the `.npmrc` file to create or patch.
 * @param {string} [options.npmrcSecrets] Multiline `KEY=VALUE` pairs of secrets to patch into the child process environment.
 * @param {string} [options.registry] Target registry name or alias (e.g. `'ghp'`, `'npmjs'`).
 * @param {import('./npmRegistries.js').NpmRegistryEntry} [options.registryEntry] Target registry configuration entry.
 * @param {string} [options.tokenVar] Custom environment variable name holding the registry authentication token.
 * @param {(childProcess: import('node:child_process').ChildProcess) => void} [options.onSpawn] Callback invoked with the spawned child process instance.
 * @param {import('node:child_process').StdioOptions} [options.stdio] Stdio configuration for the spawned child process.
 * @returns {Promise<{ exitCode: number | null, signal: NodeJS.Signals | null }>}
 */
export async function spawnAuthNpmAsync(
    args,
    {
        cwd, // Resolves to `process.cwd()` in `spawn()` if not provided.
        env = process.env, // Same as `spawn()`'s default.
        ghpScope,
        npmrcPath,
        npmrcSecrets = env.NPMRC_SECRETS ?? '',
        registry,
        registryEntry,
        tokenVar,
        ...spawnAsyncOptions
    } = {},
) {
    let resolvedNpmrcPath;

    if (npmrcPath) {
        resolvedNpmrcPath = path.resolve(npmrcPath);
    }
    else {
        const startDir = cwd ? path.resolve(cwd) : process.cwd();
        const projectRoot = await findNpmProjectRoot(startDir);
        resolvedNpmrcPath = path.join(projectRoot, '.npmrc');
    }

    const repoOwner = env.GITHUB_REPOSITORY?.split('/', 1)?.[0];

    const intermediateGhpScope = ghpScope ?? env.GHP_SCOPE ?? repoOwner ?? '';
    const resolvedGhpScope = intermediateGhpScope.replace(/^@/u, '');
    if (!resolvedGhpScope) throw new Error('Missing `ghp_scope`. Set `GHP_SCOPE` in the workflow env or pass it explicitly.');

    const intermediateRegistryEntry = registryEntry ?? (() => {
        const resolvedRegistryEntries = resolveNpmRegistries(registry ?? env.REGISTRY, { fallback: 'ghp' });

        // When the caller does not specify a concrete registry, prefer GitHub Packages so install/build steps still get private-package auth even if public npm is also configured.
        return resolvedRegistryEntries.find(registryEntry => registryEntry.name === 'ghp') ?? resolvedRegistryEntries[0];
    })();
    const resolvedRegistryEntry = tokenVar
        ? { ...intermediateRegistryEntry, tokenVar }
        : intermediateRegistryEntry;
    const isPublishCommand = args[0] === 'publish';

    // Parse `NPMRC_SECRETS` from the workflow step's env and return them as an env patch for npm child processes.
    // Note: I've previously tried writing a temporary `.npmrc` file, with placeholders already populated with respective secret values, then passing this file to `npm install` via `--userconfig=/tmp/.my-temp-npmrc`. That approach failed when the repository already contained `.npmrc`, since "per-project" configs have higher priority than "per-user" config (see https://docs.npmjs.com/cli/v11/using-npm/config#npmrc-files).
    const parsedNpmSecretsEntries = npmrcSecrets
        .split(/\r?\n/u)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            const separatorIdx = line.indexOf('=');
            if (separatorIdx < 1) throw new Error(`Invalid \`NPMRC_SECRETS\` entry: ${line}. Expected KEY=VALUE.`);
            return [
                line.slice(0, separatorIdx).trim(),
                line.slice(separatorIdx + 1).trim(),
            ];
        });
    console.debug(`Received ${parsedNpmSecretsEntries.length} \`NPMRC_SECRETS\` entries for npm child process env patches.`);
    if (parsedNpmSecretsEntries.length > 0) {
        console.debug(
            parsedNpmSecretsEntries
                .map(([key, value]) => `  ${key}: ${value.slice(0, 8)}${'*'.repeat(Math.max(0, value.length - 8))}`)
                .join('\n'),
        );
    }

    // Parse the `.npmrc` file (if it exists).
    const npmEnv = { ...env, ...Object.fromEntries(parsedNpmSecretsEntries) };
    const npmrcContents = await readFile(resolvedNpmrcPath, 'utf8').catch(err => {
        if (err?.code === 'ENOENT') return null; // No "per-project" `.npmrc` file is a valid scenario.
        throw err;
    });

    const npmrcLines = npmrcContents?.split(/\r?\n/u) ?? [];
    /** @type {Array<{ type: 'unchanged', line: string } | { type: 'replaced', oldLine: string, newLine: string } | { type: 'added', newLine: string }>} */
    const logEntries = npmrcLines.map(line => ({ line, type: 'unchanged' }));

    // Reconcile the scope mapping and registry auth in-place so we preserve unrelated config from the caller repository.
    const scopedRegistryAnyValueRegex = new RegExp(String.raw`^\s*@${RegExp.escape(resolvedGhpScope)}:registry\s*=`, 'u');
    const registryUrlRegex = new RegExp(String.raw`^\s*https://?${RegExp.escape(resolvedRegistryEntry.canon)}/?`, 'u'); // Matches the registry URL with any protocol and optional subdomain, to allow some flexibility in existing config.
    const registryAuthTokenRegex = new RegExp(String.raw`^\s*(?:https:)?//${RegExp.escape(resolvedRegistryEntry.canon)}/?:_authToken\s*=`, 'u'); // `(?:https:)?//` is an optional non-capturing group, because both `//registry.example.com/:_authToken=xxx` and `https://registry.example.com/:_authToken=xxx` are valid npmrc entries for registry auth.
    let scopedRegistryMappingLineIdx = -1;
    let isScopedRegistryMappingExact = false;
    let registryAuthTokenLineIdx = -1;
    let isRegistryAuthTokenResolvable = false;

    for (const [lineIdx, line] of npmrcLines.entries()) {
        const lineNoComments = line.replace(/[#;].*$/u, ''); // Strip comments prior to avoid regex false positives on commented-out config lines.
        if (scopedRegistryAnyValueRegex.test(lineNoComments)) {
            scopedRegistryMappingLineIdx = lineIdx;
            const separatorIdx = lineNoComments.indexOf('=');
            const scopedRegistryValue = (separatorIdx !== -1) ? lineNoComments.slice(separatorIdx + 1).trim() : '';
            isScopedRegistryMappingExact = registryUrlRegex.test(scopedRegistryValue);
        }
        if (registryAuthTokenRegex.test(lineNoComments)) {
            registryAuthTokenLineIdx = lineIdx;
            const separatorIdx = line.indexOf('=');
            const registryAuthTokenValue = (separatorIdx !== -1) ? line.slice(separatorIdx + 1).trim() : '';
            const registryAuthTokenValuePlaceholders = registryAuthTokenValue.matchAll(/\$\{([^}]+)\}/gu).toArray();
            // Note that if `registryAuthTokenValuePlaceholders` is an empty array (i.e. no placeholders, i.e. hardcoded auth token), `every` will return `true`, which is the desired behavior since it means the value is already resolvable as-is.
            if (registryAuthTokenValuePlaceholders.every(([, envVarName]) => Object.hasOwn(npmEnv, envVarName))) {
                isRegistryAuthTokenResolvable = true;
            }
        }
    }

    let didRewriteNpmrc = false;

    // Check for the existence of a scoped-registry mapping for the target scope, and add/update it if needed.
    const scopedRegistryExactLine = `@${resolvedGhpScope}:registry=${resolvedRegistryEntry.url}`;
    if (scopedRegistryMappingLineIdx === -1) {
        console.debug(`No @${resolvedGhpScope} registry mapping found in ${resolvedNpmrcPath}; appending one.`);
        npmrcLines.push(scopedRegistryExactLine);
        logEntries.push({ newLine: scopedRegistryExactLine, type: 'added' });
        didRewriteNpmrc = true;
    }
    else if (!isScopedRegistryMappingExact) {
        console.debug(`Rewriting the @${resolvedGhpScope} registry mapping in ${resolvedNpmrcPath} to ${resolvedRegistryEntry.url}.`);
        const oldLine = npmrcLines[scopedRegistryMappingLineIdx];
        npmrcLines[scopedRegistryMappingLineIdx] = scopedRegistryExactLine;
        logEntries[scopedRegistryMappingLineIdx] = { newLine: scopedRegistryExactLine, oldLine, type: 'replaced' };
        didRewriteNpmrc = true;
    }
    else {
        console.debug(`Found an existing @${resolvedGhpScope} registry mapping in ${resolvedNpmrcPath}; leaving it unchanged.`);
    }

    // Check for the existence of an auth token entry for the target registry, and add/update it if needed.
    if (isRegistryAuthTokenResolvable) {
        console.debug(`Found a resolvable authToken entry for ${resolvedRegistryEntry.canon} in ${resolvedNpmrcPath}; leaving it unchanged.`);
    }
    else {
        const registryAuthExactLine = `//${resolvedRegistryEntry.canon}/:_authToken=\${${resolvedRegistryEntry.tokenVar}}`;
        const tokenValue = npmEnv[resolvedRegistryEntry.tokenVar];

        if ((typeof tokenValue !== 'string') || (tokenValue.length === 0)) {
            if ((resolvedRegistryEntry.name === 'npmjs') && !isPublishCommand) {
                console.debug(`No ${resolvedRegistryEntry.tokenVar} provided for ${resolvedRegistryEntry.canon}; proceeding without injecting registry auth because public npm reads do not require it.`);
            }
            else {
                throw new Error(`Missing \`${resolvedRegistryEntry.tokenVar}\` while patching \`${resolvedNpmrcPath}\`. The fallback auth line uses \`${registryAuthExactLine}\`.`);
            }
        }
        else if (registryAuthTokenLineIdx === -1) {
            console.debug(`No authToken entry for ${resolvedRegistryEntry.canon} found in \`${resolvedNpmrcPath}\`; appending a \`${registryAuthExactLine}\` fallback.`);
            npmrcLines.push(registryAuthExactLine);
            logEntries.push({ newLine: registryAuthExactLine, type: 'added' });
            didRewriteNpmrc = true;
        }
        else {
            console.debug(`Found an unresolvable authToken entry for ${resolvedRegistryEntry.canon} in \`${resolvedNpmrcPath}\`; replacing it with \`${registryAuthExactLine}\`.`);
            const oldLine = npmrcLines[registryAuthTokenLineIdx];
            npmrcLines[registryAuthTokenLineIdx] = registryAuthExactLine;
            logEntries[registryAuthTokenLineIdx] = { newLine: registryAuthExactLine, oldLine, type: 'replaced' };
            didRewriteNpmrc = true;
        }
    }

    if (didRewriteNpmrc) {
        const patchedNpmrcContents = `${npmrcLines.join('\n').replace(/\n*$/u, '')}\n`;

        await writeFile(resolvedNpmrcPath, patchedNpmrcContents);
        console.debug(`Wrote temporary registry auth changes to \`${resolvedNpmrcPath}\`.`);
    }

    // Log the `.npmrc` content with annotations indicating whether env var placeholders are resolvable, to help debugging potential auth issues during install.
    console.debug(`Inspecting \`${resolvedNpmrcPath}\` for @${resolvedGhpScope} registry auth.`);
    if (npmrcContents !== null) {
        const header = didRewriteNpmrc
            ? 'Patched "per-project" `.npmrc` (comments stripped):'
            : 'Existing "per-project" `.npmrc` (comments stripped):';
        console.debug([
            header,
            formatNpmrcLogBlock(logEntries, npmEnv),
            '',
        ].join('\n'));
    }
    else if (didRewriteNpmrc) {
        console.debug([
            'Created temporary "per-project" `.npmrc` (comments stripped):',
            formatNpmrcLogBlock(logEntries, npmEnv),
            '',
        ].join('\n'));
    }
    else {
        console.debug('No "per-project" `.npmrc` found; proceeding without creating one.');
    }

    return spawnAsync( // Or `return await ...` - there's no actual difference.
        'npm',
        args,
        {
            cwd,
            env: npmEnv,
            ...spawnAsyncOptions,
        },
    )
        // Restore the original `.npmrc` once the caller finishes its npm work.
        // Note: `.finally()` fulfills with the eventual state of the promise, i.e. the caller will see the final outcome of the original promise (whether resolved or rejected), which is the desired behavior.
        // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/finally#:~:text=A%20finally()%20call%20is%20usually%20transparent%20and%20reflects%20the%20eventual%20state%20of%20the%20original%20promise.
        .finally(async () => {
            if (!didRewriteNpmrc) return;
            if (npmrcContents === null) {
                await unlink(resolvedNpmrcPath).catch(err => { if (err?.code !== 'ENOENT') throw err; });
                console.debug(`Removed temporary \`${resolvedNpmrcPath}\`.`);
            }
            else {
                await writeFile(resolvedNpmrcPath, npmrcContents);
                console.debug(`Restored original \`${resolvedNpmrcPath}\`.`);
            }
        });
}
