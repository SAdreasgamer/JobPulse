import { Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "./IconButton";
import { Tooltip } from "./Tooltip";

interface Props {
  // Section name, e.g. "Timeline". Rendered as the heading text; the count is
  // appended, never baked into this string.
  title: string;
  // Item count. Omitted (not `0`) when the section has nothing countable.
  count?: number;
  // The `+` add toggle. `noun` builds both labels — "Add note" when closed,
  // "Cancel adding note" when open — so no two sections can word them differently.
  add?: { noun: string; open: boolean; onToggle: () => void };
  // One sentence explaining what the section is, behind a `?`. For sections whose
  // meaning is not obvious from the title alone.
  help?: string;
  // Extra controls, right of the add toggle.
  children?: ReactNode;
  className?: string;
}

// The one section heading: title, count, optional `+`, optional `?`.
//
// Timeline, Documents, and Custom fields each hand-rolled this row with the same
// classes and Plus/X toggle, which is how their headings drifted apart in tone and
// wording. Centralising it also settles the heading level, the uppercase micro-label
// styling, and the AA-passing `ink-muted` tone once instead of per section.
export function SectionHeader({ title, count, add, help, children, className = "" }: Props) {
  return (
    <div className={`mb-2 flex items-center justify-between gap-2 ${className}`}>
      <div className="flex items-center gap-1">
        <h3 className="text-xs uppercase tracking-wide text-ink-muted">
          {title}
          {count === undefined ? "" : ` (${count})`}
        </h3>
        {help && (
          <Tooltip label={help}>
            <button
              type="button"
              aria-label={`About ${title}`}
              className="flex h-4 w-4 items-center justify-center rounded-full border border-line text-micro leading-none text-ink-muted transition-colors hover:border-line-strong hover:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              ?
            </button>
          </Tooltip>
        )}
      </div>
      <div className="flex items-center gap-1">
        {children}
        {add && (
          <IconButton
            size="sm"
            active={add.open}
            activeMeans="expanded"
            onClick={add.onToggle}
            label={add.open ? `Cancel adding ${add.noun}` : `Add ${add.noun}`}
            className={
              add.open
                ? "text-violet-600 dark:text-violet-300"
                : "text-ink-faint hover:text-ink-soft"
            }
          >
            {add.open ? <X size={15} /> : <Plus size={15} />}
          </IconButton>
        )}
      </div>
    </div>
  );
}
