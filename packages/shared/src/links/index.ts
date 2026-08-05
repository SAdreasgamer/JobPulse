// Reconstruct a link to the original posting from the (platform, platform_id) natural
// key, so even an uncaptured stub job (listings.url == null) is reachable from the
// dashboard. A captured url wins when present. How each platform reconstructs a link,
// or that it can't, lives in the platform registry, so no site is named here — a
// private board supplies its own via `registerPlatform`.
import { platformMeta } from "../platforms";

export function postingUrl(
  platform: string,
  platformId: string,
  storedUrl?: string | null,
): string | null {
  if (storedUrl) return storedUrl;
  return platformMeta(platform)?.buildUrl?.(platformId) ?? null;
}

// Whether the link is the real captured page rather than a reconstructed or search
// fallback, so the UI can hint that a fallback may need a click-through.
export function isDirectLink(platform: string, storedUrl?: string | null): boolean {
  return !!storedUrl || (platformMeta(platform)?.directLink ?? false);
}
