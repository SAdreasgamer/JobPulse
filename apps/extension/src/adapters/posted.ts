// Normalize posting dates at capture time so relative source text cannot drift:
//
//   meta.posted_at        UTC ISO instant, or null when the page has no evidence
//   meta.posted_precision "exact"     — a machine-readable date shipped by the page
//                         "estimated" — derived from a relative age
//                         null        — no posting date at all (never a guess)
//
// Adapters retain raw relative evidence separately. Shared time logic owns parsing.
import { parseRelativeAge, type PostedPrecision } from "@job-tracker/shared/time";

export interface PostedFields {
  at: string | null;
  precision: PostedPrecision | null;
}

/** Represent absent or unusable posting-date evidence. */
function unknown(): PostedFields {
  return { at: null, precision: null };
}

/** Normalize a trusted machine-readable posting date to UTC. */
export function postedFromExact(raw: string | null | undefined): PostedFields {
  if (!raw) return unknown();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? unknown() : { at: d.toISOString(), precision: "exact" };
}

/** A rendered relative age ("17 days ago"), anchored to the capture instant. */
export function postedFromRelative(
  raw: string | null | undefined,
  capturedAt: string,
): PostedFields {
  const parsed = raw ? parseRelativeAge(raw, capturedAt) : null;
  return parsed ? { at: parsed.at, precision: parsed.precision } : unknown();
}
