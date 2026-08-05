// Search-diagnostics gate: a fresh install sends nothing, while temporary and
// always scopes send the same complete debugging context.
import { afterEach, describe, expect, it } from "vitest";

import {
  DIAGNOSTICS_DEFAULT,
  DIAGNOSTICS_KEY,
  TEMPORARY_WINDOW_MS,
  type SearchSession,
  activeDiagnosticsScope,
  diagnosticsBody,
  loadDiagnostics,
  sanitizeDiagnostics,
  saveDiagnostics,
} from "./diagnostics";

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
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

const SESSION: SearchSession = {
  host: "mail.google.com",
  seed_rule: "gmail-subject",
  seed: "Sample Company Corp",
  seed_results: 0,
  query: "Sample Company",
  results: 3,
  job_id: "j-42",
};

describe("diagnostics settings defaults", () => {
  it("a missing / corrupt stored value resolves to the disabled default", () => {
    expect(sanitizeDiagnostics(undefined)).toEqual(DIAGNOSTICS_DEFAULT);
    expect(sanitizeDiagnostics(null)).toEqual(DIAGNOSTICS_DEFAULT);
    expect(sanitizeDiagnostics("garbage")).toEqual(DIAGNOSTICS_DEFAULT);
    expect(sanitizeDiagnostics({ enabled: "yes" })).toEqual(DIAGNOSTICS_DEFAULT);
    expect(DIAGNOSTICS_DEFAULT.scope).toBe("never");
  });

  it("does not migrate a legacy aggregate-only opt-in to full capture", () => {
    expect(sanitizeDiagnostics({ enabled: true, detailedUntil: null })).toEqual(
      DIAGNOSTICS_DEFAULT,
    );
  });

  it("migrates a still-live legacy detailed window", () => {
    const until = Date.now() + 10_000;
    expect(sanitizeDiagnostics({ enabled: true, detailedUntil: until })).toEqual({
      scope: "temporary",
      expiresAt: until,
    });
  });
});

describe("diagnosticsBody — what actually goes on the wire", () => {
  it("sends nothing on a fresh (disabled) install", () => {
    expect(diagnosticsBody(DIAGNOSTICS_DEFAULT, SESSION)).toBeNull();
  });

  it("sends complete context in always mode", () => {
    expect(diagnosticsBody({ scope: "always", expiresAt: null }, SESSION)).toEqual(SESSION);
  });

  it("sends the same complete context inside a temporary window", () => {
    const now = 1_000_000;
    const live = { scope: "temporary" as const, expiresAt: now + 1_000 };
    expect(diagnosticsBody(live, SESSION, now)).toEqual(SESSION);
  });

  it("sends nothing once the temporary window has expired", () => {
    const now = 1_000_000;
    const expired = { scope: "temporary" as const, expiresAt: now - 1 };
    expect(activeDiagnosticsScope(expired, now)).toBe("never");
    expect(diagnosticsBody(expired, SESSION, now)).toBeNull();
  });

  it("treats TEMPORARY_WINDOW_MS as a real bound", () => {
    const now = 1_000_000;
    const s = { scope: "temporary" as const, expiresAt: now + TEMPORARY_WINDOW_MS };
    expect(activeDiagnosticsScope(s, now)).toBe("temporary");
    expect(activeDiagnosticsScope(s, now + TEMPORARY_WINDOW_MS + 1)).toBe("never");
  });
});

describe("diagnostics persistence", () => {
  it("a fresh install reads the disabled default and writes nothing", () => {
    const store = installFakeStorage();
    let loaded = null as ReturnType<typeof sanitizeDiagnostics> | null;
    loadDiagnostics((s) => (loaded = s));
    expect(loaded).toEqual(DIAGNOSTICS_DEFAULT);
    expect(store[DIAGNOSTICS_KEY]).toBeUndefined();
  });

  it("the always setting survives a restart", () => {
    const store = installFakeStorage();
    saveDiagnostics({ scope: "always", expiresAt: null });
    expect(store[DIAGNOSTICS_KEY]).toEqual({ scope: "always", expiresAt: null });

    let loaded = null as ReturnType<typeof sanitizeDiagnostics> | null;
    loadDiagnostics((s) => (loaded = s));
    expect(loaded!.scope).toBe("always");
  });
});
