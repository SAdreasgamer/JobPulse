#!/usr/bin/env bash
# Assert that every artifact carrying a product version agrees with the root
# VERSION file, and that release tags follow the vX.Y.Z convention.
#
# Run after the builds, so the extension check reads the manifest a real build
# produced rather than the config that generates it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() {
  printf 'check-version: %s\n' "$1" >&2
  exit 1
}

VERSION="$(tr -d '[:space:]' <VERSION)"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
  fail "VERSION must be a plain SemVer 'X.Y.Z'; found '$VERSION'."

# A version field here would be a second release authority that nothing reads.
if node -e 'process.exit("version" in require("./apps/extension/package.json") ? 0 : 1)'; then
  fail "apps/extension/package.json declares a 'version'; the root VERSION file owns it."
fi

MANIFEST="apps/extension/dist/manifest.json"
[[ -f "$MANIFEST" ]] ||
  fail "$MANIFEST is missing; run 'pnpm run build:ext' before this check."
MANIFEST_VERSION="$(node -e 'process.stdout.write(require("./'"$MANIFEST"'").version)')"
[[ "$MANIFEST_VERSION" == "$VERSION" ]] ||
  fail "built extension manifest is $MANIFEST_VERSION, VERSION is $VERSION."

# The API advertises the same number in its OpenAPI metadata (info.version).
API_VERSION="$(cd apps/api && uv run python -c 'from app.main import app; print(app.version)')"
[[ "$API_VERSION" == "$VERSION" ]] ||
  fail "API metadata is $API_VERSION, VERSION is $VERSION."

# Release tags are cut on the whole-repository commit that carries the bump, so
# a vX.Y.Z tag on HEAD must name the version HEAD declares. Tags elsewhere in
# history are not re-checked; only the shape is enforced repository-wide.
#
# These two loops are inert on a CI checkout, which fetches no tags. They guard
# the moment that matters — tagging a release locally — rather than every push.
while read -r tag; do
  [[ -z "$tag" ]] && continue
  [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
    fail "tag '$tag' does not follow the vX.Y.Z release-tag convention."
done < <(git tag --list 'v*' 2>/dev/null || true)

while read -r tag; do
  [[ -z "$tag" ]] && continue
  [[ "$tag" == "v$VERSION" ]] ||
    fail "HEAD is tagged '$tag' but declares VERSION $VERSION; they must match."
done < <(git tag --points-at HEAD --list 'v*' 2>/dev/null || true)

printf 'version %s is consistent across VERSION, the built manifest, and the API.\n' "$VERSION"
