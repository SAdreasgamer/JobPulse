import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localDay } from "@job-tracker/shared/time";
import { chooseTs, shortDate, todayDay } from "./eventDate";

// A fixed "now" so today/other-day branches are deterministic. Noon-local keeps the
// wall-clock day stable regardless of the runner's timezone.
const NOW = new Date("2026-07-18T12:00:00");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("todayDay", () => {
  it("is the local calendar day of now", () => {
    expect(todayDay()).toBe(localDay(NOW.toISOString()));
  });
});

describe("chooseTs", () => {
  it("returns undefined for today (server stamps exact now)", () => {
    expect(chooseTs(todayDay(), null)).toBeUndefined();
  });

  it("returns the exact suggested ISO when the picked day is the email's day", () => {
    const suggested = "2026-05-21T09:30:00.000Z";
    expect(chooseTs(localDay(suggested), suggested)).toBe(suggested);
  });

  it("keeps the exact suggested ISO even when the email arrived today", () => {
    const suggested = NOW.toISOString();
    expect(chooseTs(todayDay(), suggested)).toBe(suggested);
  });

  it("returns a noon-local ISO for any other back-dated day", () => {
    const ts = chooseTs("2026-03-15", null);
    expect(ts).toBeDefined();
    expect(localDay(ts!)).toBe("2026-03-15"); // the day survives the ISO round-trip
    expect(new Date(ts!).getHours()).toBe(12); // noon local, not UTC-midnight
  });
});

describe("shortDate", () => {
  it("renders a month/day label with no year", () => {
    // Jul 4 rendered short — no year, parsed at noon-local so the day never shifts.
    expect(shortDate("2026-07-04")).toBe(
      new Date("2026-07-04T12:00:00").toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
    );
  });

  it("falls back to the raw string for an unparseable day", () => {
    expect(shortDate("not-a-date")).toBe("not-a-date");
  });
});
