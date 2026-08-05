// ── Pure DOM/text helpers ────────────────────────────────────────────────────
// A dependency-free leaf of the engine: stringifying a DOM subtree and placing the
// ⚠ banner. Nothing here touches the read-model, the API bridge, or the adapter
// registry — it imports only engine/keywords.ts, itself a pure leaf — so the engine
// and any adapter can pull it in without a cycle.
import { type KeywordFinding, getPolicyRevision } from "./keywords.js";

// Null-safe text reader for a selector — used across sites when scraping detail.
export function detailText(sel: string) {
  return document.querySelector(sel)?.textContent?.trim() || null;
}

// Block-level tags whose boundaries must become a line break when flattening a node
// to text. A JD is often a stack of <p>/<li> blocks with no whitespace between them,
// so `textContent` glues the last word of one onto the first of the next
// ("...bigYour team", "...bayCarry responsibility").
const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "LI",
  "UL",
  "OL",
  "TR",
  "SECTION",
  "ARTICLE",
  "BLOCKQUOTE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
]);

// Flatten an element to readable text: block boundaries become newlines, and any
// collapse toggle (a <button>/[role=button] "show more" control) is dropped so its
// label isn't appended. The trailing-token strip is an ellipsis-anchored safety net
// for an SDUI "…more" that slips through. Operates on a clone, never the live page.
export function elementToText(root: Element | null) {
  if (!root) return null;
  const clone = root.cloneNode(true) as Element;
  clone.querySelectorAll('button, [role="button"]').forEach((el) => el.remove());
  let out = "";
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.nodeValue!.replace(/\s+/g, " ");
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if ((child as Element).tagName === "BR") {
          out += "\n";
          continue;
        }
        const block = BLOCK_TAGS.has((child as Element).tagName);
        if (block && out && !out.endsWith("\n")) out += "\n";
        walk(child);
        if (block && out && !out.endsWith("\n")) out += "\n";
      }
    }
  };
  walk(clone);
  return (
    out
      .replace(/ *\n */g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s*(?:…|\.{3})\s*(?:see |show )?more\s*$/i, "")
      .trim() || null
  );
}

// A banner is a function of two things — the job on screen and the policy that matched
// it — so both belong in the cache key any caller reuses one by.
export function bannerFingerprint() {
  return `${location.href}#p${getPolicyRevision()}`;
}

// The stricter key, for a caller that scrapes before it decides: the job and policy
// plus what the banner would show. Detail panes render in stages, so the same job can
// yield more warnings a scan later — an applicant count, a posting age, a JD that had
// not loaded — and a fingerprint alone would never ask for the rebuild that shows
// them, leaving a reload as the only way to see the complete set.
export function bannerSignature(content: BannerContent) {
  return `${bannerFingerprint()}#${bannerKey(content)}`;
}

// What the banner shows, flattened. A finding is identified by its rule and matched
// word, so shifting context around the same match is not a change worth rebuilding for.
function bannerKey(content: BannerContent) {
  const findings = (content.findings ?? []).map((f) => `${f.ruleId}:${f.match}`);
  return [...(content.chips ?? []), ...findings].join("|");
}

// Banner dedup: true if a still-valid banner is already up, so the caller can skip
// rebuilding. Otherwise clears the superseded one. Passing the scraped content checks
// against the stricter bannerSignature key; omitting it asks only about the job and
// policy, which is all a caller that has not scraped yet can answer for.
export function bannerCurrent(content?: BannerContent) {
  const existing = document.querySelector(".jh-detail-banner") as HTMLElement | null;
  const current =
    existing?.dataset.jhFingerprint === bannerFingerprint() &&
    (!content || existing?.dataset.jhContent === bannerKey(content));
  if (current) return true;
  existing?.remove();
  return false;
}

// What the ⚠ banner renders: short standalone `chips` (blocked company, applicant
// count, staleness — flags with no useful JD context) on one row, then one line per
// keyword `finding` with the matched word highlighted in its surrounding context.
export interface BannerContent {
  chips?: string[];
  findings?: KeywordFinding[];
}

// Place the ⚠ banner relative to `anchor`: immediately before it, or as its last
// child under `position: "append"`, so an adapter can drop it inside the top card
// rather than before some later section. No-op when there's nothing to flag or
// nowhere to hang it. `danger` swaps the mild-warning yellow for the red of a card's
// jh-red outline, for flags that shouldn't blend in with routine JD ones (e.g.
// "blocked company", where the listing silently won't be enriched further).
export function placeBanner(
  content: BannerContent,
  anchor: Element | null,
  opts?: { danger?: boolean; position?: "before" | "append" },
) {
  const chips = content.chips ?? [];
  const findings = content.findings ?? [];
  if ((!chips.length && !findings.length) || !anchor) return;

  const banner = document.createElement("div");
  banner.dataset.jhBanner = "1";
  banner.dataset.jhFingerprint = bannerFingerprint();
  banner.dataset.jhContent = bannerKey(content);
  banner.className = "jh-detail-banner" + (opts?.danger ? " jh-detail-banner--danger" : "");

  const icon = document.createElement("span");
  icon.className = "jh-banner-icon";
  icon.textContent = "⚠";

  const body = document.createElement("div");
  body.className = "jh-banner-body";
  if (chips.length) {
    const row = document.createElement("div");
    row.className = "jh-banner-chips";
    for (const c of chips) {
      const chip = document.createElement("span");
      chip.className = "jh-banner-chip";
      chip.textContent = c;
      row.appendChild(chip);
    }
    body.appendChild(row);
  }
  for (const f of findings) body.appendChild(findingRow(f));

  banner.append(icon, body);
  if (opts?.position === "append") anchor.appendChild(banner);
  else anchor.parentNode!.insertBefore(banner, anchor);
}

// One finding line: a normalized label chip, then the JD context with the matched
// keyword wrapped in <mark>. Built with textContent/createElement only — the JD is
// untrusted page text, so it never touches innerHTML.
function findingRow(f: KeywordFinding): HTMLElement {
  const row = document.createElement("div");
  row.className = "jh-banner-finding";

  const label = document.createElement("span");
  label.className = "jh-banner-label";
  label.textContent = f.label;

  const ctx = document.createElement("span");
  ctx.className = "jh-banner-ctx";
  const mark = document.createElement("mark");
  mark.textContent = f.match;
  ctx.append(document.createTextNode(f.before), mark, document.createTextNode(f.after));

  row.append(label, ctx);
  return row;
}
