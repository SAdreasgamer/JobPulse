import { useState } from "react";
import { formKeys } from "../../lib/forms";
import { correctionMoves, type Status } from "@job-tracker/shared/funnel";
import { StatusBadge } from "../StatusBadge";

interface Props {
  // The status we're correcting from — the backward/revival targets are derived
  // from it (the moves the funnel forbids; forward moves live in MovePanel, so the
  // two never overlap).
  status: Status;
  busy: boolean;
  onCorrect: (to: Status, reason: string) => void;
  onCancel: () => void;
}

// Correct — the deliberate override (bypasses funnel guards, logs a
// `corrected:<status>` row). Self-contained state resets on each open; the single
// `submit` closure is shared by the button and formKeys' Cmd+Enter.
export function CorrectPanel({ status, busy, onCorrect, onCancel }: Props) {
  const [correctTo, setCorrectTo] = useState<Status | "">("");
  const [reason, setReason] = useState("");
  const targets = correctionMoves(status);

  const submit = () => {
    if (!correctTo) return;
    onCorrect(correctTo, reason.trim());
  };

  return (
    <div
      className="flex flex-col gap-2 rounded border border-amber-500/30 bg-amber-500/5 p-3"
      onKeyDown={formKeys(submit, onCancel)}
    >
      {/* "The funnel" is a word from the codebase, not from the user's job hunt —
          the heading and the hint both say what this does in their words instead. */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300/80">
          Fix incorrect status
        </h3>
        <span className="text-micro text-ink-muted">any status, including backward</span>
      </div>
      {/* Same badge as everywhere else, selected by a ring — see MovePanel. */}
      <div className="flex flex-wrap gap-1.5">
        {targets.map((s) => (
          <button
            key={s}
            onClick={() => setCorrectTo(s)}
            aria-pressed={correctTo === s}
            className={`rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 ${
              correctTo === s
                ? "ring-2 ring-amber-500 ring-offset-1 ring-offset-canvas"
                : "opacity-75 hover:opacity-100"
            }`}
          >
            <StatusBadge status={s} size="md" />
          </button>
        ))}
        {targets.length === 0 && (
          <span className="text-xs text-ink-muted">Nothing to correct back to.</span>
        )}
      </div>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-label="Reason for the correction (optional)"
        placeholder="Reason (optional)"
        className="rounded border border-line bg-surface px-2 py-1 text-xs text-ink"
      />
      <div className="flex gap-2">
        <button
          disabled={!correctTo || busy}
          onClick={submit}
          className="rounded bg-amber-700 px-2 py-1 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-50"
        >
          Apply correction
        </button>
        <button
          onClick={onCancel}
          className="rounded px-2 py-1 text-xs text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
