import type { Adapter } from "../../types";
import type { ListingRecord } from "../../../messages";
import {
  autoEmit,
  bannerSignature,
  captureListingOnce,
  checkMatches,
  closeMatchPopover,
  detailText,
  elementToText,
  injectDetailButtons,
  isCompanyBlocked,
  keywordFindings,
  markListingClosed,
  placeBanner,
  refreshStates,
  renderJob,
  toNaturalKey,
} from "../../../engine.js";
import { postedFromExact, postedFromRelative } from "../../posted.js";
import { platformMeta } from "@job-tracker/shared/platforms";
import { ICON } from "../../../icons.js";
import { LINKEDIN_PREFIX, linkedinJobId, linkedinRenderKey } from "./identity.js";

// The render-key prefix is owned by this integration (identity.ts, shared with the
// Gmail surface). The canonical posting URL comes from the shared platform registry
// so the dashboard rebuilds the very same link; `linkedin` is a registry default, so
// the lookup always resolves. This adapter owns only LinkedIn's DOM/scraping.
const LINKEDIN = platformMeta("linkedin")!;
const PREFIX = LINKEDIN_PREFIX; // "LI-"
const postingUrl = (platformId: string) => LINKEDIN.buildUrl!(platformId)!;

// LinkedIn — the primary source: search list, the SDUI jobs-tracker, and job detail
// views. Full capture. All LinkedIn DOM knowledge lives HERE; the engine it drives
// is site-agnostic.

// LinkedIn's DOM contract — every selector the adapter keys on, grouped by surface,
// and the single map to update when LinkedIn reshuffles its markup. Layout A = the
// list/search side panel (stable BEM-ish classes); layout B = the standalone
// /jobs/view SDUI page (hashed classes, addressable only via ids / aria /
// componentkey). `jobDetailsId` and `applyButtonId` are bare element ids; the rest
// are query selectors.
const SEL = {
  // Detail top card / anchor
  topCard: ".job-details-jobs-unified-top-card",
  moreOptions: 'button[aria-label="More options"]',
  componentKey: "[componentkey]",
  // Job-description container (resolved across both layouts, in order)
  jobDetailsId: "job-details",
  aboutJob: '[componentkey^="JobDetails_AboutTheJob"]',
  expandableText: '[data-testid="expandable-text-box"]',
  // Fit-level chips (layout A) — banner anchor + captured chips
  fitChips: ".job-details-fit-level-preferences",
  fitChipButtons: ".job-details-fit-level-preferences button",
  // Applied-state detection
  appliedLink:
    '#jobs-apply-see-application-link, .jobs-s-apply__application-link[href*="stage=applied"]',
  appliedFeedback: '.jobs-s-apply [role="alert"], .jobs-s-apply__application-link',
  // Apply control → apply_type
  applyButtonId: "jobs-apply-button-id",
  applyControl: 'a[aria-label*="on company website" i], [aria-label*="Easy Apply" i]',
  externalIcon:
    '[data-test-icon^="link-external"], [id^="link-external"], use[href^="#link-external"]',
  // Identity (layout A classes; layout B falls back to document.title + hrefs)
  companyLink: ".job-details-jobs-unified-top-card__company-name a",
  jobTitle: ".job-details-jobs-unified-top-card__job-title",
  companyAnchor: 'a[href*="/company/"]',
  // Captured meta
  salary: "#SALARY",
  matchLevel: ".job-details-fit-level-card .tvm__text--positive",
  posterName: ".hirer-card__hirer-information .jobs-poster__name",
  posterLink: ".hirer-card__hirer-information a",
  // Search-list cards
  searchCard: "li[data-occludable-job-id]",
  searchCardLink: 'a[aria-label][href*="/jobs/view/"]',
  // Search-card footers may provide an exact day in <time datetime="YYYY-MM-DD">.
  cardPostedTime: "time[datetime]",
  lockupSubtitle: ".artdeco-entity-lockup__subtitle",
  cardFooterState: ".job-card-container__footer-job-state",
  dismiss: '[aria-label^="Dismiss"]',
  cardBody: '[class*="job-card-container"] > div:first-child',
  // jobs-tracker wall cards
  trackerJobLink: 'a[href*="/jobs/view/"]',
  overflowMenu: 'button[aria-label="Overflow menu"]',
} as const;

