import type { ReactNode } from "react";
import { useState } from "react";

interface Props {
  // The muted trigger (e.g. "Delete job", or a trash icon). Stays quiet until clicked.
  trigger: ReactNode;
  // Accessible name for the trigger when it's a bare icon (no text of its own).
  triggerLabel?: string;
  // Shown once armed, before the destructive step is taken.
  confirmLabel?: string;
  actionLabel?: string;
  onConfirm: () => void;
  className?: string;
}

// A two-step, no-modal confirm for rare destructive actions. A subtle trigger reveals
// an inline "confirmLabel · Delete / Cancel" when clicked, so the action never fires
// on a stray click and nothing draws the eye until deliberately armed.
export function InlineConfirm({
  trigger,
  triggerLabel,
  confirmLabel = "Sure?",
  actionLabel = "Delete",
  onConfirm,
  className,
}: Props) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        onClick={() => setArmed(true)}
        title={triggerLabel}
        aria-label={triggerLabel}
        // Minimum hit area meets WCAG 2.2 §2.5.8 and grows for coarse pointers.
        className={`inline-flex min-h-6 min-w-6 items-center justify-center rounded text-xs text-ink-muted hover:text-red-600 dark:hover:text-red-400 pointer-coarse:min-h-9 pointer-coarse:min-w-9 ${className ?? ""}`}
      >
        {trigger}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="text-ink-muted">{confirmLabel}</span>
      <button
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
        className="font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
      >
        {actionLabel}
      </button>
      <button onClick={() => setArmed(false)} className="text-ink-muted hover:text-ink-soft">
        Cancel
      </button>
    </span>
  );
}
