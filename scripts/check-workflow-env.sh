#!/usr/bin/env bash
# Workflow env-var guard (session 22c bugfix): fails if any `run:` script in
# .github/workflows/ references a $GITHUB_* / $RUNNER_* variable that is not
# a documented GitHub Actions default variable AND is not declared in that
# workflow's `env:` blocks. Prevents typos like $GITHUB_STEP_SUM from
# reaching CI (actionlint does not check shell variable existence).
#
# Usage: scripts/check-workflow-env.sh   (no arguments; exits non-zero on find)
set -euo pipefail

cd "$(dirname "$0")/.."

# Documented default environment variables (subset actually relevant to
# run: scripts; from GitHub Actions docs "Default environment variables").
# Note: NOT included on purpose: GITHUB_TOKEN (secret, must come via env:).
DEFAULTS='GITHUB_ACTION GITHUB_ACTION_PATH GITHUB_ACTION_REPOSITORY
GITHUB_ACTIONS GITHUB_ACTOR GITHUB_API_URL GITHUB_BASE_REF GITHUB_ENV
GITHUB_EVENT_NAME GITHUB_EVENT_PATH GITHUB_GRAPHQL_URL GITHUB_HEAD_REF
GITHUB_JOB GITHUB_REF GITHUB_REF_NAME GITHUB_REF_PROTECTED GITHUB_REPOSITORY
GITHUB_REPOSITORY_OWNER GITHUB_RUN_ATTEMPT GITHUB_RUN_ID GITHUB_RUN_NUMBER
GITHUB_SERVER_URL GITHUB_SHA GITHUB_STEP_SUMMARY GITHUB_TRIGGERING_ACTOR
GITHUB_WORKFLOW GITHUB_WORKFLOW_REF GITHUB_WORKFLOW_SHA GITHUB_WORKSPACE
RUNNER_ARCH RUNNER_DEBUG RUNNER_ENVIRONMENT RUNNER_NAME RUNNER_OS
RUNNER_TEMP RUNNER_TOOL_CACHE CI'

status=0
for wf in .github/workflows/*.yml .github/workflows/*.yaml; do
  [ -f "$wf" ] || continue
  # Variables declared anywhere in this workflow's env: blocks
  declared="$(grep -E '^\s+[A-Z_]+:' "$wf" | sed -E 's/^\s+([A-Z_]+):.*/\1/' | sort -u || true)"
  # All $GITHUB_* / $RUNNER_* / $CI references inside the file
  refs="$(grep -oE '\$\{?(GITHUB_[A-Z_]+|RUNNER_[A-Z_]+|CI)\}?' "$wf" | sed -E 's/^\$\{?//; s/\}?$//' | sort -u || true)"
  for ref in $refs; do
    known=0
    for d in $DEFAULTS; do
      [ "$ref" = "$d" ] && known=1
    done
    declared_here=0
    for d in $declared; do
      [ "$ref" = "$d" ] && declared_here=1
    done
    if [ "$known" = 0 ] && [ "$declared_here" = 0 ]; then
      echo "FAIL: $wf references \$${ref}, which is not a documented default variable and is not declared in an env: block" >&2
      status=1
    fi
  done
done

if [ "$status" = 0 ]; then
  echo "OK: no unknown GITHUB_/RUNNER_/CI variable references in workflow run scripts"
fi
exit "$status"
