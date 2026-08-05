/**
 * Universal heuristic apply watcher.
 *
 * Catches job applications on sites with no dedicated adapter. This adapter is
 * deliberately last in the registry — it only runs when no other adapter claims
 * the host. It is off by default; the user must enable it in the popup settings.
 *
 * Detection strategy (all must pass):
 *   1. URL path contains /apply, /application, /submit-application, /jobs/apply
 *   2. The page contains confirmation-like text after a navigation or DOM mutation
 *   3. Confidence is always "low" — labeled "auto-detected" in the dashboard
 *
 * The watcher installs a MutationObserver so it catches SPA confirmation states
 * that don't trigger a full page reload.
 */
import type { Adapter } from "../types";
import { sendApplyEvent } from "../../applyBridge.js";

// Paths that strongly suggest a job application form or result page
const APPLY_PATH_PATTERNS = [
  "/apply",
  "/application",
  "/submit-application",
  "/jobs/apply",
  "/careers/apply",
  "/apply-now",
  "/job-application",
];

const CONFIRMATION_TEXT = [
  "application submitted",
  "thank you for applying",
  "thanks for applying",
  "your application has been received",
  "application complete",
  "application received",
  "we'll be in touch",
  "we will be in touch",
];

/** Read from localStorage; set by the popup's settings toggle. */
function isUniversalWatcherEnabled(): boolean {
  try {
    return localStorage.getItem("jt.universalWatcher") === "true";
  } catch {
    return false;
  }
}

function looksLikeApplyPath(): boolean {
  const path = location.pathname.toLowerCase();
  return APPLY_PATH_PATTERNS.some((p) => path.includes(p));
}

function findConfirmationText(): string | null {
  const bodyText = document.body?.innerText?.toLowerCase() ?? "";
  return CONFIRMATION_TEXT.find((t) => bodyText.includes(t)) ?? null;
}

function scrapeJobMeta(): { title: string | null; company: string | null } {
  const title = document.querySelector<HTMLElement>("h1")?.innerText?.trim() ?? null;
  const company = document.title.split(/[|–—-]/)[1]?.trim() ?? null;
  return { title, company };
}

let _fired = false;
let _observer: MutationObserver | null = null;

function checkAndFire() {
  if (_fired) return;
  if (!looksLikeApplyPath()) return;
  const found = findConfirmationText();
  if (!found) return;

  const { title, company } = scrapeJobMeta();
  _fired = true;
  _observer?.disconnect();

  sendApplyEvent({
    platform: "manual",
    platform_id: `auto-${Date.now()}`,
    url: location.href,
    title,
    company,
    confidence: "low",
  });
}

export const universalAdapter: Adapter = {
  // This adapter is the catch-all — it runs when no other adapter matches.
  // However we still gate on the path pattern to avoid noise.
  matches: () => isUniversalWatcherEnabled() && looksLikeApplyPath(),

  activeOn: () => true,

  findCards: () => [],

  scanDetail() {
    if (_fired || !isUniversalWatcherEnabled()) return;
    checkAndFire();

    // Install an observer to catch SPA confirmation states
    if (!_observer) {
      _observer = new MutationObserver(() => checkAndFire());
      _observer.observe(document.body, { childList: true, subtree: true });
    }
  },
};
