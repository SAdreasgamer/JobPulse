// The API and dashboard origin. Set VITE_SERVER_URL in `.env` and rebuild; keep
// host_permissions in manifest.config.js in step with this value.
export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3456";

// Every feature route lives under /api on SERVER_URL (app/main.py), and every API
// call goes through this. The bare origin is only ever opened as the dashboard SPA
// (DASHBOARD_URL in engine.ts), never fetched.
export const API_BASE_URL = `${SERVER_URL}/api`;
