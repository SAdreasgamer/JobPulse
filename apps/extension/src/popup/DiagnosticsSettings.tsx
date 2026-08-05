import { useEffect, useState } from "react";
import {
  DIAGNOSTICS_DEFAULT,
  TEMPORARY_WINDOW_MS,
  type DiagnosticsScope,
  type DiagnosticsSettings as Settings,
  activeDiagnosticsScope,
  loadDiagnostics,
  saveDiagnostics,
} from "../engine/diagnostics.js";
import { BASE_URL, clearSearchLog } from "./api.js";
import { BUTTON, FOCUS } from "./ui";

// One scope selector controls full-context search logging. "30 minutes" is a
// self-expiring debugging session; "Always" persists until explicitly changed.

export function DiagnosticsSettings() {
  const [settings, setSettings] = useState<Settings>(DIAGNOSTICS_DEFAULT);
  const [cleared, setCleared] = useState("");

  useEffect(() => {
    loadDiagnostics(setSettings);
  }, []);

  useEffect(() => {
    if (settings.scope !== "temporary" || settings.expiresAt == null) return;
    const remaining = settings.expiresAt - Date.now();
    if (remaining <= 0) {
      saveDiagnostics(DIAGNOSTICS_DEFAULT, setSettings);
      return;
    }
    const timer = setTimeout(() => saveDiagnostics(DIAGNOSTICS_DEFAULT, setSettings), remaining);
    return () => clearTimeout(timer);
  }, [settings]);

  function commit(next: Settings) {
    setSettings(next);
    saveDiagnostics(next, setSettings);
  }

  function setScope(scope: DiagnosticsScope) {
    commit({
      scope,
      expiresAt: scope === "temporary" ? Date.now() + TEMPORARY_WINDOW_MS : null,
    });
  }

  function clear() {
    setCleared("Clearing…");
    clearSearchLog()
      .then(() => setCleared("Cleared."))
      .catch(() => setCleared(`Couldn't reach the tracker at ${BASE_URL}.`));
  }

  const scope = activeDiagnosticsScope(settings);

  return (
    <details className="mt-1 border-t border-popup-border-subtle pt-1.5">
      <summary className="cursor-pointer list-none py-1.5 text-[10px] font-semibold uppercase tracking-wider text-popup-faint marker:hidden before:mr-1.5 before:inline-block before:content-['▸'] open:before:rotate-90">
        Search diagnostics
      </summary>
      <div className="mt-1.5">
        <label className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-popup-fg">Capture search diagnostics</span>
          <select
            className={
              "rounded border border-popup-border bg-popup-surface px-1.5 py-1 text-xs " + FOCUS
            }
            value={scope}
            onChange={(e) => setScope(e.target.value as DiagnosticsScope)}
          >
            <option value="never">Never</option>
            <option value="temporary">30 minutes</option>
            <option value="always">Always</option>
          </select>
        </label>
        <p className="m-0 mt-1 text-[11px] leading-snug text-popup-faint">
          When active, stores the page host, automatic seed and rule, the seed's result count, any
          replacement query and its result count, and the opened job on your Job Tracker server.
        </p>

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            className={
              BUTTON +
              " px-2 py-0.5 text-[10px] hover:border-popup-accent hover:text-popup-accent " +
              FOCUS
            }
            onClick={clear}
            title="Delete the diagnostic rows stored on the server"
          >
            Clear stored data
          </button>
          {cleared && <span className="text-[11px] text-popup-faint">{cleared}</span>}
        </div>
      </div>
    </details>
  );
}
