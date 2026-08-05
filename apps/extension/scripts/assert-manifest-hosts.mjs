#!/usr/bin/env node
// CI-only guard: fails if a built public extension manifest requests any host
// beyond the configured API origin plus the shipped LinkedIn/Gmail adapters.
// Run this only against a build made from a checkout with no private adapter
// overlay installed (any real CI checkout qualifies — the overlay lives
// exclusively in the gitignored apps/extension/src/adapters/local/, which
// git never restores). Running it against a developer's own overlay-enabled
// build is expected to fail; that is not a bug in this script.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const manifestPath = fileURLToPath(new URL("../dist/manifest.json", import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const serverUrl = process.env.VITE_SERVER_URL ?? "http://localhost:3456";
const allowed = new Set([
  `${serverUrl}/api/*`,
  "https://www.linkedin.com/*",
  "https://mail.google.com/*",
]);

const hosts = manifest.host_permissions ?? [];
const unexpected = hosts.filter((h) => !allowed.has(h));
const missing = [...allowed].filter((h) => !hosts.includes(h));

if (unexpected.length || missing.length) {
  console.error("Public extension manifest host_permissions mismatch.");
  if (unexpected.length) console.error("  Unexpected:", unexpected);
  if (missing.length) console.error("  Missing:", missing);
  process.exit(1);
}

console.log(`Manifest host allowlist OK (${hosts.length} hosts): ${hosts.join(", ")}`);