// ── Identifier / URL ─────────────────────────────────────────────────────────
// The current LinkedIn detail-view job, from the standalone path OR the list-page
// side panel's `currentJobId` query param (so `seen` fires for both).
function currentDetailId(): string | null {
  const key = linkedinRenderKey(location.pathname);
  if (key) return key;
  const q = new URLSearchParams(location.search).get("currentJobId");
  return q ? PREFIX + q : null;
}

// ── Detail DOM resolution (two layouts) ──────────────────────────────────────
// The detail pane's own "More options" button. On the side-panel layout a page-wide
// query would grab a *list card's* button and misplace the bar, so scope to the
// detail top card; fall back to page-wide only on /jobs/view/, which has no cards.
function detailAnchor(): Element | null {
  const topCard = document.querySelector(SEL.topCard);
  const scoped = topCard?.querySelector(SEL.moreOptions);
  if (scoped) return scoped;
  if (linkedinJobId(location.pathname)) {
    return document.querySelector(SEL.moreOptions);
  }
  return null;
}

// The job-description container, across both layouts. #job-details is tried first so
// layout A never reaches the fallbacks; layout B's JD sits in the AboutTheJob
// componentkey. The nominal expandable-text-box span is a legacy last resort: it
// wraps the JD as <span><p>…</p></span>, which every HTML parser auto-closes at the
// first block <p>, leaving it empty.
function detailElement(): HTMLElement | null {
  return (
    document.getElementById(SEL.jobDetailsId) ||
    (document.querySelector(SEL.aboutJob) as HTMLElement | null) ||
    (document.querySelector(SEL.expandableText) as HTMLElement | null)
  );
}

// Applicant count and posting age live outside the description container.
function scanJobSignals(detail: HTMLElement | null) {
  let applicants: number | null = null; // parsed integer count, when a number is shown
  let applyClicksShown = false; // "N people clicked apply" present (may be 100+)
  let postedAge: string | null = null; // e.g. "17 days ago"
  document.querySelectorAll("span").forEach((el) => {
    if (!detail || el === detail || detail.contains(el)) return;
    const t = el.textContent!.trim();
    if (!applyClicksShown && /clicked apply/i.test(t)) {
      applyClicksShown = true;
      const numM = t.match(/(\d[\d,]*)\s+people/i);
      if (numM) applicants = Number(numM[1].replace(/,/g, ""));
    }
    // The current job's own age, rendered prefix-less ("1 month ago") in the top
    // card, which precedes the similar-jobs rail — so first-match wins and stays
    // scoped. Weeks/months are matched so this job's date wins over a similar job's
    // "N days ago"; minutes so a just-posted job doesn't fall through to no
    // posted_at at all.
    if (!postedAge && /^\d+\s+(?:minute|hour|day|week|month)s?\s+ago$/i.test(t)) postedAge = t;
  });
  return { applicants, applyClicksShown, postedAge };
}

// A same-document search card can pin an exact day for the open detail; otherwise
// posting age stays an estimate. Optional evidence — promoted and occluded cards
// may expose no date.
function listCardPostedDay(platformId: string): string | null {
  const card = document.querySelector(`li[data-occludable-job-id="${platformId}"]`);
  const time = card?.querySelector(SEL.cardPostedTime);
  return time?.getAttribute("datetime")?.trim() || null;
}

