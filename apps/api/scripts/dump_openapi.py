"""Dump the FastAPI OpenAPI schema as JSON to stdout.

Boots the app in-process (no server, no DB — `app.openapi()` is a pure computation
over the route/model definitions) so the shared TypeScript API types can be
generated from the single source of truth. Consumed by
`packages/shared/scripts/gen-api-types.sh`, which pipes this into openapi-typescript.
"""

import json
import sys

from app.main import app


def main() -> None:
    json.dump(app.openapi(), sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
