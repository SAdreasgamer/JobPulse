// ── Engine factory ───────────────────────────────────────────────────────────
// Assembles one Engine instance from the concern modules. Each create<Concern>()
// keeps its own state as closure-private variables and returns the slice of methods
// it contributes; Object.assign fuses them onto a single object so cross-concern
// calls (engine.renderJob, engine.bridge, …) resolve at call time — mutual recursion
// without an import cycle. A fresh createEngine() yields fresh, isolated state, which
// is what makes the read-model and its collaborators testable in isolation.
import type { Engine } from "./types.js";
import { createBridge } from "./bridge.js";
import { createReadModel } from "./readModel.js";
import { createStatusSelect } from "./statusSelect.js";
import { createBars } from "./bars.js";
import { createBlocklist } from "./blocklist.js";
import { createCapture } from "./capture.js";
import { createMatches } from "./matches.js";
import { createMenu } from "./menu.js";
import { createOffline } from "./offline.js";
import { createScan } from "./scan.js";

export function createEngine(): Engine {
  const engine = {} as Engine;
  Object.assign(
    engine,
    createBridge(engine),
    createReadModel(engine),
    createStatusSelect(engine),
    createBars(engine),
    createBlocklist(engine),
    createCapture(engine),
    createMatches(engine),
    createMenu(engine),
    createOffline(engine),
    createScan(engine),
  );
  return engine;
}