// ── Detail head (warnings banner + copy button) ──────────────────────────────
// A strip at the top card carrying two independent things, both gated on the JD
// being present: the ⚠ keyword/analytics banner (only when there's something to
// flag) and, always, a "Copy Job Description" button. They share one placement and
// one dedup because both want the top-card slot, the JD itself sitting far down the
// standalone page. A clean posting shows just the button.
function renderDetailHead(detail: HTMLElement) {
  // elementToText, not raw textContent, so block boundaries are newlined — the banner
  // clips each keyword's context to its own line and can't run into the next paragraph.
  const text = elementToText(detail);
  if (!text) return; // no JD → neither banner nor copy button

  // Warnings — keyword findings, header analytics, and the block flag. May be empty;
  // placeBanner then adds nothing and the head is just the copy button.
  const findings = keywordFindings(text);
  const chips: string[] = [];
  // Explain why a blocked listing is not captured.
  const { company } = detailIdentity();
  const blocked = isCompanyBlocked(company, "linkedin");
  if (blocked) chips.push("blocked company");
  // Analytics from the page header (never inside the JD element).
  const { applicants, applyClicksShown, postedAge } = scanJobSignals(detail);
  if (applyClicksShown) {
    chips.push(applicants != null ? applicants + " applicants" : "100+ applicants");
  }
  if (postedAge && parseInt(postedAge) > 14) chips.push("stale (" + postedAge + ")");

  // Rebuild only when what the head would show changes. Scraping first and keying on
  // the result is what lets the applicant count, the posting age and the JD arrive in
  // different scans and still reach the banner; an unchanged scrape means no rebuild,
  // so a transient "Copied ✓" label survives the next scan tick.
  const content = { chips, findings };
  const signature = bannerSignature(content);
  const existing = document.querySelector(".jh-detail-head") as HTMLElement | null;
  if (existing) {
    if (existing.dataset.jhSignature === signature) return;
    existing.remove();
  }
  const head = document.createElement("div");
  head.className = "jh-detail-head";
  head.dataset.jhSignature = signature;
  placeBanner(content, head, { danger: blocked, position: "append" });

  head.appendChild(makeCopyButton());

  // Where the head lands — a quick-scan slot at the top card, not down by the JD,
  // which on the standalone page sits below the Premium / Application-status /
  // hiring-team sections:
  //   A) List/search side panel: before the fit-level chips, under the title.
  //   B) Standalone /jobs/view/ (SDUI): no such chips, so append under the top card.
  //   C) Neither resolves: before the JD container.
  const fitChips = document.querySelector(SEL.fitChips);
  if (fitChips) {
    fitChips.parentNode!.insertBefore(head, fitChips);
    return;
  }
  const topCard = standaloneTopCard();
  if (topCard) {
    topCard.appendChild(head);
    return;
  }
  const jdAnchor = (detail.id ? detail : detail.parentElement) || detail;
  jdAnchor.parentNode!.insertBefore(head, jdAnchor);
}

// The "Copy Job Description" button: puts the posting on the clipboard as one block —
// title, company, canonical URL, then the JD. The JD is re-read from the DOM at click
// time, not at render, so a click copies what's on screen even after LinkedIn's SPA
// mutates the pane. Success and failure get distinct labels, so a refused clipboard
// write never reads as a silent success.
const COPY_LABEL = "Copy Job Description";
function makeCopyButton(): HTMLElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "jh-banner-copy";
  btn.title = "Copy the job title, company, link and description";
  btn.innerHTML = `${ICON.copy}<span class="jh-banner-copy-label">${COPY_LABEL}</span>`;
  const label = btn.querySelector(".jh-banner-copy-label") as HTMLElement;
  let resetTimer: number | undefined;
  // Force the label open for the ~1.5s confirmation so it lands even if the cursor
  // has left or the click came from the keyboard. Otherwise the button is icon-only
  // and CSS reveals the label on hover/focus.
  const flash = (msg: string) => {
    label.textContent = msg;
    btn.classList.add("jh-copy-flashing");
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      label.textContent = COPY_LABEL;
      btn.classList.remove("jh-copy-flashing");
    }, 1500);
  };
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = buildCopyText();
    if (!text) {
      flash("Nothing to copy");
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => flash("Copied ✓"),
      () => flash("Copy failed"),
    );
  });
  return btn;
}

// The clipboard payload, from the live detail pane. Null when the JD is gone, so the
// button reports "Nothing to copy" rather than putting a bare header out.
function buildCopyText(): string | null {
  const jd = elementToText(detailElement());
  if (!jd) return null;
  const { title, company } = detailIdentity();
  const key = toNaturalKey(currentDetailId() || "");
  const url = key ? postingUrl(key.platform_id) : location.href;
  const header = [title, company].filter(Boolean).join(" — ");
  return [...(header ? [header] : []), url, "", jd].join("\n");
}

