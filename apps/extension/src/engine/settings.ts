// chrome.storage boundary for keyword policy. Matching remains dependency-free in
// keywords.ts; all stored values pass through validation here.
import { type KeywordPolicy, defaultPolicy, sanitizePolicy, setActivePolicy } from "./keywords.js";

export const KEYWORD_POLICY_KEY = "keywordPolicy";

// Publish the validated policy for matchers and optionally return it to the UI.
export function loadKeywordPolicy(cb?: (policy: KeywordPolicy) => void): void {
  chrome.storage.local.get(KEYWORD_POLICY_KEY, (data) => {
    const policy = sanitizePolicy(data[KEYWORD_POLICY_KEY]);
    setActivePolicy(policy);
    cb?.(policy);
  });
}

// Storage changes notify other extension contexts, so no explicit message is needed.
export function saveKeywordPolicy(
  policy: KeywordPolicy,
  cb?: (policy: KeywordPolicy) => void,
): void {
  const clean = sanitizePolicy(policy);
  setActivePolicy(clean);
  chrome.storage.local.set({ [KEYWORD_POLICY_KEY]: clean }, () => cb?.(clean));
}

export function resetKeywordPolicy(cb?: (policy: KeywordPolicy) => void): void {
  saveKeywordPolicy(defaultPolicy(), cb);
}
