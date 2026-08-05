import { defineConfig } from "vite-plus";

// @job-tracker/shared is consumed as TypeScript source (no build step) — the
// only thing this config drives is the package's own test suite: the funnel and
// text cross-language contract tests, which run in Node against the JSON fixtures
// the server's pytest suite writes.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