// The standalone SDUI job view has no stable top-card class — every class is a
// rotating hash — but the "More options" button is stable and lives in the top card.
// The details panel is that button's nearest componentkey ancestor, and the top card
// is the panel's direct child holding it, so walk up to the panel boundary. Null off
// that layout, or if LinkedIn reshuffles the tree, so the caller falls back.
function standaloneTopCard(): Element | null {
  const mo = detailAnchor();
  const panel = mo?.closest(SEL.componentKey) ?? null;
  if (!mo || !panel) return null;
  let el: Element = mo;
  while (el.parentElement && el.parentElement !== panel) el = el.parentElement;
  return el.parentElement === panel ? el : null;
}

// ── Auto-detects (applied / closed) ──────────────────────────────────────────
function detectApplied(jobId: string) {
  const hasLegacyStatus =
    [...document.querySelectorAll("h2")].some(
      (el) => el.textContent?.trim().toLowerCase() === "application status",
    ) &&
    [...document.querySelectorAll("p")].some((el) =>
      /^(Applied\b|Application submitted)/i.test(el.textContent!.trim()),
    );

  // List/search detail pane uses a success feedback block + "See application" link,
  // and often does not render the legacy "Application status" heading.
  const hasAppliedLink = Boolean(document.querySelector(SEL.appliedLink));
  const hasAppliedFeedback = [...document.querySelectorAll(SEL.appliedFeedback)].some((el) =>
    /\b(Applied\b|Application submitted)\b/i.test(el.textContent!.trim()),
  );

  if (hasLegacyStatus || hasAppliedLink || hasAppliedFeedback) void autoEmit(jobId, "applied");
}

function detectClosed(jobId: string) {
  const isClosed = [...document.querySelectorAll("p")].some(
    (el) => el.textContent!.trim() === "No longer accepting applications",
  );
  if (isClosed) markListingClosed(jobId).catch(() => {});
}

// ── Listing capture ──────────────────────────────────────────────────────────
// Both layouts expose the current job's apply type through the apply control.
// Inconclusive results stay unknown rather than polluting analytics.
function detectApplyType(): string {
  const btn =
    document.getElementById(SEL.applyButtonId) || document.querySelector(SEL.applyControl);
  if (!btn) return "unknown";
  const label = (btn.getAttribute("aria-label") || "") + " " + (btn.textContent || "");
  if (/easy apply/i.test(label)) return "easy_apply";
  if (/on company website/i.test(label) || btn.querySelector(SEL.externalIcon)) {
    return "external";
  }
  return "unknown";
}

// The job's title, company, and company-page url, across both layouts: layout A has
// stable BEM-ish classes, layout B is SDUI and addressable only via document.title /
// hrefs. Shared by listing capture and the repost-match check, which needs these keys
// the moment the view opens, before a full capture has run.
function detailIdentity(): {
  title: string | null;
  company: string | null;
  companyUrl: string | null;
} {
  if (document.getElementById(SEL.jobDetailsId)) {
    const companyA = document.querySelector(SEL.companyLink) as HTMLAnchorElement | null;
    return {
      title: detailText(SEL.jobTitle),
      company: companyA?.textContent?.trim() || null,
      companyUrl: companyA?.href || null,
    };
  }
  // Standalone view — document.title is "Title | Company | LinkedIn". Split from
  // the end so a title containing " | " still yields the right company.
  const segs = document.title.split(" | ");
  if (segs[segs.length - 1] === "LinkedIn") segs.pop();
  let company = segs.length >= 2 ? segs.pop()!.trim() : null;
  const title = segs.length ? segs.join(" | ").trim() : null;
  const companyA = document.querySelector(SEL.companyAnchor) as HTMLAnchorElement | null;
  if (!company) company = companyA?.textContent?.trim() || null;
  return { title, company, companyUrl: companyA?.href || null };
}

