/**
 * Lever ATS adapter.
 *
 * Lever powers company career pages at:
 *   https://jobs.lever.co/<company>/<job-uuid>
 *   https://jobs.lever.co/<company>/<job-uuid>/apply
 *
 * Apply detection strategy:
 *   URL path ends with /apply/confirmation OR page shows success text
 *   after the multi-step form completes.
 */
import type { Adapter } from "../types";
import { sendApplyEvent } from "../../applyBridge.js";

const CONFIRMATION_TEXT = [
  "application submitted",
  "thanks for applying",
  "thank you for applying",
  "application received",
  "we received your application",
];

function isLeverConfirmationPage(): boolean {
  const path = location.pathname.toLowerCase();
  if (path.endsWith("/apply/confirmation") || path.endsWith("/confirmation")) return true;
  const bodyText = document.body?.innerText?.toLowerCase() ?? "";
  return CONFIRMATION_TEXT.some((t) => bodyText.includes(t));
}

/**
 * Lever job UUID from URL:
 *   /jobs.lever.co/company/abc123-def456-...(/apply?)
 */
function extractLeverId(): string | null {
  // UUID segment: 8-4-4-4-12 hex chars
  const m = location.pathname.match(
    /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  return m?.[1] ?? null;
}

function scrapeJobMeta(): { title: string | null; company: string | null } {
  const title =
    document
      .querySelector<HTMLElement>(
        "h2[data-qa='posting-name'], .posting-headline h2, h2.posting-name, h1",
      )
      ?.innerText?.trim() ?? null;
  // Company is the first path segment on jobs.lever.co/<company>/<uuid>
  const pathParts = location.pathname.split("/").filter(Boolean);
  const company = pathParts[0] ?? null;
  return { title, company };
}

let _fired = false;

export const leverAdapter: Adapter = {
  matches: (host) => host === "jobs.lever.co" || host.endsWith(".lever.co"),

  activeOn: () => true,

  findCards: () => [],

  scanDetail() {
    if (_fired) return;
    if (!isLeverConfirmationPage()) return;

    const jobId = extractLeverId();
    const { title, company } = scrapeJobMeta();
    _fired = true;

    sendApplyEvent({
      platform: "lever",
      platform_id: jobId ?? `lv-${Date.now()}`,
      url: location.href.replace(/\/apply.*$/, ""), // canonical job URL without /apply
      title,
      company,
      confidence: jobId ? "high" : "medium",
    });
  },
};
