// Discover private-board platform metadata and register it into the shared
// registry, so the dashboard can name and link back to boards whose adapters live
// only in the private overlay. A public build has no ./local files → this
// registers nothing and every such platform degrades to its raw token (see
// @job-tracker/shared/platforms). Mirrors the extension's adapters/local
// discovery in apps/extension/src/content.ts. Imported once from main.tsx, before
// the app renders, so the table is seeded ahead of the first lookup.
import { registerPlatform, type PlatformMeta } from "@job-tracker/shared/platforms";

const localModules = import.meta.glob<{ default?: Record<string, PlatformMeta> }>(
  ["./local/*.ts", "!./local/*.test.ts"],
  { eager: true },
);

for (const mod of Object.values(localModules)) {
  for (const [platform, meta] of Object.entries(mod.default ?? {})) {
    registerPlatform(platform, meta);
  }
}
