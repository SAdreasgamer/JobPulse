// The TS half of the funnel contract. funnel.contract.json is written by the server
// pytest suite (apps/api/tests/test_funnel_contract.py) from the real API guard; this
// asserts the tables in ./index equal it. So a server rule change trips both sides:
// pytest regenerates the fixture and fails; this then fails until the TS mirror is
// brought back in step. Run with `vp test`.
import { describe, expect, it } from "vitest";

import contract from "./funnel.contract.json";
import { ACTIVE_STATUSES, forwardMoves, TERMINAL_STATUSES } from "./index";

const forwardByStatus = contract.forwardMoves as Record<string, string[]>;

describe("funnel contract", () => {
  it("mirrors the server's active/terminal status order", () => {
    expect([...ACTIVE_STATUSES]).toEqual(contract.active);
    expect([...TERMINAL_STATUSES]).toEqual(contract.terminal);
    expect([...ACTIVE_STATUSES, ...TERMINAL_STATUSES]).toEqual(contract.statuses);
  });

  it("mirrors the server's forward-move adjacency for every status", () => {
    for (const status of contract.statuses) {
      expect(forwardMoves(status)).toEqual(forwardByStatus[status]);
    }
  });
});
