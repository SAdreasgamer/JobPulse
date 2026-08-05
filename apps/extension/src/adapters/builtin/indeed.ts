/**
 * Indeed adapter.
 *
 * Indeed job apply flow:
 *   https://www.indeed.com/apply/... (multi-step)
 *   Confirmation: "Application submitted" banner / page
 *
 * Also handles the "Applied" badge that appears on job cards after applying.
 */
import type { Adapter } from "../types";
import { sendApplyEvent } from "../../applyBridge.js";

const CONFIRMATION_TEXT = [
  "application submitted",
  "your application was submitted",
  "application complete",
  "application received",
  "thanks for applying",
  "thank you for applying",
];

function isIndeedConfirmationPage(): boolean {
  const path = location.pathname.toLowerCase();
  // Indeed's confirmation path: /apply/<jobkey>/confirmation
  if (path.includes("/confirmation")) return true;
  const bodyText = document.body?.innerText?.toLowerCase() ?? "";
  return CONFIRMATION_TEXT.some((t) => bodyText.includes(t));
}

/** Indeed job key from URL:
 *   /viewjob?jk=abc123def456  → "abc123def456"
 *   /apply/abc123def456/...   → "abc123def456" */
function extractIndeedId(): string | null {
  const jk = new URLSearchParams(location.search).get("jk");
  if (jk) return jk;
  const m = location.pathname.match(/\/apply\/([a-z0-9]+)/i);
  return m?.[1] ?? null;
}

function scrapeJobMeta(): { title: string | null; company: string | null } {
  // After confirmation, Indeed shows the job title in <h1> or <h2>
  const title =
    document
      .querySelector<HTMLElement>(
        "h1.jobsearch-JobInfoHeader-title, h1[data-testid='jobsearch-JobInfoHeader-title'], h1",
      )
      ?.innerText?.trim() ?? null;
  const company =
    document
      .querySelector<HTMLElement>(
        "[data-testid='inlineHeader-companyName'], .jobsearch-CompanyInfoContainer a, .icl-u-lg-mr--sm",
      )
      ?.innerText?.trim() ?? null;
  return { title, company };
}

let _fired = false;

export const indeedAdapter: Adapter = {
  matches: (host) => host === "www.indeed.com" || host === "indeed.com",

  activeOn: (path) => path.startsWith("/apply") || path.startsWith("/viewjob"),

  findCards: () => [],

  scanDetail() {
    if (_fired) return;
    if (!isIndeedConfirmationPage()) return;

    const jobId = extractIndeedId();
    const { title, company } = scrapeJobMeta();
    _fired = true;

    sendApplyEvent({
      platform: "indeed",
      platform_id: jobId ?? `ind-${Date.now()}`,
      url: location.href,
      title,
      company,
      confidence: jobId ? "high" : "medium",
    });
  },
};
