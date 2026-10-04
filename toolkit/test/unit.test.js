import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { normalizeNpmsConf } from '../utils/normalizeNpmsConf.js';
import { parseBoolean } from '../utils/parseBoolean.js';
import { resolveNpmRegistries, resolveNpmRegistryEntry } from '../utils/resolveNpmRegistries.js';
import { rewriteNpmPackageName } from '../utils/rewriteNpmPackageName.js';

describe('rewriteNpmPackageName', () => {
    test('leaves unscoped package name unchanged when no overrides or default scope provided', () => {
        const result = rewriteNpmPackageName('my-pkg');
        assert.equal(result, 'my-pkg');
    });

    test('applies defaultScope to unscoped package', () => {
        const result = rewriteNpmPackageName('my-pkg', { defaultScope: 'my-org' });
        assert.equal(result, '@my-org/my-pkg');
    });

    test('replaces existing scope with defaultScope', () => {
        const result = rewriteNpmPackageName('@old-org/my-pkg', { defaultScope: 'my-org' });
        assert.equal(result, '@my-org/my-pkg');
    });

    test('strips leading @ from defaultScope', () => {
        const result = rewriteNpmPackageName('my-pkg', { defaultScope: '@my-org' });
        assert.equal(result, '@my-org/my-pkg');
    });

    test('applies registry-specific scope override', () => {
        const result = rewriteNpmPackageName('@internal/my-pkg', {
            defaultScope: 'default-scope',
            registryName: 'npmjs',
            targetConfig: { npmjsScope: 'custom-scope' },
        });
        assert.equal(result, '@custom-scope/my-pkg');
    });

    test('applies registry-specific full name override', () => {
        const result = rewriteNpmPackageName('@internal/my-pkg', {
            registryName: 'npmjs',
            targetConfig: { npmjsName: '@public-org/public-pkg' },
        });
        assert.equal(result, '@public-org/public-pkg');
    });

    test('throws when package name is empty or invalid', () => {
        assert.throws(() => rewriteNpmPackageName(''), TypeError);
        assert.throws(() => rewriteNpmPackageName(null), TypeError);
    });

    test('throws when scope contains slashes', () => {
        assert.throws(() => rewriteNpmPackageName('my-pkg', {
            registryName: 'ghp',
            targetConfig: { ghpScope: 'invalid/scope' },
        }), /must not contain slashes/);
    });
});

describe('resolveNpmRegistries', () => {
    test('resolves default registry when undefined', () => {
        const entries = resolveNpmRegistries(undefined);
        assert.equal(entries.length, 1);
        assert.equal(entries[0].name, 'ghp');
        assert.equal(entries[0].url, 'https://npm.pkg.github.com');
    });

    test('resolves npmjs registry by alias', () => {
        const entries = resolveNpmRegistries('npmjs');
        assert.equal(entries.length, 1);
        assert.equal(entries[0].name, 'npmjs');
        assert.equal(entries[0].url, 'https://registry.npmjs.org/');
        assert.equal(entries[0].access, 'public');
    });

    test('resolves multiple registries with deduplication', () => {
        const entries = resolveNpmRegistries('ghp, npmjs, npm');
        assert.equal(entries.length, 2);
        assert.equal(entries[0].name, 'ghp');
        assert.equal(entries[1].name, 'npmjs');
    });

    test('resolves single registry entry helper', () => {
        const entry = resolveNpmRegistryEntry('npm');
        assert.equal(entry.name, 'npmjs');
    });

    test('throws for unknown registry name', () => {
        assert.throws(() => resolveNpmRegistries('unknown-registry'), /Unknown npm registry/);
    });
});

describe('normalizeNpmsConf', () => {
    test('normalizes a valid non-buildable config', () => {
        const conf = normalizeNpmsConf({ path: 'packages/core', registry: 'npmjs' });
        assert.equal(conf.path, 'packages/core');
        assert.equal(conf.buildScript, undefined);
        assert.equal(conf.buildOutDir, undefined);
        assert.equal(conf.registryEntries.length, 1);
        assert.equal(conf.registryEntries[0].name, 'npmjs');
    });

    test('normalizes a valid buildable config', () => {
        const conf = normalizeNpmsConf({
            buildOutDir: 'dist',
            buildScript: 'build',
            path:        'packages/ui',
            registry:    'ghp, npmjs',
        });
        assert.equal(conf.path, 'packages/ui');
        assert.equal(conf.buildScript, 'build');
        assert.equal(conf.buildOutDir, 'dist');
        assert.equal(conf.registryEntries.length, 2);
    });

    test('throws if path is missing or empty', () => {
        assert.throws(() => normalizeNpmsConf({}), /non-empty `path`/);
        assert.throws(() => normalizeNpmsConf({ path: '' }), /non-empty `path`/);
    });

    test('throws if buildScript declared without buildOutDir', () => {
        assert.throws(
            () => normalizeNpmsConf({ buildScript: 'build', path: 'packages/core' }),
            /missing `buildOutDir`/,
        );
    });

    test('throws if buildOutDir declared without buildScript', () => {
        assert.throws(
            () => normalizeNpmsConf({ buildOutDir: 'dist', path: 'packages/core' }),
            /must not declare `buildOutDir`/,
        );
    });

    test('normalizes stageToNpmjs option correctly', () => {
        const conf1 = normalizeNpmsConf({ path: 'packages/core', stageToNpmjs: true });
        assert.equal(conf1.stageToNpmjs, true);

        const conf2 = normalizeNpmsConf({ path: 'packages/core', stageToNpmjs: 'false' });
        assert.equal(conf2.stageToNpmjs, false);

        assert.throws(
            () => normalizeNpmsConf({ path: 'packages/core', stageToNpmjs: 123 }),
            /invalid `stageToNpmjs` value/,
        );
    });
});

describe('parseBoolean', () => {
    test('parses boolean primitives', () => {
        assert.equal(parseBoolean(true), true);
        assert.equal(parseBoolean(false), false);
    });

    test('parses truthy and falsy strings', () => {
        assert.equal(parseBoolean('true'), true);
        assert.equal(parseBoolean('TRUE'), true);
        assert.equal(parseBoolean('1'), true);
        assert.equal(parseBoolean('false'), false);
        assert.equal(parseBoolean('FALSE'), false);
        assert.equal(parseBoolean('0'), false);
    });

    test('handles numeric 1 and 0', () => {
        assert.equal(parseBoolean(1), true);
        assert.equal(parseBoolean(0), false);
    });

    test('falls back to `defaultValue` when value is `undefined`, `null`, empty, or unparseable', () => {
        assert.equal(parseBoolean(undefined), false);
        assert.equal(parseBoolean(null), false);
        assert.equal(parseBoolean(''), false);
        assert.equal(parseBoolean('   '), false);
        assert.equal(parseBoolean('random'), false);

        // Custom default value fallback:
        assert.equal(parseBoolean(undefined, true), true);
        assert.equal(parseBoolean(null, true), true);
        assert.equal(parseBoolean('', true), true);
        assert.equal(parseBoolean('random', true), true);

        // Explicit falsy overrides truthy default:
        assert.equal(parseBoolean('false', true), false);
        assert.equal(parseBoolean('0', true), false);
        assert.equal(parseBoolean(false, true), false);
    });
});
