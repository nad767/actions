import path from 'node:path';

/**
 * Resolve the shared artifact directory used by Debian publish workflow steps.
 *
 * Motivation: build, diff-prune, and publish steps all read the same staged
 * `.deb` outputs, so the path definition should live in one place.
 *
 * @returns {string}
 */
export function getDebsArtifactsDir() {
    // `GITHUB_WORKSPACE` injected automatically by GitHub Actions.
    return path.join(process.env.GITHUB_WORKSPACE ?? process.cwd(), '.publish-packages-deb-artifacts');
}