// Scrape one LinkedIn job detail into a `listings` record. The stable core (platform
// key, url, title, company, apply_type) are real columns; everything uncertain lives
// in `meta`, null-safe and often absent.
function captureDetail(jobId: string): ListingRecord | null {
  const key = toNaturalKey(jobId);
  if (!key) return null;
  const detail = detailElement();
  const { title, company, companyUrl } = detailIdentity();

  const { applicants, postedAge } = scanJobSignals(detail);

  // Prefer the card's absolute date; otherwise anchor the relative age to capture
  // time and retain the original text as evidence.
  const capturedAt = new Date().toISOString();
  const cardDay = listCardPostedDay(key.platform_id);
  const posted = cardDay ? postedFromExact(cardDay) : postedFromRelative(postedAge, capturedAt);

  return {
    ...key,
    url: postingUrl(key.platform_id),
    title,
    company,
    apply_type: detectApplyType(),
    meta: {
      company_url: companyUrl,
      posted_at: posted.at,
      posted_precision: posted.precision,
      posted_age: postedAge,
      applicants,
      salary: detailText(SEL.salary),
      match_level: detailText(SEL.matchLevel),
      chips: [...document.querySelectorAll(SEL.fitChipButtons)]
        .map((b) => b.textContent!.trim())
        .filter(Boolean),
      poster: detailText(SEL.posterName),
      poster_url:
        (document.querySelector(SEL.posterLink) as HTMLAnchorElement | null)?.href || null,
      description: elementToText(detail),
    },
  };
}

// The jobs-tracker Applied wall dates each row only as a relative age ("Applied 2d
// ago", "3mo ago") — no absolute timestamp in the DOM. Turn that into an approximate
// UTC ISO (now − offset) so the auto-`applied` sweep dates each application near when
// it happened rather than clustering them at import time. Day granularity is the best
// the surface offers. Null when the span is absent or doesn't parse.
const AGE_MS: Record<string, number> = {
  s: 1e3,
  m: 6e4,
  min: 6e4,
  h: 36e5,
  hr: 36e5,
  d: 864e5,
  w: 6048e5,
  mo: 2592e6,
  y: 31536e6,
  yr: 31536e6,
};
function appliedAgeToIso(cardText: string): string | null {
  // Anchored on "Applied" so a sibling "(Posted 4w ago)" can't be mistaken for it.
  // `mo`/`yr`/`hr`/`min` are matched before the single-letter units.
  const m = cardText.match(/Applied\s+(\d+)\s*(mo|yr|hr|min|[smhdwy])\b/i);
  if (!m) return null;
  const ms = AGE_MS[m[2].toLowerCase()];
  if (!ms) return null;
  return new Date(Date.now() - Number(m[1]) * ms).toISOString();
}

