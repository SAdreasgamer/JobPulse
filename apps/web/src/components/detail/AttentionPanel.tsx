import type { Attention } from "@job-tracker/shared/api";
import { fmtDate } from "@job-tracker/shared/time";
import { InlineConfirm } from "../InlineConfirm";

interface Props {
  attention: Attention;
  onAddNote: () => void;
  onMarkGhosted: () => void;
}

export function AttentionPanel({ attention, onAddNote, onMarkGhosted }: Props) {
  return (
    <div className="flex flex-col gap-2 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
      <div>
        <div className="font-semibold text-amber-800 dark:text-amber-200">Needs attention</div>
        <div className="mt-0.5 text-amber-800/80 dark:text-amber-200/80">
          No recorded activity since {fmtDate(attention.since)}.
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onAddNote}
          className="font-medium text-amber-800 hover:text-amber-950 dark:text-amber-200 dark:hover:text-white"
        >
          Add note
        </button>
        <InlineConfirm
          trigger="Mark ghosted"
          confirmLabel="Mark this job ghosted?"
          actionLabel="Mark ghosted"
          onConfirm={onMarkGhosted}
          className="text-amber-800 hover:text-red-700 dark:text-amber-200 dark:hover:text-red-300"
        />
      </div>
    </div>
  );
}
