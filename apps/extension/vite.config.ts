import { defineConfig } from "vite-plus";
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import manifest from "./manifest.config";

// CRXJS reads the generated manifest, bundles the content script / service worker /
// popup as MV3-compatible modules, and writes the loadable extension to dist/. The
// popup is a React app (same framework as the dashboard); @vitejs/plugin-react
// compiles its JSX and wires Fast Refresh in dev. Only the popup uses React — the
// content scripts and service worker stay vanilla TS.
export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
  build: {
    target: "esnext",
  },
  test: {
    environment: "jsdom",
    passWithNoTests: true,
  },
});
