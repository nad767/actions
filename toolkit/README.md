# GitHub Actions Toolkit (`@nad767/actions-toolkit`)

Shared JavaScript-based toolkit that powers the custom composite GitHub Actions in this repository.

Composite actions resolve this toolkit dynamically via:

```bash
TOOLKIT_PATH="${{ github.action_path }}/../toolkit"
```

Because GitHub Actions checks out the complete action repository when an external workflow invokes `uses: nad767/actions/<action>@<ref>`, helper scripts and utilities are available immediately without requiring a second checkout.

## Architecture & Lifecycle

1. **Dependency Bootstrapping**:
   Each action runs `node "$TOOLKIT_PATH/install-toolkit-deps.js"` early in its run. This executes `npm ci` within `toolkit/` to install minimal required runtime dependencies (`semver`, `lodash`, `jsonc-parser`) in under a second.
2. **Git-Diff & Build-Diff Pruning**:
   To save CI minutes and avoid unnecessary registry operations, targets are pruned if their git history or packed build artifacts match existing releases.
3. **Automated Conflict Resolution**:
   If a package version already exists on the registry, the toolkit applies the configured conflict policy (`patch`, `minor`, `major`), updates manifests, creates a pull request, and automatically merges it if `merge_pr: true`.
4. **Isolated Registry Staging & Publishing**:
   Packages are staged in temporary scratch directories where package manifests and internal dependency references are rewritten to match the target registry namespace before publishing.

## Directory Layout

- **Lifecycle Scripts**:
  - `install-toolkit-deps.js`: Installs toolkit dependencies via `npm ci`.
  - `ensure-versions-update-pr-target-branch.sh`: Verifies PR base branch.
  - `merge-versions-update-pr.js`: Auto-merges conflict-resolution pull requests.
  - `refresh-checkout-after-merge.sh`: Pulls changes locally after PR merge.
  - `config.js`: Version conflict policies (`fail`, `patch`, `minor`, `major`).

- **Key Utilities (`utils/`)**:
  - `spawnAuthNpmAsync.js`: Spawns authenticated `npm` processes while dynamically configuring project `.npmrc` with appropriate registry tokens (`GITHUB_TOKEN` or `NPMJS_TOKEN`).
  - `npmRegistries.js` & `resolveNpmRegistries.js`: Definitions and resolvers for target registries (`ghp`, `npmjs`).
  - `rewriteNpmPackageName.js`: Renames and re-scopes packages per target registry configuration.
  - `rewriteInternalNpmPackageSpecifiers.js`: Adjusts in-code import specifiers between internal dependencies.
  - `resolveNpmVersions.js`: Queries remote registries, detects version conflicts, and calculates next semver bumps.
  - `writeResolvedNpmVersions.js`: Writes bumped versions to package manifests and lockfiles.
  - `sortNpmsConfs.js`: Topologically sorts publishable packages according to internal dependency graphs.
  - `hasTrackedPathsChangedSinceGitRef.js` & `hasNpmPackageChanged.js`: Detects if source code or build artifacts changed compared to published releases.

## Testing

Native node.js unit tests cover manifest parsing, registry resolution, and package rewriting rules:

```bash
cd toolkit
npm test
```
