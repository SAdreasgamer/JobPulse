// Keyword-policy persistence with a callback-style in-memory chrome.storage shim.
import { afterEach, describe, expect, it } from "vitest";

import {
  KEYWORD_POLICY_KEY,
  loadKeywordPolicy,
  resetKeywordPolicy,
  saveKeywordPolicy,
} from "./settings";
import { defaultPolicy, getActivePolicy, setActivePolicy } from "./keywords";

function installFakeStorage(seed: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...seed };
  const local = {
    get: (key: string, cb: (d: Record<string, unknown>) => void) =>
      cb(key in store ? { [key]: store[key] } : {}),
    set: (obj: Record<string, unknown>, cb?: () => void) => {
      Object.assign(store, obj);
      cb?.();
    },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = { storage: { local } };
  return store;
}

afterEach(() => {
  setActivePolicy(defaultPolicy()); // don't leak an enabled policy into other suites
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

describe("keyword settings persistence", () => {
  it("a fresh install reads the safe defaults and writes nothing", () => {
    const store = installFakeStorage();
    let loaded = null as ReturnType<typeof defaultPolicy> | null;
    loadKeywordPolicy((p) => (loaded = p));
    expect(loaded).toEqual(defaultPolicy());
    expect(getActivePolicy()).toEqual(defaultPolicy());
    expect(store[KEYWORD_POLICY_KEY]).toBeUndefined(); // nothing sent to storage
  });

  it("an enabled policy survives a restart (a later read of the same storage)", () => {
    const store = installFakeStorage();
    const enabled = defaultPolicy().map((s) =>
      s.id === "auto-hide-titles" ? { ...s, enabled: true } : s,
    );
    saveKeywordPolicy(enabled);
    expect(store[KEYWORD_POLICY_KEY]).toBeDefined();

    // Simulate a restart: forget the in-memory policy, then load from storage.
    setActivePolicy(defaultPolicy());
    let loaded = null as ReturnType<typeof defaultPolicy> | null;
    loadKeywordPolicy((p) => (loaded = p));
    expect(loaded!.find((s) => s.id === "auto-hide-titles")!.enabled).toBe(true);
    expect(getActivePolicy().find((s) => s.id === "auto-hide-titles")!.enabled).toBe(true);
  });

  it("reset restores the safe defaults", () => {
    installFakeStorage({
      [KEYWORD_POLICY_KEY]: defaultPolicy().map((s) => ({ ...s, enabled: true })),
    });
    loadKeywordPolicy();
    expect(getActivePolicy().some((s) => s.enabled)).toBe(true);

    resetKeywordPolicy();
    expect(getActivePolicy()).toEqual(defaultPolicy());
  });
});
