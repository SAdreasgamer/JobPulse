// The popup's tracker-API client. It runs on the extension origin, so unlike the
// content scripts — blocked from localhost by the host sites' CSP — it fetches the
// API directly. The writes are the same verbs the dashboard and injected cards speak.
import { API_BASE_URL } from "../config.js";
import type { BridgeRequest } from "../messages.js";

export const BASE_URL = API_BASE_URL;

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, opts);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  if (opts?.method && opts.method !== "GET") notifyChange();
  return res.status === 204 ? null : res.json();
}

// Writing straight to the API means the service worker never sees it — and it's the
// worker that tells open tabs their read-model went stale. One ping puts the write
// back on that path, so a status recorded here updates the tabs behind the popup
// instead of leaving them stale until a reload. Fire-and-forget: the write already
// succeeded, and a missed refresh must never surface as an error.
function notifyChange(): void {
  const msg: BridgeRequest = { type: "notify-change" };
  chrome.runtime.sendMessage(msg).catch(() => {});
}

export const searchJobs = (q: string) => api(`/jobs?${new URLSearchParams({ q, limit: "8" })}`);

function markManualClosures(events: unknown[]): unknown[] {
  return events.map((item) => {
    if (typeof item !== "object" || item === null || !("event" in item) || item.event !== "closed")
      return item;
    const meta =
      "meta" in item && typeof item.meta === "object" && item.meta !== null ? item.meta : {};
    return { ...item, meta: { ...meta, source: "manual" } };
  });
}

// `ts` (UTC ISO) back-dates the events to when they really happened — e.g. the
// received date of the open Gmail rejection the user is recording by hand.
// Omitted → the server stamps now().
export const postEvents = (jobId: string, events: unknown[], ts?: string) =>
  api("/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id: jobId,
      events: markManualClosures(events),
      ...(ts ? { ts } : {}),
    }),
  });

export const noteTitles = () => api("/meta/note-titles").catch(() => []);

// Manually add a job no content script captured (a referral, an HR email, an ATS with
// no scraper). The same POST /listings verb as a scrape, but with platform="manual", a
// client-minted platform_id since there's no natural key to dedup on, and via="manual"
// so the job's birth reads as hand-added. The server auto-creates the owning job.
export const createListing = (body: unknown) =>
  api("/listings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

// Full job record for attaching a comment to the latest status event.
export const getJob = (jobId: string) => api(`/jobs/${jobId}`);

// Enrich an already-logged event with meta after the fact. Replaces the whole meta
// bag, but the verb and timestamp are immutable, so this only adds or updates the
// note on a transition — never its status.
export const patchEventMeta = (eventId: number, meta: unknown) =>
  api(`/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ meta }),
  });

// Delete every stored search-diagnostic row on the server (DELETE /search-log) —
// the settings panel's "Clear stored data" control.
export const clearSearchLog = () => api("/search-log", { method: "DELETE" });

// Fire-and-forget search diagnostics. Only reached when the user has opted in (see
// engine/diagnostics.ts), and the caller decides what fields the body carries. Never
// blocks or surfaces errors — a failed beacon must not touch the popup UX.
// `keepalive` lets the request outlive the popup when sent from pagehide.
export function logSearch(body: unknown, keepalive = false): void {
  try {
    fetch(`${BASE_URL}/search-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive,
    }).catch(() => {});
  } catch {
    /* offline or teardown; diagnostics are best-effort */
  }
}
