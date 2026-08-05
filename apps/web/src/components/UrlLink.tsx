import { ExternalLink } from "lucide-react";

// The host part of a URL, minus a leading www — a compact stand-in for a long link
// ("linkedin.com" rather than the full path). Falls back to the raw string when it
// doesn't parse as a URL.
function prettyHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// A discrete URL rendered as concise clickable text with an external-link icon,
// rather than the whole address. Defaults to the hostname; pass `label` for a
// friendlier name. To linkify URLs inside prose, use Linkify.
export function UrlLink({
  href,
  label,
  title,
  className = "",
}: {
  href: string;
  label?: string;
  title?: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title ?? href}
      className={`inline-flex max-w-full items-center gap-1 text-violet-600 hover:underline dark:text-violet-400 ${className}`}
    >
      <span className="truncate">{label ?? prettyHost(href)}</span>
      <ExternalLink size={12} className="shrink-0" />
    </a>
  );
}