// ── The adapter ──────────────────────────────────────────────────────────────
export const linkedinAdapter: Adapter = {
  matches: (h) => h === "www.linkedin.com",
  // LinkedIn ids are "LI-<numeric>". Gmail's LinkedIn-email cards reuse this prefix,
  // so this resolves those too (Gmail has no natural key of its own).
  naturalKey: (id) =>
    id.startsWith(PREFIX) ? { platform: "linkedin", platform_id: id.slice(PREFIX.length) } : null,
  // The whole site is injected so the script is already there when an in-app
  // transition (feed → jobs) carries the user in without reloading the document.
  // `activeOn` then limits actual work to the job surfaces.
  activeOn: (path) => path.startsWith("/jobs") || path.startsWith("/comm/jobs"),
  cardBodySelector: SEL.cardBody,
  scanDetail() {
    const jobId = currentDetailId();

    // Clean up bar (and any open match popover) from the previous job on SPA nav
    const existingBar = document.querySelector(".jh-detail-actions") as HTMLElement | null;
    if (existingBar && existingBar.dataset.jhJobId !== jobId) {
      existingBar.remove();
      closeMatchPopover();
    }

    // Buttons, auto-detects, and `seen` don't wait on the job description loading.
    if (jobId) {
      injectDetailButtons(jobId, detailAnchor());
      detectApplied(jobId);
      detectClosed(jobId);
      void autoEmit(jobId, "seen"); // opening the complete view = seen (monotonic, deduped)
      void refreshStates([jobId]).then(() => renderJob(jobId));
      // Repost guard: flag sibling jobs sharing this posting's title+company, so a
      // reposted listing isn't mistaken for a brand-new job (and re-applied to).
      const { title, company } = detailIdentity();
      void checkMatches(jobId, title, company);
    }

    // The head needs the description content, so it waits on detailElement()
    // resolving whichever of the two JD layouts is present.
    const detail = detailElement();
    if (!detail) return;
    renderDetailHead(detail);
  },
  capture() {
    captureListingOnce(currentDetailId(), captureDetail);
  },
  isAppliedCard(card) {
    const state = card.querySelector(SEL.cardFooterState);
    return state?.textContent?.trim() === "Applied";
  },
  nativeDismiss(card) {
    const btn = card.querySelector(SEL.dismiss) as HTMLElement | null;
    return btn ? () => btn.click() : null;
  },
  // Every job on the jobs-tracker's ?stage=applied has been applied to. The other
  // stages (Saved / In Progress / Archived) don't map cleanly onto the funnel, so
  // only this one is a wall.
  wallStatus: () =>
    location.pathname.startsWith("/jobs-tracker") &&
    new URLSearchParams(location.search).get("stage") === "applied"
      ? "applied"
      : null,
  findCards(doc) {
    // The jobs-tracker is SDUI with hashed classes and no stable per-card attribute,
    // so the only durable hook is the /jobs/view/{id}/ anchor wrapping each card.
    // Every job here is applied, so `jhWall` marks it for the autoWallCards sweep,
    // and forcing "dim" keeps resolved cards from vanishing in "remove" mode.
    if (location.pathname.startsWith("/jobs-tracker")) {
      const cards: HTMLElement[] = [];
      doc.querySelectorAll(SEL.trackerJobLink).forEach((a) => {
        const renderKey = linkedinRenderKey(a.getAttribute("href") || "");
        if (!renderKey) return;
        // The card is the nearest ancestor also holding the row's "Overflow menu",
        // where LinkedIn's own actions live, so our bar renders alongside them rather
        // than clipped inside the thin <a>. The depth bound stops a rail anchor from
        // climbing to the whole-list container; fall back to the wrapper if none.
        let card: HTMLElement | null = null;
        for (let node = a.parentElement, i = 0; node && i < 6; node = node.parentElement, i++) {
          if (node.querySelector(SEL.overflowMenu)) {
            card = node;
            break;
          }
        }
        card = card || (a.parentElement as HTMLElement) || (a as unknown as HTMLElement);
        // Per-element, not per-id: the list renders a job more than once (left rail +
        // main pane) and each tile needs its own bar, since renderJob fans out by id.
        // The guard skips a copy already tagged this session.
        if (card.dataset.jhId) return;
        // Card lines in the anchor: P1 is the title, the "Company · Location
        // (Workplace)" line is the company.
        const ps = [...a.querySelectorAll("p")].map((p) => p.textContent!.trim());
        const subtitle = ps.find((t) => t.includes("·"));
        card.dataset.jhId = renderKey;
        card.dataset.jobUrl = (a as HTMLAnchorElement).href;
        card.dataset.jobTitle = ps[0] || "";
        card.dataset.jobCompany = subtitle ? subtitle.split("·")[0].trim() : "";
        card.dataset.jhForceMode = "dim";
        card.dataset.jhWall = "1";
        // Date the auto-`applied` sweep from the row's "Applied N ago" age so a bulk
        // import isn't clustered at now(). autoWallCards reads jhTs.
        const ts = appliedAgeToIso(card.innerText);
        if (ts) card.dataset.jhTs = ts;
        cards.push(card);
      });
      return cards;
    }

    const cards: HTMLElement[] = [];
    doc.querySelectorAll(SEL.searchCard).forEach((li) => {
      const el = li as HTMLElement;
      if (el.dataset.jhId) return;
      const id = el.dataset.occludableJobId;
      const a = el.querySelector(SEL.searchCardLink) as HTMLAnchorElement | null;
      if (!a) return;
      el.dataset.jhId = PREFIX + id;
      el.dataset.jobUrl = a.href;
      el.dataset.jobTitle = a.getAttribute("aria-label") || "";
      el.dataset.jobCompany = el.querySelector(SEL.lockupSubtitle)?.textContent?.trim() || "";
      // The search list is the one genuinely tight surface, so mark it and let the
      // action bar fold the less-used Open into the ⋯ menu. The roomier jobs-tracker
      // wall and detail bar stay unfolded.
      el.dataset.jhCompact = "1";
      cards.push(el);
    });
    return cards;
  },
};
