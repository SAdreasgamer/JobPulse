// ── Background bridge ────────────────────────────────────────────────────────
// Content scripts can't reach localhost under a host site's CSP; the service
// worker does the fetch. Always resolves — never throws.
import type { Engine } from "./types.js";
import type { BridgeRequest, BridgeResponse } from "../messages.js";

export function createBridge(_engine: Engine) {
  function bridge(msg: BridgeRequest): Promise<BridgeResponse> {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (resp: BridgeResponse | undefined) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message! });
          } else {
            resolve(resp || { ok: false, error: "no response" });
          }
        });
      } catch (e) {
        // sendMessage throws synchronously if the extension was reloaded.
        resolve({ ok: false, error: String((e as any)?.message || e) });
      }
    });
  }

  return { bridge };
}
