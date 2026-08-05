// The adapter registry — the single place holding the active adapter set and
// resolving a render key to its natural key. It imports only the Adapter *type*,
// erased at build, so it has no runtime dependency on any adapter or on the engine.
// That's what breaks the content↔adapters cycle: content.ts builds the adapter list
// and injects it via setAdapters(), and the engine and adapters both read from here
// without importing each other.
import type { Adapter, NaturalKey } from "./adapters/types";

let adapters: Adapter[] = [];

/** Install the active adapter set. Called once at startup by the entry point. */
export function setAdapters(list: Adapter[]) {
  adapters = list;
}

/** The active adapters, in priority order (used by the scan loop to pick one). */
export function getAdapters(): Adapter[] {
  return adapters;
}

// dataset.jhId is a prefixed *render key* ("LI-123"); the API speaks the natural key
// underneath. Each adapter owns its prefix via naturalKey(), so asking them in turn
// and taking the first match means a new adapter needs no edit here.
export function toNaturalKey(jobId: string): NaturalKey | null {
  for (const adapter of adapters) {
    const key = adapter.naturalKey?.(jobId);
    if (key) return key;
  }
  return null;
}
