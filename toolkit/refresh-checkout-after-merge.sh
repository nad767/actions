#!/usr/bin/env bash

set -euo pipefail

# After the version-bump PR is merged, the Actions checkout still points at the
# pre-merge commit. Refresh the runner checkout so the remaining build and
# publish steps run against the merged base branch.

# `BASE_BRANCH` is set in the reusable workflow job's env.
if [[ -z "$BASE_BRANCH" ]]; then
  echo 'Missing `BASE_BRANCH`.' >&2
  exit 1
fi

# Keep the refresh fast-forward-only so the workflow cannot create an extra
# merge commit in the runner workspace.
git fetch origin "$BASE_BRANCH"
git checkout "$BASE_BRANCH"
git pull --ff-only origin "$BASE_BRANCH"

# Later steps use this exact commit SHA for the local-sync handshake.
echo "publish_sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"
