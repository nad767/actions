# Publish Debian Releases Action

A composite GitHub Action to build, prune, resolve version conflicts, and publish Debian bundles (`.deb`) directly to GitHub Releases.

## Features

- **Automated `.deb` Packaging**: Generates Debian control files, binary wrappers in `/usr/bin`, and builds `.deb` archives.
- **Release Synchronization**: Attaches built `.deb` assets directly to tag-based GitHub Releases and maintains a `latest` release tag.
- **Smart Git-Diff Pruning**: Compares local commits against release tags, skipping rebuilds for unmodified bundles.
- **Automated Semver Resolution**: Detects if a Debian bundle version already exists on GitHub Releases and automatically bumps the version.

## Inputs

| Input | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| `targets_json` | JSON array describing publishable Debian bundles and release metadata. | - | **Yes** |
| `version_conflict_policy` | How to handle published versions >= workspace version (`patch`, `minor`, `major`, `fail`). | `patch` | No |
| `merge_pr` | Whether to auto-merge the generated version-bump pull request before publishing. | `'true'` | No |
| `disable_prune_by_git_diff` | Skip the prune-by-git-diff check. | `'false'` | No |
| `disable_prune_by_build_diff` | Skip the prune-by-build-diff check. | `'false'` | No |

## Usage Example

```yaml
name: Publish Debian Releases

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - uses: nad767/actions/publish-deb-releases@v1
        with:
          targets_json: |
            [
              {
                "packageName": "my-tool",
                "version": "1.0.0",
                "architecture": "all",
                "description": "CLI tool",
                "installRoot": "/opt/my-tool",
                "sourceDir": "dist/bundle",
                "binWrappers": [
                  {
                    "name": "my-tool",
                    "target": "/opt/my-tool/bin/cli.js"
                  }
                ]
              }
            ]
```
