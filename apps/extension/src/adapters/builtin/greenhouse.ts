/**
 * Greenhouse ATS adapter.
 *
 * Greenhouse powers hundreds of company career pages at:
 *   https://<company>.greenhouse.io/jobs/<id>
 *   https://boards.greenhouse.io/<company>/jobs/<id>
 *   https://job-boards.greenhouse.io/<company>/jobs/<id>
 *
 * Apply detection strategy:
 *   1. URL changes to a confirmation/thank-you path after submit
 *   2. "Application submitted" or "Thank you" heading in the DOM
 *   3. Mutation observer watches for the success state on the SPA flow
 */
import type { Adapter } from "../types";
import { sendApplyEvent } from "../../applyBridge.js";

// Greenhouse submission confirmation signals
const CONFIRMATION_PATHS = ["/confirmation", "/apply/confirmation", "/applications/"];
const CONFIRMATION_TEXT = [
  "application submitted",
  "thank you for applying",
  "thanks for applying",
  "application received",
  "your application has been submitted",
];

function isGreenhouseConfirmationPage(): boolean {
  const path = location.pathname.toLowerCase();
  if (CONFIRMATION_PATHS.some((p) => path.includes(p))) return true;
  const bodyText = document.body?.innerText?.toLowerCase() ?? "";
  return CONFIRMATION_TEXT.some((t) => bodyText.includes(t));
}

/** Extract job id from Greenhouse URLs:
 *  /jobs/12345678  →  "12345678"
 *  /jobs/senior-engineer-12345678  →  "12345678" (numeric suffix) */
function extractGreenhouseId(): string | null {
  const m = location.pathname.match(/\/jobs\/(?:[^/]*-)?(\d+)/);
  return m?.[1] ?? null;
}

function scrapeJobMeta(): { title: string | null; company: string | null } {
  // <h1> is consistently the job title on Greenhouse boards
  const title =
    document.querySelector<HTMLElement>("h1.job-post-name, h1.app-title, h1")?.innerText?.trim() ??
    null;
  // Company name from <title>: "Job Title at Company | Greenhouse"
  const titleTag = document.title ?? "";
  const atMatch = titleTag.match(/ at (.+?)(?:\s*\||\s*–|\s*-|$)/i);
  const company = atMatch?.[1]?.trim() ?? null;
  return { title, company };
}

let _fired = false; // fire once per page load

export const greenhouseAdapter: Adapter = {
  matches: (host) =>
    host.endsWith(".greenhouse.io") ||
    host === "greenhouse.io" ||
    host.endsWith(".job-boards.greenhouse.io"),

  activeOn: () => true, // watch every path — confirmation can be on any subpath

  findCards: () => [], // Greenhouse is detail-only; no list view to tag

  scanDetail() {
    if (_fired) return;
    if (!isGreenhouseConfirmationPage()) return;

    const jobId = extractGreenhouseId();
    const { title, company } = scrapeJobMeta();
    _fired = true;

    sendApplyEvent({
      platform: "greenhouse",
      platform_id: jobId ?? `gh-${Date.now()}`,
      url: location.href,
      title,
      company,
      confidence: jobId ? "high" : "medium",
    });
  },
};
