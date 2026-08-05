# Private overlay

This project is split into a **public core** and an optional **private overlay**. The overlay holds what must not ship publicly: adapters for private or single-org job boards, their fixtures and tests, and the dashboard platform config naming them. The public core is fully functional without any of it — every overlay location is _absent-safe_, degrading gracefully with the build and tests passing.

The overlay isn't one directory. Each piece lives in a `local/` folder **co-located with the public code it extends**, because the discovery mechanism (Vite's `import.meta.glob`) resolves overlays relative to that code. Every `local/` path is gitignored, so a public clone never tracks them and a fresh clone works with them absent.

## Overlay locations

| Path | What it holds | How the public core loads it |
| --- | --- | --- |
| `apps/extension/src/adapters/local/` | Private site adapters, one directory per board (`<board>/adapter.ts`, `<board>/adapter.fixture.test.ts`, `<board>/fixtures/`), plus a shared `hosts.json` (manifest host permissions) | `content.ts` globs `adapters/local/**` recursively; `manifest.config.ts` reads `adapters/local/hosts.json` |
| `apps/web/src/platforms/local/` | Dashboard platform metadata for private boards, one module per board (label, link reconstruction, posting-date quirks) | `apps/web/src/platforms/index.ts` globs `local/*` and registers into the shared registry |
| `apps/api/scripts/local/` | Private scrapers | Run directly: `uv run python -m scripts.local.capture_jds` |

The public platform registry (`packages/shared/src/platforms/index.ts`) has **no** `local/`; private boards register into it at runtime from the web overlay above. The API stays platform-agnostic and needs no overlay at all, minting opaque `listing_id`s (`apps/api/app/core/ids.py`).

## Where the overlay lives — and where you edit it

The public repository never contains overlay files. The **editable source of truth** is a separate private Git repository whose tracked tree mirrors the three destinations under an `overlay/` root:

```text
job-tracker-private/
├── overlay/
│   └── apps/
│       ├── api/scripts/local/
│       ├── extension/
│       │   ├── tsconfig.json
│       │   └── src/adapters/local/
│       └── web/
│           ├── tsconfig.json
│           └── src/platforms/local/
└── README.md
```

Edit the overlay **there**, under `overlay/`, and install it into a public checkout with the one-way sync below. Never edit the installed `local/` copies: they're disposable outputs, overwritten on every run.

## First-time setup

The private repository is yours or your organization's; this project ships no common one. Install the public dependencies, then create a sibling private repository from the bundled scaffold:

```bash
pnpm install
bash scripts/init-private.sh
```

This creates `../job-tracker-private`, initializes it as a Git repository, and sets up live TypeScript feedback. To use another location or name, pass its path:

```bash
bash scripts/init-private.sh /path/to/my-private-adapters
export JOB_TRACKER_PRIVATE_DIR=/path/to/my-private-adapters
```

Keep that repository private. A remote is optional — add one for backup or team sharing.

If your organization already has its own private overlay, clone that instead and point the public checkout at it:

```bash
git clone <organization-private-repository> ../job-tracker-private
bash scripts/setup-private-dev.sh
```

`setup-private-dev.sh` creates ignored links from the private repository back to this checkout and its app-level dependencies. Its TypeScript projects merge the mirrored source trees with `rootDirs`, so editing private adapters gets live diagnostics. Re-run it after moving either checkout.

## Add, update, and sync an adapter

For a new company such as Company X:

1. Create `overlay/apps/extension/src/adapters/local/company-x/adapter.ts` in the private repository. Add fixture tests and HTML under the same directory.
2. Add Company X's host permission to `overlay/apps/extension/src/adapters/local/hosts.json`.
3. If needed, add dashboard metadata at `overlay/apps/web/src/platforms/local/company-x.ts`.
4. From the public repository, install the current private source:

```bash
bash scripts/sync-private.sh            # copy overlay/ into the local/ dirs
bash scripts/sync-private.sh --check    # report drift without writing; exit 1 if any
```

Run the public checks and tests, then commit the source changes in the private repository. Repeat that edit → sync → verify → commit cycle for updates.

The sync is one-way, deterministic, and idempotent: the destination state after a run depends only on the private source tree. It writes only inside the allowlisted `local/` directories, creating missing ones and removing stale overlay files within them, and refuses to touch `.env` files, databases, browser profiles, logs, and generated output. Each run reports exactly what was added, changed, or removed.

`scripts/check.sh` runs `sync-private.sh --check` automatically when the private repository is present, so the normal check gate catches drift between the installed copy and the source; a clean public clone has no private repository and skips it. After installing the overlay, `git status --ignored` shows the `local/` paths as ignored and `git ls-files` still contains none of them.

The check runs the installed overlay in the public application context: TypeScript typechecking, private fixture tests, and both app builds use the normal workspace configuration and dependencies. Because formatters and linters normally honor `.gitignore`, `scripts/check-private.sh` explicitly opts the private TypeScript and Python paths back into those gates. It checks overlay drift first, so the general suite can never validate a stale installed copy.

The private scaffold also installs its own pre-commit and pre-push hooks through `setup-private-dev.sh`. A private commit syncs the disposable installed copy and runs the fast public-context gates; a private push runs the complete `scripts/check.sh` suite. The private repository remains the only editable source of truth.

Adding a board needs no central edit: each overlay is discovered automatically, and the server needs no per-board changes.
