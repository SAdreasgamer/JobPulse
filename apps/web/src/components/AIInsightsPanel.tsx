/**
 * AIInsightsPanel — shows fit score, apply signal, and generates cover letters.
 *
 * Loaded lazily inside the DetailDrawer's "AI" tab. Fetches from:
 *   GET /api/ai/jobs/:id/fit-score
 *   GET /api/ai/jobs/:id/signal
 *   POST /api/ai/jobs/:id/cover-letter  (SSE streaming)
 */
import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, Copy, Check, AlertTriangle } from "lucide-react";

const API_BASE = "http://localhost:3456/api";

interface FitScore {
  score: number;
  matched_skills: string[];
  missing_skills: string[];
  rationale: string;
  confidence: string;
}

interface ApplySignal {
  recommendation: "apply" | "consider" | "skip";
  green_flags: string[];
  red_flags: string[];
  summary: string;
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
      <svg width="72" height="72" className="-rotate-90">
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-surface-raised"
        />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <span className="absolute text-lg font-bold" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

const REC_CONFIG = {
  apply: {
    label: "✅ Apply",
    cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
  consider: {
    label: "🤔 Consider",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  },
  skip: { label: "⛔ Skip", cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
};

export function AIInsightsPanel({ jobId }: { jobId: string }) {
  const [fitScore, setFitScore] = useState<FitScore | null>(null);
  const [signal, setSignal] = useState<ApplySignal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cover letter state
  const [coverLetter, setCoverLetter] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [copied, setCopied] = useState(false);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`${API_BASE}/ai/jobs/${jobId}/fit-score`).then((r) => r.json()),
      fetch(`${API_BASE}/ai/jobs/${jobId}/signal`).then((r) => r.json()),
    ])
      .then(([fs, sig]) => {
        setFitScore(fs as FitScore);
        setSignal(sig as ApplySignal);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [jobId]);

  async function generateCoverLetter() {
    setCoverLetter("");
    setStreaming(true);
    try {
      const resp = await fetch(`${API_BASE}/ai/jobs/${jobId}/cover-letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone: "professional", max_words: 300 }),
      });
      const reader = resp.body!.pipeThrough(new TextDecoderStream()).getReader();
      readerRef.current = reader;
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // SSE lines: "data: <chunk>\n\n"
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const chunk = line.slice(6);
          if (chunk === "[DONE]") {
            setStreaming(false);
            return;
          }
          setCoverLetter((prev) => prev + chunk.replace(/\\n/g, "\n"));
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setStreaming(false);
    }
  }

  function copyToClipboard() {
    void navigator.clipboard.writeText(coverLetter).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-ink-muted">
        <Loader2 size={16} className="animate-spin" />
        Asking phi3.5…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-red-600 dark:text-red-400">
        <AlertTriangle size={16} />
        {error.includes("Ollama") || error.includes("reach")
          ? "Ollama isn't running. Start it with: ollama serve"
          : error}
      </div>
    );
  }

  const rec = signal?.recommendation ?? "consider";
  const recCfg = REC_CONFIG[rec] ?? REC_CONFIG.consider;

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* ── Fit Score ─────────────────────────────────────────── */}
      {fitScore && (
        <section>
          <div className="flex items-center gap-3 mb-3">
            <Sparkles size={14} className="text-violet-500" />
            <h3 className="text-sm font-semibold text-ink">Fit Score</h3>
          </div>
          <div className="flex items-start gap-4">
            <ScoreRing score={fitScore.score} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-ink-muted mb-2">{fitScore.rationale}</p>
              {fitScore.matched_skills.length > 0 && (
                <div className="mb-1">
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">✓ </span>
                  <span className="text-xs text-ink-muted">
                    {fitScore.matched_skills.join(", ")}
                  </span>
                </div>
              )}
              {fitScore.missing_skills.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-red-500">✗ </span>
                  <span className="text-xs text-ink-muted">
                    {fitScore.missing_skills.join(", ")}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Apply Signal ──────────────────────────────────────── */}
      {signal && (
        <section>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-sm font-semibold text-ink">Should I Apply?</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${recCfg.cls}`}>
              {recCfg.label}
            </span>
          </div>
          <p className="text-xs text-ink-muted mb-2">{signal.summary}</p>
          <div className="grid grid-cols-2 gap-2">
            {signal.green_flags.length > 0 && (
              <ul className="text-xs space-y-0.5">
                {signal.green_flags.map((f) => (
                  <li key={f} className="text-green-600 dark:text-green-400">
                    ✓ {f}
                  </li>
                ))}
              </ul>
            )}
            {signal.red_flags.length > 0 && (
              <ul className="text-xs space-y-0.5">
                {signal.red_flags.map((f) => (
                  <li key={f} className="text-red-500">
                    ✗ {f}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* ── Cover Letter ──────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-ink">Cover Letter</h3>
          {coverLetter && (
            <button
              onClick={copyToClipboard}
              className="ml-auto flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied!" : "Copy"}
            </button>
          )}
        </div>
        {coverLetter ? (
          <textarea
            readOnly
            value={coverLetter}
            className="w-full h-48 text-xs font-mono p-3 rounded border border-line bg-surface resize-none text-ink"
          />
        ) : (
          <button
            onClick={generateCoverLetter}
            disabled={streaming}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {streaming ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {streaming ? "Generating…" : "Generate Cover Letter"}
          </button>
        )}
        {streaming && (
          <div className="mt-2 text-xs text-ink-muted font-mono whitespace-pre-wrap">
            {coverLetter}
            <span className="inline-block w-1.5 h-3 bg-violet-500 animate-pulse ml-0.5" />
          </div>
        )}
      </section>
    </div>
  );
}
