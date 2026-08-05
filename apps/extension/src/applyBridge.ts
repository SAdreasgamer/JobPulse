/**
 * applyBridge — shared helper for all universal apply-detection adapters.
 *
 * All non-LinkedIn adapters call `sendApplyEvent()` when they detect a
 * successful application. This module relays the event through the background
 * service worker (same path as other bridge requests), which fires:
 *   1. POST /api/listings  — upsert the job listing
 *   2. POST /api/events    — record the "applied" event
 *
 * The background then broadcasts a statesChanged push so every open LinkedIn
 * tab and the popup re-render, and the FastAPI WebSocket hub notifies the
 * dashboard for an instant Kanban update.
 */

export interface ApplyPayload {
  platform: string;
  platform_id: string;
  url: string;
  title: string | null;
  company: string | null;
  /** Detection confidence: high (URL pattern + confirmation), medium, low (heuristic). */
  confidence: "high" | "medium" | "low";
}

/**
 * Send an apply event through the background service worker.
 * Non-blocking: fires and forgets — the caller's page shouldn't wait on API calls.
 */
export function sendApplyEvent(payload: ApplyPayload): void {
  // Step 1: upsert the listing
  chrome.runtime.sendMessage(
    {
      type: "listing",
      payload: {
        platform: payload.platform,
        platform_id: payload.platform_id,
        url: payload.url ?? undefined,
        title: payload.title ?? undefined,
        company: payload.company ?? undefined,
        meta: {
          source: "auto-detect",
          confidence: payload.confidence,
          detected_at: new Date().toISOString(),
        },
      },
    },
    (listingResponse) => {
      if (chrome.runtime.lastError) return; // extension navigating away
      if (!listingResponse?.ok) return;

      // Step 2: fire the applied event
      chrome.runtime.sendMessage(
        {
          type: "event",
          payload: {
            platform: payload.platform,
            platform_id: payload.platform_id,
            events: [
              {
                event: "applied",
                meta: {
                  actor: "extension",
                  source: "auto-detect",
                  confidence: payload.confidence,
                },
              },
            ],
          },
        },
        () => {
          if (chrome.runtime.lastError) return;
        },
      );
    },
  );
}
