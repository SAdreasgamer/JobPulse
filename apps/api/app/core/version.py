"""The product version, read from the repository's canonical `VERSION` file.

The extension manifest, the API metadata, and the `vX.Y.Z` release tag all
derive from that one file, so a release bump is a single edit and no component
can declare a version of its own. `apps/api/pyproject.toml`'s version is packaging
metadata that uv requires, not a release authority.

Read at import rather than copied into a constant: a missing or unreadable
`VERSION` is a broken checkout, and failing loudly beats serving a version that
silently disagrees with the shipped extension.
"""

from pathlib import Path

VERSION_PATH = Path(__file__).resolve().parents[4] / "VERSION"

PRODUCT_VERSION = VERSION_PATH.read_text().strip()
