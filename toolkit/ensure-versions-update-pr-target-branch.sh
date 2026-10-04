#!/usr/bin/env bash

set -euo pipefail

# `GITHUB_REF_TYPE` is injected automatically by GitHub Actions.
if [[ "${GITHUB_REF_TYPE:-}" != 'branch' ]]; then
  echo 'Version updates are required, but this workflow run is not targeting a branch.' >&2
  exit 1
fi

echo 'Version updates require a pull request, and this workflow run targets a branch.'
