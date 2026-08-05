import { Fragment, type ReactNode } from "react";

// Split on http(s) URLs, keeping the URLs (capturing group) as their own segments.
const URL_SPLIT = /(https?:\/\/[^\s]+)/g;

function isUrl(s: string): boolean {
  return s.startsWith("http://") || s.startsWith("https://");
}

// Render text with any URL turned into a clickable link. The one place the drawer
// decides how an inline link looks, so listing fields, notes, document content, and
// custom-field values all linkify the same way. Plain text passes straight through.
export function Linkify({ text }: { text: string }): ReactNode {
  return text.split(URL_SPLIT).map((part, i) =>
    isUrl(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noreferrer"
        className="break-all text-violet-600 hover:underline dark:text-violet-400"
      >
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
