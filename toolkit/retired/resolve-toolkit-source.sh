#!/usr/bin/env bash

set -euo pipefail

# `GITHUB_WORKFLOW_REF` is injected automatically by GitHub Actions.
if [[ -z "${GITHUB_WORKFLOW_REF:-}" ]]; then
  echo 'Missing `GITHUB_WORKFLOW_REF`.' >&2
  exit 1
fi

workflow_repository="${GITHUB_WORKFLOW_REF%%/.github/workflows/*}"
workflow_ref="${GITHUB_WORKFLOW_REF##*@}"

if [[ "$workflow_repository" == "$GITHUB_WORKFLOW_REF" || "$workflow_ref" == "$GITHUB_WORKFLOW_REF" ]]; then
  echo "Unable to parse GITHUB_WORKFLOW_REF: $GITHUB_WORKFLOW_REF" >&2
  exit 1
fi

echo "repository=$workflow_repository" >> "$GITHUB_OUTPUT"
echo "ref=$workflow_ref" >> "$GITHUB_OUTPUT"
