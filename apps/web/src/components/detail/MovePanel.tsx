import { useState } from "react";
import { formKeys } from "../../lib/forms";
import { type FunnelEvent } from "@job-tracker/shared/funnel";
import { StatusBadge } from "../StatusBadge";

interface Props {
  // The organic forward targets from the current status (pickableMoves).
  moves: FunnelEvent[];
  onMove: (to: FunnelEvent, note: string) => void;
  onCancel: () => void;
}

// Move — the everyday forward transition, carrying an optional note as event meta.
// Self-contained state so it resets each time it opens; the single `submit` closure
// is shared by the Move button and formKeys' Cmd+Enter (no twin handlers).
export function MovePanel({ moves, onMove, onCancel }: Props) {
  const [moveTo, setMoveTo] = useState<FunnelEvent | "">("");
  const [note, setNote] = useState("");

  const submit = () => {
    if (!moveTo) return;
    onMove(moveTo, note.trim());
  };

  return (
    <div
      className="flex flex-col gap-2 rounded border border-violet-500/30 bg-violet-500/5 p-3"
      onKeyDown={formKeys(submit, onCancel)}
    >
      <h3 className="text-xs uppercase tracking-wide text-violet-700 dark:text-violet-300/80">
        Move forward
      </h3>
      {/* Forward targets spread as one-tap pills — the panel is already open. Each
          target is a real StatusBadge, so a status looks the same here as it does on
          the card and in the drawer headline; selection is a ring around the badge
          rather than a second colour scheme competing with the status' own accent. */}
      <div className="flex flex-wrap gap-1.5">
        {moves.map((s) => (
          <button
            key={s}
            onClick={() => setMoveTo(s)}
            aria-pressed={moveTo === s}
            className={`rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
              moveTo === s
                ? "ring-2 ring-violet-500 ring-offset-1 ring-offset-canvas"
                : "opacity-75 hover:opacity-100"
            }`}
          >
            <StatusBadge status={s} size="md" />
          </button>
        ))}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label="Note about this move (optional)"
        placeholder="Note (optional)"
        className="rounded border border-line bg-surface px-2 py-1 text-xs text-ink"
      />
      <div className="flex gap-2">
        <button
          disabled={!moveTo}
          onClick={submit}
          className="rounded bg-violet-600 px-2 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          Move
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
