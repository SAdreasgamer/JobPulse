import { companyFromSubject, fallbackSeedFromSubject, rejectedHead } from "./subject.js";

// Seed off-platform search from URL structure or a Gmail tab title without reading
// page content. The rule allows opt-in diagnostics to evaluate extraction quality.
export interface SeedResult {
  value: string;
  rule: "domain-label" | "ats-path" | "gmail-subject" | "gmail-subject-fallback" | "none";
}
const NO_SEED: SeedResult = { value: "", rule: "none" };

// The seed is a search query, not a display string: the leading word is enough to find
// the job, and a short query searches better than a full title/subject fragment. So
// every rule's value is reduced to its first whitespace-delimited token.
const firstWord = (s: string) => s.trim().split(/\s+/)[0] ?? "";
const GENERIC_SUBDOMAINS = new Set([
  "www",
  "careers",
  "career",
  "jobs",
  "job",
  "apply",
  "hire",
  "hiring",
  "work",
  "recruiting",
  "recruit",
  "talent",
  "boards",
  "board",
  "secure",
  "my",
  "people",
]);
const GENERIC_HOSTS = new Set([
  "google",
  "gmail",
  "googlemail",
  "outlook",
  "office",
  "office365",
  "live",
  "hotmail",
  "msn",
  "yahoo",
  "proton",
  "protonmail",
  "fastmail",
  "icloud",
  "aol",
  "gmx",
  "zoho",
  "mail",
  "email",
  "linkedin",
  "indeed",
  "glassdoor",
  "monster",
]);
// ATS where the company sits in the path, not the domain label.
const ATS_HOSTS = new Set([
  "greenhouse",
  "lever",
  "myworkdayjobs",
  "workday",
  "ashbyhq",
  "ashby",
  "teamtailor",
  "smartrecruiters",
  "bamboohr",
  "recruitee",
  "personio",
  "jobvite",
  "icims",
  "taleo",
  "successfactors",
  "breezy",
  "workable",
  "pinpointhq",
]);

// Hosts the content script already handles, read from the manifest's match patterns so
// this can't drift. There the popup's off-platform premise doesn't hold — the injected
// UI owns the job — so we never seed.
const SUPPORTED_BASES = (() => {
  const bases = new Set<string>();
  for (const entry of chrome.runtime.getManifest().content_scripts || []) {
    for (const pattern of entry.matches || []) {
      const m = /:\/\/([^/*]+)/.exec(pattern);
      if (m) bases.add(m[1].replace(/^www\./, ""));
    }
  }
  return [...bases];
})();
const isSupportedHost = (host: string) =>
  SUPPORTED_BASES.some((base) => host === base || host.endsWith(`.${base}`));

export function seedFromTab(tab: chrome.tabs.Tab | undefined): SeedResult {
  if (!tab || !tab.url) return NO_SEED;
  let url;
  try {
    url = new URL(tab.url);
  } catch {
    return NO_SEED;
  }
  // Only real web pages carry a company signal. chrome://, about:, file: and friends
  // yield single-label "hosts" like "extensions"/"newtab" that sail through every
  // guard below and seed junk.
  if (url.protocol !== "http:" && url.protocol !== "https:") return NO_SEED;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || /^[\d.]+$/.test(host)) return NO_SEED;
  // Gmail is both a supported host and a generic one, so handle it before either
  // guard: its signal isn't the domain, it's the open email's subject.
  if (host === "mail.google.com") {
    const company = companyFromSubject(tab.title || "");
    if (company) return { value: firstWord(company), rule: "gmail-subject" };
    // Fall back to the first meaningful subject word; reject boilerplate openers.
    const subject = fallbackSeedFromSubject(tab.title || "");
    if (!subject || rejectedHead(subject)) return NO_SEED;
    return { value: firstWord(subject), rule: "gmail-subject-fallback" };
  }
  if (isSupportedHost(host)) return NO_SEED;
  const parts = host.split(".").filter(Boolean);
  while (parts.length > 2 && GENERIC_SUBDOMAINS.has(parts[0])) parts.shift();
  const label = parts[0];
  if (!label || GENERIC_HOSTS.has(label)) return NO_SEED;
  if (ATS_HOSTS.has(label)) {
    const seg = url.pathname.split("/").filter(Boolean)[0];
    return seg && !/^\d+$/.test(seg)
      ? { value: firstWord(decodeURIComponent(seg)), rule: "ats-path" }
      : NO_SEED;
  }
  return { value: firstWord(label), rule: "domain-label" };
}
