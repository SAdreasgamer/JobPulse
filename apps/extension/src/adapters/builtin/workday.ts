/**
 * Workday adapter.
 *
 * Workday ATS: https://<company>.myworkdayjobs.com/en-US/<tenant>/job/<title>/<id>
 * Apply flow: multi-step modal; confirmation page at /applyManually/<id>/success
 * or a "Thank You" landing after the final step.
 */
import type { Adapter } from "../types";
import { sendApplyEvent } from "../../applyBridge.js";

const CONFIRMATION_TEXT = [
  "application submitted",
  "thank you for applying",
  "thanks for applying",
  "your application has been submitted",
  "application complete",
];

function isWorkdayConfirmationPage(): boolean {
  const path = location.pathname.toLowerCase();
  if (path.includes("/success") || path.includes("/confirmation") || path.includes("/thankyou"))
    return true;
  const bodyText = document.body?.innerText?.toLowerCase() ?? "";
  return CONFIRMATION_TEXT.some((t) => bodyText.includes(t));
}

/** Workday job id: last path segment that looks like WD-NNNNNN_RNNNN or similar */
function extractWorkdayId(): string | null {
  // e.g. /job/Senior-Engineer/WD-00012345_R000123
  const m = location.pathname.match(/\/(WD-\w+|R\d{5,}|\d{6,})\/?$/i);
  return m?.[1] ?? null;
}

function scrapeJobMeta(): { title: string | null; company: string | null } {
  const title =
    document
      .querySelector<HTMLElement>(
        "[data-automation-id='jobPostingHeader'] h2, h1[data-automation-id='heading-jobTitle'], h1",
      )
      ?.innerText?.trim() ?? null;
  const company = location.hostname.split(".")[0] ?? null;
  return { title, company };
}

let _fired = false;

export const workdayAdapter: Adapter = {
  matches: (host) => host.endsWith(".myworkdayjobs.com"),

  activeOn: () => true,

  findCards: () => [],

  scanDetail() {
    if (_fired) return;
    if (!isWorkdayConfirmationPage()) return;

    const jobId = extractWorkdayId();
    const { title, company } = scrapeJobMeta();
    _fired = true;

    sendApplyEvent({
      platform: "workday",
      platform_id: jobId ?? `wd-${Date.now()}`,
      url: location.href,
      title,
      company,
      confidence: jobId ? "medium" : "low",
    });
  },
};
