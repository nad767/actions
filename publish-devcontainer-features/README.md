# Publish Devcontainer Features Action

A composite GitHub Action to prune, resolve version conflicts, stage, and publish Devcontainer Features to GitHub Container Registry (`ghcr.io`) using `@devcontainers/cli`.

## Features

- **Automated GHCR Publishing**: Publishes OCI Devcontainer Features directly to `ghcr.io/<namespace>/<feature>`.
- **Smart Git-Diff Pruning**: Compares local commits against the `gitHead` recorded in published feature manifests, skipping unchanged features.
- **Automated Semver Resolution**: Detects if feature versions already exist on GHCR, auto-bumps according to policy (`minor`, `patch`), and opens/merges a version pull request.
- **Modern CLI Integration**: Uses `@devcontainers/cli` directly, avoiding legacy action deprecation warnings.

## Inputs

| Input | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| `targets_json` | JSON array of Devcontainer Features to publish. | - | **Yes** |
| `registry` | Container registry to publish to. | `ghcr.io` | No |
| `namespace` | Namespace/collection segments under the registry. | `<owner>/features` | No |
| `version_conflict_policy` | How to handle published versions >= workspace version (`minor`, `patch`, `major`, `fail`). | `minor` | No |
| `merge_pr` | Whether to auto-merge the generated version-bump pull request before publishing. | `'true'` | No |
| `disable_prune_by_git_diff` | Skip the prune-by-git-diff check. | `'false'` | No |
| `disable_prune_by_build_diff` | Skip the prune-by-build-diff check. | `'false'` | No |
| `node_version` | Node.js version used for helper scripts. | `'26'` | No |

## Usage Example

```yaml
name: Publish Devcontainer Features

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write
  packages: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - uses: nad767/actions/publish-devcontainer-features@v1
        with:
          targets_json: |
            [
              {
                "path": "features/my-feature"
              }
            ]
```
