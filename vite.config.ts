import { defineConfig } from "vite-plus";

// Workspace-wide formatting, linting, and task defaults. Package configs own
// framework-specific build and test settings.
export default defineConfig({
  // Ruff formats Python; Prettier formats Markdown (see .prettierrc.json).
  fmt: {
    ignorePatterns: [
      "apps/api/**",
      "**/*.md",
      // HTML whitespace affects scraper textContent, so fixtures are byte-sensitive.
      "apps/extension/src/adapters/**/fixtures/**",
      // These files are generated or maintained by cross-language contract tests.
      "packages/shared/src/api/schema.ts",
      "packages/shared/src/funnel/funnel.contract.json",
      "packages/shared/src/text/text.golden.json",
    ],
  },
  lint: {
    plugins: ["typescript", "oxc"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    overrides: [
      {
        files: ["apps/web/**"],
        plugins: ["typescript", "oxc", "react"],
        rules: {
          "react/rules-of-hooks": "error",
          "react/only-export-components": ["warn", { allowConstantExport: true }],
        },
      },
      {
        // The popup uses React; the rules are inert for the extension's vanilla TS.
        files: ["apps/extension/**"],
        plugins: ["typescript", "oxc", "react"],
        rules: {
          "react/rules-of-hooks": "error",
          "react/only-export-components": ["warn", { allowConstantExport: true }],
        },
      },
    ],
  },
  run: {
    tasks: {
      lint: { command: "vp run -r --cache lint" },
      typecheck: { command: "vp run -r --cache typecheck" },
      test: { command: "vp run -r --cache test" },
      build: { command: "vp run -r --cache build" },

      // Formatting is enforced by writing at commit time; the push gate must not
      // rewrite tracked files, so it reports through this form instead.
      "fmt:check": { command: "vp fmt --check" },

      // The fast quality gate for both stacks. Build remains a separate release task.
      // Delegation preserves each task's cache inputs and stops at the first failure.
      // Named `verify`, not `check`: `vp check` is a builtin that runs a different
      // (TypeScript-only) set, and one name meaning two things invites running the
      // wrong gate.
      verify: {
        command: [
          "vp run fmt:check",
          "vp run lint",
          "vp run typecheck",
          "vp run test",
          "vp run py:format",
          "vp run py:lint",
          "vp run py:typecheck",
          "vp run py:test",
        ],
      },

      // Exclude tool caches so they cannot invalidate the tasks that write them.
      // `--directory` keeps every cached command rooted at the workspace.
      "py:format": {
        command: "uv run --directory apps/api ruff format --check",
        input: [{ auto: true }, "!apps/api/.venv/**", "!apps/api/.ruff_cache/**"],
        output: [{ auto: true }, "!apps/api/.venv/**", "!apps/api/.ruff_cache/**"],
      },
      "py:lint": {
        command: "uv run --directory apps/api ruff check",
        input: [{ auto: true }, "!apps/api/.venv/**", "!apps/api/.ruff_cache/**"],
        output: [{ auto: true }, "!apps/api/.venv/**", "!apps/api/.ruff_cache/**"],
      },
      "py:typecheck": {
        command: "uv run --directory apps/api mypy",
        input: [{ auto: true }, "!apps/api/.venv/**", "!apps/api/.mypy_cache/**"],
        output: [{ auto: true }, "!apps/api/.venv/**", "!apps/api/.mypy_cache/**"],
      },
      "py:test": {
        command: "uv run --directory apps/api pytest -q",
        input: [
          { auto: true },
          "!apps/api/.venv/**",
          "!apps/api/.pytest_cache/**",
          "!apps/api/**/__pycache__/**",
        ],
        output: [
          { auto: true },
          "!apps/api/.venv/**",
          "!apps/api/.pytest_cache/**",
          "!apps/api/**/__pycache__/**",
        ],
      },

      // Compares the committed API types against a fresh generation without
      // touching the tracked file. Boots the FastAPI app, so it needs the same
      // cache exclusions as the other API tasks.
      "api:check": {
        command: "bash packages/shared/scripts/gen-api-types.sh --check",
        input: [
          { auto: true },
          "!apps/api/.venv/**",
          "!apps/api/.ruff_cache/**",
          "!apps/api/**/__pycache__/**",
        ],
        output: [
          { auto: true },
          "!apps/api/.venv/**",
          "!apps/api/.ruff_cache/**",
          "!apps/api/**/__pycache__/**",
        ],
      },
    },
  },
});
