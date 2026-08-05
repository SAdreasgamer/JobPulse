// LinkedIn's render-key prefix — the one identity fact both LinkedIn surfaces
// share. The web adapter tags a card "LI-4424562295" and parses it back; the Gmail
// adapter reuses the prefix because its job links ARE LinkedIn postings, carrying no
// natural key of their own. Render keys are extension-local, so they live here
// rather than in the shared platform registry, which owns only runtime-agnostic
// display/link data (label, canonical URL, date quirks).
export const LINKEDIN_PREFIX = "LI-";

// Both URL shapes LinkedIn hands out for a posting must resolve to the same id:
// in-app navigation writes the bare `/jobs/view/4444945220/`, while shared, emailed,
// and search-engine links carry an SEO slug ahead of it
// (`/jobs/view/junior-engineer-at-example-employer-4444945220/`).
//
// The id is the last hyphen-delimited digit run in the segment, so a slug carrying
// its own numbers ("data-engineer-2-at-example-123456") still resolves to the trailing
// id; the lookahead pins it to the segment end. Unanchored at the front so the
// `/comm/jobs/view/` email variant matches the same pattern.
const JOB_PATH = /\/jobs\/view\/(?:[^/?#]*-)?(\d+)(?=[/?#]|$)/;

/** The numeric platform id in a LinkedIn job URL or path. Null when there is none. */
export function linkedinJobId(source: string): string | null {
  return source.match(JOB_PATH)?.[1] ?? null;
}

/** The prefixed render key ("LI-4444945220") for a LinkedIn job URL or path. */
export function linkedinRenderKey(source: string): string | null {
  const id = linkedinJobId(source);
  return id ? LINKEDIN_PREFIX + id : null;
}
