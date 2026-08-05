# Repository instructions

- Start with `docs/DEVELOPMENT.md`. Use its authority table to find the documentation governing the part of the repository you are changing.
- Read `docs/ARCHITECTURE.md` before changing domain behavior, identity, state transitions, or component boundaries. Read the relevant component README before changing its implementation or commands.
- Preserve the public/private boundary in `docs/PRIVATE.md`. Never commit or directly edit installed private-overlay files, environment files, databases, personal job or email data, or private fixtures.
- Do not hand-edit generated artifacts. Follow the source of truth and generator documented in `docs/DEVELOPMENT.md`.
- Use focused checks while iterating. Run `bash scripts/check.sh` before considering a change complete.
- Update tests and the authoritative documentation in the same change when behavior changes.
