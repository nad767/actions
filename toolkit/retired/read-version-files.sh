#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${GITHUB_OUTPUT:-}" ]]; then
  echo 'Missing `GITHUB_OUTPUT`.' >&2
  exit 1
fi

# Publish conflict resolution can rewrite the root lockfile and/or the publishable package manifests.
version_files="$({
  jq -r '["package-lock.json"] + (.publishableDirs | map("\(.path)/package.json")) | .[]' \
    ./.github/workflows/publish-github-packages/workflow.config.json
})"

# Log
echo 'Read `version_files`:'
printf '%s\n' "$version_files"

# `$GITHUB_OUTPUT` is a file that the Actions runner parses after this step finishes.
# For multiline outputs, the file format is:
#
#   output_name<<DELIMITER
#   line 1
#   line 2
#   DELIMITER
#
# Dumping the raw file shows the delimiting lines (`version_files<<VERSION_FILES_EOF` and `VERSION_FILES_EOF`).
# Those are serialization markers for the runner, which only publishes the lines between them as `steps.read_version_files.outputs.version_files`.
{
  echo 'version_files<<VERSION_FILES_EOF'
  printf '%s\n' "$version_files"
  echo 'VERSION_FILES_EOF'
  echo
} >> "$GITHUB_OUTPUT"
