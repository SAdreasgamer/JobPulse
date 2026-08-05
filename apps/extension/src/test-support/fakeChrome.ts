// Test-only chrome shim. @webext-core/fake-browser implements the promise-based
// `browser.*` shape (webextension-polyfill); engine.ts's bridge() calls the
// callback-style `chrome.runtime.sendMessage(msg, cb)` instead, so this layers a
// thin compatible sendMessage over fakeBrowser's onMessage event bus — letting
// adapter tests assert on the exact message a capture builds without a real
// background service worker.
import { vi } from "vitest";
import { fakeBrowser } from "@webext-core/fake-browser";

export function installFakeChrome() {
  fakeBrowser.reset();
  const sendMessage = vi.fn((message: unknown, callback?: (resp: unknown) => void) => {
    // onMessage is typed with the full (message, sender, sendResponse) listener
    // shape. Listeners here answer by returning, so the third argument is inert.
    const sendResponse = () => {};
    void fakeBrowser.runtime.onMessage
      .trigger(message, {} as never, sendResponse)
      .then((results) => {
        callback?.(results.find((r) => r !== undefined));
      });
  });
  const fakeChrome = {
    ...fakeBrowser,
    runtime: { ...fakeBrowser.runtime, sendMessage, lastError: undefined },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = fakeChrome;
  return { sendMessage, onMessage: fakeBrowser.runtime.onMessage };
}
