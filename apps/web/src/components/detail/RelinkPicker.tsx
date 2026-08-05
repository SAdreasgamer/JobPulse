import { useMemo, useState } from "react";
import type { JobSummary } from "@job-tracker/shared/api";
import { STATUS_ACCENT } from "@job-tracker/shared/funnel";
import { useJobMatches, useJobs } from "../../hooks";

interface Props {
  currentJobId: string;
  platform: string;
  platformId: string;
  matchTitle: string;
  matchCompany: string;
  dissolvesSource: boolean;
  onPick: (jobId: string) => void;
  onCancel: () => void;
}

// The relink target chooser: search the board's jobs and pick the one this listing
// really belongs to. Its own job is filtered out, relinking to itself being a no-op,
// and the list is capped so a long board stays a glance rather than a scroll.
// Relinking moves this listing's events and can dissolve the source job, so a pick is
// confirmed before it fires, never on a single click.
export function RelinkPicker({
  currentJobId,
  platform,
  platformId,
  matchTitle,
  matchCompany,
  dissolvesSource,
  onPick,
  onCancel,
}: Props) {
  const { data: jobs } = useJobs();
  // Likely reposts of this listing, sharing its normalized company+title. Floated to
  // the top so the most probable relink target is a click away.
  const { data: candidates } = useJobMatches(platform, platformId, matchTitle, matchCompany);
  const [q, setQ] = useState("");
  // The armed target: chosen from the list, awaiting a deliberate confirm.
  const [target, setTarget] = useState<JobSummary | null>(null);

  // Rank of each candidate job (0 = strongest); missing = not a duplicate.
  const candidateRank = useMemo(() => {
    const rank = new Map<string, number>();
    (candidates ?? []).forEach((c, i) => rank.set(c.job_id, i));
    return rank;
  }, [candidates]);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (
      (jobs ?? [])
        .filter((j) => j.id !== currentJobId)
        .filter(
          (j) =>
            !needle ||
            (j.title ?? "").toLowerCase().includes(needle) ||
            (j.company ?? "").toLowerCase().includes(needle),
        )
        // Duplicate candidates first, in the server's created_at-DESC order; the rest
        // keep the board's updated_at-DESC order. A stable sort preserves both.
        .sort((a, b) => {
          const ra = candidateRank.get(a.id);
          const rb = candidateRank.get(b.id);
          if (ra !== undefined && rb !== undefined) return ra - rb;
          if (ra !== undefined) return -1;
          if (rb !== undefined) return 1;
          return 0;
        })
        .slice(0, 8)
    );
  }, [jobs, q, currentJobId, candidateRank]);

  return (
    <div
      className="mt-1 flex flex-col gap-2 rounded border border-violet-500/30 bg-violet-500/5 p-2"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          if (target) setTarget(null);
          else onCancel();
        }
      }}
    >
      <h4 className="text-micro uppercase tracking-wide text-violet-700 dark:text-violet-300/80">
        Relink to job
      </h4>

      {target ? (
        // Confirm step — name the destination, warn if the source job dissolves.
        <div className="flex flex-col gap-2">
          <p className="text-xs text-ink-soft">
            Move this listing to{" "}
            <span className="font-medium text-ink">{target.title ?? "(untitled)"}</span>
            {target.company ? <span className="text-ink-muted"> · {target.company}</span> : null}?
          </p>
          <p className="text-micro text-ink-muted">
            Its events move with it.{" "}
            {dissolvesSource && (
              <span className="text-amber-700 dark:text-amber-400">
                This is the current job’s only listing, so that job will be removed.
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onPick(target.id)}
              className="rounded bg-violet-600 px-2 py-1 text-xs font-medium text-white hover:bg-violet-700"
            >
              Relink
            </button>
            <button
              onClick={() => setTarget(null)}
              className="rounded px-2 py-1 text-xs text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search jobs to relink this listing to"
            placeholder="Search title or company…"
            autoFocus
            className="rounded border border-line bg-surface px-2 py-1 text-xs text-ink"
          />
          <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
            {matches.map((j) => (
              <button
                key={j.id}
                onClick={() => setTarget(j)}
                className="flex items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-surface-hover"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_ACCENT[j.status].dot}`} />
                <span className="min-w-0 flex-1 truncate text-ink">{j.title ?? "(untitled)"}</span>
                {candidateRank.has(j.id) && (
                  <span className="shrink-0 rounded bg-violet-500/15 px-1 text-micro font-medium text-violet-700 dark:text-violet-300">
                    likely dup
                  </span>
                )}
                <span className="shrink-0 truncate text-ink-muted">{j.company ?? "—"}</span>
              </button>
            ))}
            {matches.length === 0 && (
              <span className="px-2 py-1 text-xs text-ink-muted">No other jobs match.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
