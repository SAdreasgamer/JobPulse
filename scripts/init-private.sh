#!/usr/bin/env bash
# Create a new per-user private overlay repository, then enable live TypeScript
# resolution against this public checkout.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$ROOT/templates/private-overlay"
PRIVATE_ROOT="${1:-${JOB_TRACKER_PRIVATE_DIR:-$ROOT/../job-tracker-private}}"

if [[ $# -gt 1 ]]; then
  echo "usage: $0 [private-repo-path]" >&2
  exit 2
fi
if [[ ! -d "$TEMPLATE/overlay" ]]; then
  echo "error: private overlay template is missing at $TEMPLATE" >&2
  exit 2
fi
if [[ -e "$PRIVATE_ROOT" && ! -d "$PRIVATE_ROOT" ]]; then
  echo "error: $PRIVATE_ROOT exists and is not a directory" >&2
  exit 2
fi
if [[ -d "$PRIVATE_ROOT" ]] && find "$PRIVATE_ROOT" -mindepth 1 -print -quit | grep -q .; then
  echo "error: $PRIVATE_ROOT is not empty" >&2
  echo "hint: use scripts/setup-private-dev.sh for an existing private repository" >&2
  exit 2
fi

mkdir -p "$(dirname "$PRIVATE_ROOT")"
PRIVATE_PARENT="$(cd "$(dirname "$PRIVATE_ROOT")" && pwd)"
PRIVATE_ROOT="$PRIVATE_PARENT/$(basename "$PRIVATE_ROOT")"
if [[ "$PRIVATE_ROOT" == "$ROOT" || "$PRIVATE_ROOT" == "$ROOT"/* ]]; then
  echo "error: the private repository must live outside the public checkout" >&2
  exit 2
fi

mkdir -p "$PRIVATE_ROOT"
cp -R "$TEMPLATE/." "$PRIVATE_ROOT/"
git -C "$PRIVATE_ROOT" init

JOB_TRACKER_PRIVATE_DIR="$PRIVATE_ROOT" bash "$ROOT/scripts/setup-private-dev.sh"

echo
echo "private overlay created at $PRIVATE_ROOT"
echo "next: add an adapter under overlay/apps/extension/src/adapters/local/<site>/"
echo "then run: bash scripts/sync-private.sh"
