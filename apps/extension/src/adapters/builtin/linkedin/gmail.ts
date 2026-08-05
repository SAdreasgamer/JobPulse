import type { Adapter } from "../../types";
import { linkedinRenderKey } from "./identity.js";

// Gmail's job links ARE LinkedIn postings, so its render keys come from the shared
// identity module — same prefix, same URL parsing — and the web adapter's naturalKey
// resolves them.

// Gmail's DOM contract — the selectors that drift when Gmail reshapes its message
// markup. `body` is the rendered email body; `messageScope` bounds the climb to a
// single message; `dateCarriers` may hold the absolute received date; `jobLink`
// matches the 16px LinkedIn job links via href or Gmail's data-saferedirecturl
// wrapper; `cardBody` is the message-table cell the action bar appends to (any but
// the 48px avatar column).
const SEL = {
  body: ".a3s",
  messageScope: '.gs, [data-message-id], [role="listitem"]',
  dateCarriers: "[title], [aria-label], [data-tooltip]",
  cardBody: 'td[valign="top"]:not([width="48"])',
  jobLink:
    'a[style*="font-size:16px"][href*="jobs/view/"],' +
    'a[style*="font-size:16px"][data-saferedirecturl*="jobs/view/"]',
  logo: "img[alt]",
} as const;

// The received time of an open Gmail message, as a UTC ISO string. Gmail's header
// carries the absolute date in a title/aria-label/data-tooltip, so climb from the
// body to its container and take the first attribute that parses as a date — guarded
// on a 4-digit year or H:MM clock time so a stray tooltip isn't mistaken for one.
// Shared by the rejection-wall sweep and the popup's openEventDate suggestion.
function messageDate(body: HTMLElement): string | null {
  let scope: HTMLElement = body;
  let node: HTMLElement | null = body;
  for (let i = 0; node && i < 8; node = node.parentElement, i++) {
    if (node.matches(SEL.messageScope)) {
      scope = node;
      break;
    }
  }
  for (const el of [...scope.querySelectorAll(SEL.dateCarriers)]) {
    const raw =
      el.getAttribute("title") ||
      el.getAttribute("aria-label") ||
      el.getAttribute("data-tooltip") ||
      "";
    if (!/\d{4}|\d{1,2}:\d{2}/.test(raw)) continue; // needs a year or a clock time
    const ms = Date.parse(raw);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  }
  return null;
}

// LinkedIn stamps its email template name into every tracking URL of a message (the
// lipi and trk/trkEmail params) — a rejection carries
// `email_jobs_application_rejected_01`, a digest `email_job_alert_digest_01`. Being
// LinkedIn's own classification embedded in the links, it identifies a rejection
// from content alone: no user-maintained label or filter, any inbox view, and
// language-independent since the token lives in URLs, not translated body copy.
// The trailing `_NN` is a template version, so match the stem only, and match
// `rejected` rather than any `jobs_application_*` so a "viewed"/"sent" update mail
// is never taken for a rejection. Null when it isn't a recognised outcome mail.
function emailWallStatus(body: HTMLElement): string | null {
  if (/email_jobs_application_rejected(?:_\d+)?\b/i.test(body.innerHTML)) return "rejected";
  return null;
}

// Gmail — LinkedIn job-alert / rejection emails rendered in the inbox. DOM-only
// (no detail capture), so it imports no engine helpers.
export const gmailAdapter: Adapter = {
  matches: (h) => h === "mail.google.com",
  cardBodySelector: SEL.cardBody,
  // The open email's received date, suggested by the popup when it manually records
  // a company/ATS rejection Gmail can't auto-capture, so the state is dated when the
  // mail arrived. Null when no message is open — the list view has no `.a3s` body.
  openEventDate() {
    const body = document.querySelector(SEL.body) as HTMLElement | null;
    return body ? messageDate(body) : null;
  },
  findCards(doc) {
    const cards: HTMLElement[] = [];

    function findJobRow(link: Element): HTMLElement | null {
      let node = link.parentElement;
      while (node && node.tagName !== "BODY") {
        if (node.tagName === "TR") {
          const tds = [...node.children].filter((c) => c.tagName === "TD");
          if (tds.length === 2 && tds[0].getAttribute("width") === "48") return node;
        }
        node = node.parentElement;
      }
      return null;
    }

    function findJobCard(jobRow: HTMLElement): HTMLElement {
      let node = jobRow.parentElement;
      while (node && node.tagName !== "BODY") {
        if (node.tagName === "TR") {
          const firstTd = [...node.children].find((c) => c.tagName === "TD");
          if (firstTd && (firstTd.getAttribute("style") || "").includes("padding-top")) return node;
        }
        node = node.parentElement;
      }
      return jobRow;
    }

    doc.querySelectorAll(`${SEL.body}:not([data-jh-scanned])`).forEach((body) => {
      (body as HTMLElement).dataset.jhScanned = "1";
      const ts = messageDate(body as HTMLElement); // once per email; applied below
      const wallStatus = emailWallStatus(body as HTMLElement); // the email's own type, once
      body.querySelectorAll(SEL.jobLink).forEach((link) => {
        const src =
          (link.getAttribute("href") || "") + (link.getAttribute("data-saferedirecturl") || "");
        const renderKey = linkedinRenderKey(src);
        if (!renderKey) return;

        const jobRow = findJobRow(link);
        if (!jobRow) return;

        const card = findJobCard(jobRow);
        if (!card || card.dataset.jhId) return;

        card.dataset.jhId = renderKey;
        card.dataset.jobUrl = link.getAttribute("href") || "";
        card.dataset.jobTitle = link.textContent!.trim();
        // Subtitle line is "Company · Location (Workplace)"; fall back to the
        // company logo's alt text.
        const subtitle = [...card.querySelectorAll("p")]
          .map((p) => p.textContent!.trim())
          .find((t) => t.includes("·"));
        card.dataset.jobCompany = subtitle
          ? subtitle.split("·")[0].trim()
          : card.querySelector(SEL.logo)?.getAttribute("alt")?.trim() || "";
        // A rejection email is about ONE job — the one you applied to — but also
        // lists "jobs you may be interested in". Two signals must agree before a card
        // is swept: the email's own type is a rejection (`wallStatus`), and the `trk`
        // param marks THIS link as the applied job (`…-applied_job`) rather than a
        // recommendation (`…-similar_job`). Everything else keeps its normal triage
        // bar. The swept card is force-dimmed so it stays visible while you read the
        // rejection; the recommendations follow the global dim/remove toggle, so
        // hidden or blocked ones can still be removed.
        if (wallStatus && /applied_job/.test(src)) {
          card.dataset.jhWall = "1";
          card.dataset.jhWallStatus = wallStatus;
          card.dataset.jhForceMode = "dim";
          if (ts) card.dataset.jhTs = ts; // the sweep reads jhTs
        }
        cards.push(card);
      });
    });

    return cards;
  },
};
