import { Fragment, type ReactNode } from "react";

// One uniform, muted, dot-separated line of metadata attributes — the single place
// the drawer decides how an attribute looks, so timeline events and documents present
// theirs identically instead of drifting into a mix of pills, chips, and colored
// text. Falsy items are dropped, so callers can pass conditionals inline. Semantic
// color lives on the item node itself, never on the line.
export function MetaLine({ items, className = "" }: { items: ReactNode[]; className?: string }) {
  const shown = items.filter(Boolean);
  if (shown.length === 0) return null;
  return (
    <div
      className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-micro text-ink-muted ${className}`}
    >
      {shown.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span aria-hidden className="text-ink-subtle">
              ·
            </span>
          )}
          <span>{item}</span>
        </Fragment>
      ))}
    </div>
  );
}
