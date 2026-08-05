# Private job-tracker overlay

This repository is the private, editable source of truth for personal or organization-specific adapters. Keep it private.

Edit files under `overlay/`, then run these commands from the public checkout:

```bash
bash scripts/setup-private-dev.sh
bash scripts/sync-private.sh
```

The setup command also installs private-repository hooks. Pre-commit syncs the disposable installed overlay and runs fast checks in the public application context; pre-push runs the complete public quality suite. Run the same full gate manually from this repository with:

```bash
bash scripts/check.sh
```

See `.public/docs/PRIVATE.md` for the complete workflow.
