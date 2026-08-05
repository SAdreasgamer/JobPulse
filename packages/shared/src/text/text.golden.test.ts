// The TS half of the normalization golden. text.golden.json is written by the server
// pytest suite (apps/api/tests/test_text.py) from the Python normalizers; this replays
// it against the TS port and asserts identical output case-for-case. A drift between
// the two — which would silently stop a blocklist entry from matching — fails here.
// Run with `vp test`.
import { describe, expect, it } from "vitest";

import golden from "./text.golden.json";
import { normalizeCompany, normalizeTitle } from "./index";

describe("text golden", () => {
  it("matches the Python normalizers case-for-case", () => {
    for (const { input, company, title } of golden.cases) {
      expect(normalizeCompany(input)).toBe(company);
      expect(normalizeTitle(input)).toBe(title);
    }
  });
});
