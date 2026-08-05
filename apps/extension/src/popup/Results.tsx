import { JobFunnel } from "@job-tracker/shared/funnel";
import type { PopupJob } from "./types";

// The search-results list. Rows are buttons so they're keyboard-reachable, and the
// ↑/↓ highlight (`.sel`) is painted from `selIndex` rather than focus, since the
// search box keeps focus so typing keeps refining the query. A row's subtitle is
// company + status label, re-rendered from state, so a status changed in the detail
// view is current the moment you come Back.
export function Results({
  jobs,
  selIndex,
  onPick,
}: {
  jobs: PopupJob[];
  selIndex: number;
  onPick: (job: PopupJob) => void;
}) {
  return (
    <div id="results" className="mt-2 flex max-h-[340px] flex-col gap-1 overflow-y-auto empty:mt-0">
      {jobs.map((job, i) => (
        <button
          key={job.id}
          className={
            i === selIndex
              ? "result cursor-pointer rounded-md border border-popup-selection-border bg-popup-selection px-2.5 py-2 text-left text-popup-fg"
              : "result cursor-pointer rounded-md border border-popup-border-subtle bg-popup-raised px-2.5 py-2 text-left text-popup-fg transition-colors hover:bg-popup-hover"
          }
          onClick={() => onPick(job)}
        >
          <div className="text-[13px] font-semibold">{job.title || "(untitled)"}</div>
          <div className="mt-0.5 text-xs text-popup-soft">
            {(job.company || "—") + " · " + JobFunnel.labelOf(job.status)}
          </div>
        </button>
      ))}
    </div>
  );
}
