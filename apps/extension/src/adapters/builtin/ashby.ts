/**
 * Ashby HQ adapter.
 *
 * Ashby powers company career pages at:
 *   https://<company>.ashbyhq.com/jobs/<uuid>
 *   https://<company>.ashbyhq.com/jobs/<uuid>/application
 *   https://<company>.ashbyhq.com/jobs/<uuid>/application/success
 */
import type { Adapter } from "../types";
import { sendApplyEvent } from "../../applyBridge.js";

const CONFIRMATION_TEXT = [
  "application submitted",
  "thanks for applying",
  "thank you for applying",
  "application received",
  "we've received your application",
];

function isAshbyConfirmationPage(): boolean {
  const path = location.pathname.toLowerCase();
  if (path.endsWith("/success") || path.includes("/confirmation")) return true;
  const bodyText = document.body?.innerText?.toLowerCase() ?? "";
  return CONFIRMATION_TEXT.some((t) => bodyText.includes(t));
}

/** Ashby job UUID: /jobs/<uuid> */
function extractAshbyId(): string | null {
  const m = location.pathname.match(
    /\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  return m?.[1] ?? null;
}

function scrapeJobMeta(): { title: string | null; company: string | null } {
  const title =
    document.querySelector<HTMLElement>("h1.ashby-job-posting-heading, h1")?.innerText?.trim() ??
    null;
  // Ashby company is the subdomain
  const company = location.hostname.split(".")[0] ?? null;
  return { title, company };
}

let _fired = false;

export const ashbyAdapter: Adapter = {
  matches: (host) => host.endsWith(".ashbyhq.com"),

  activeOn: (path) => path.startsWith("/jobs"),

  findCards: () => [],

  scanDetail() {
    if (_fired) return;
    if (!isAshbyConfirmationPage()) return;

    const jobId = extractAshbyId();
    const { title, company } = scrapeJobMeta();
    _fired = true;

    sendApplyEvent({
      platform: "ashby",
      platform_id: jobId ?? `ash-${Date.now()}`,
      url: location.href.replace(/\/(application|success).*$/, ""),
      title,
      company,
      confidence: jobId ? "high" : "medium",
    });
  },
};
