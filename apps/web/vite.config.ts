import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Proxy the API and FastAPI documentation during dashboard development.
const BACKEND = process.env.VITE_SERVER_URL ?? "http://localhost:3456";

export default defineConfig({
  // Exclude tsc's build metadata from task fingerprints to avoid self-invalidation.
  // Build and typecheck stay separate so each result is cached independently.
  run: {
    tasks: {
      typecheck: {
        command: "tsc -b",
        input: [{ auto: true }, "!node_modules/.tmp/**"],
        output: [{ auto: true }, "!node_modules/.tmp/**"],
      },
      build: { command: "vp build" },
    },
  },
  plugins: [react(), tailwindcss()],
  // Must match Settings.web_dist_path.
  build: {
    outDir: "dist",
  },
  server: {
    port: 5173,
    proxy: {
      "/api": BACKEND,
      "/docs": BACKEND,
      "/openapi.json": BACKEND,
    },
  },
  test: {
    environment: "jsdom",
    passWithNoTests: true,
  },
});
