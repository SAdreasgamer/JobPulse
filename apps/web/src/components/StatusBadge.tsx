import { STATUS_ACCENT, labelOf } from "@job-tracker/shared/funnel";
import type { Status } from "@job-tracker/shared/funnel";

// Padding/type per size. `sm` is the in-card chip that sits beside the platform
// chips; `md` is the drawer's headline pill. Nothing else exists on purpose — a
// status has two legitimate weights in this app, not five.
const SIZE = {
  sm: "px-1.5 py-0.5 text-micro",
  md: "px-2 py-0.5 text-xs",
} as const;

// Neutral fallback for a status outside the funnel vocabulary (the extension's
// "untracked" pseudo-status, or anything a future server adds before the client
// knows it). It still renders as a badge rather than crashing or vanishing.
const UNKNOWN = { bg: "bg-slate-500/15", text: "text-ink-soft" };

interface Props {
  status: string;
  size?: keyof typeof SIZE;
  className?: string;
}

export function StatusBadge({ status, size = "sm", className = "" }: Props) {
  const accent = STATUS_ACCENT[status as Status] ?? UNKNOWN;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded font-medium ${SIZE[size]} ${accent.bg} ${accent.text} ${className}`}
    >
      {labelOf(status)}
    </span>
  );
}
