// Normalization for the advisory `company_key` / `title_key` lookup fields, and the
// single TS mirror of the server's app.core.text. Both ends MUST agree: the server
// stores a job or block under these keys, and the extension matches each card's
// company against the synced blocklist with the same key, so a drift here silently
// stops a block from matching. They're pinned by text.golden.json — the server's
// pytest suite writes that fixture and text.golden.test.ts replays it here.

// Common legal/entity suffixes stripped so "Example Company N.V." and "Example
// Company" fold together.
const COMPANY_SUFFIXES: ReadonlySet<string> = new Set([
  "nv",
  "bv",
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "gmbh",
  "corp",
  "corporation",
  "co",
  "plc",
  "sa",
  "ag",
  "group",
  "holding",
  "holdings",
  "the",
]);

// Words qualifying a company rather than naming it, stripped in trailing position
// only. Which words earn a place here, and why agency words are kept out, is settled
// in the authority (app.core.text).
const COMPANY_DESCRIPTORS: ReadonlySet<string> = new Set([
  "bank",
  "benelux",
  "en",
  "english",
  "europe",
  "groep",
  "nederland",
  "netherlands",
  "uk",
]);

function collapse(value: string): string {
  // Dots and apostrophes go first so dotted abbreviations fold together ("N.V." ->
  // "nv"); remaining separators then become single spaces.
  const withoutDots = value.toLowerCase().replace(/[.']/g, "");
  return withoutDots.replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeCompany(name: string | null | undefined): string | null {
  if (!name) return null;
  const tokens = collapse(name)
    .split(/\s+/)
    .filter((t) => t && !COMPANY_SUFFIXES.has(t));
  // After the suffix filter, so a qualifier standing in front of a legal suffix still
  // ends up trailing. One token always survives.
  while (tokens.length > 1 && COMPANY_DESCRIPTORS.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(" ") || null;
}

export function normalizeTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  return collapse(title) || null;
}
