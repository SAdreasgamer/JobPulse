interface Props {
  // One sentence, stating what is absent in the user's words — "No documents yet."
  // Not a diagnosis ("query returned 0 rows") and not a paragraph.
  message: string;
  // The one thing to do about it. Optional: some sections are empty because
  // nothing has happened yet, and there is nothing to offer.
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyBlock({ message, action, className = "" }: Props) {
  return (
    <div
      className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded border border-dashed border-line px-3 py-2 text-prose text-ink-muted ${className}`}
    >
      <span>{message}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded font-medium text-violet-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-violet-400"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
