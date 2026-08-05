import { useCallback, useEffect, useState } from "react";

// Light/dark theming. The resolved theme is a `.dark` class on <html>; a stored
// preference overrides the system setting, and `system` follows it live. The
// pre-paint script in index.html applies the same rule before React mounts, so
// there's no flash — this module just keeps it in sync as the user toggles.

export type ThemePref = "system" | "light" | "dark";

const KEY = "jt.theme";

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function resolveDark(pref: ThemePref): boolean {
  return pref === "dark" || (pref === "system" && systemPrefersDark());
}

function apply(pref: ThemePref): void {
  document.documentElement.classList.toggle("dark", resolveDark(pref));
}

function persist(pref: ThemePref): void {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // ignore write failures (private mode / disabled storage)
  }
}

// The cycle order for the header toggle: System → Light → Dark → System.
const NEXT: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };

export function useTheme(): { pref: ThemePref; cycle: () => void } {
  const [pref, setPref] = useState<ThemePref>(readThemePref);

  useEffect(() => {
    apply(pref);
    persist(pref);
  }, [pref]);

  // While following the system, re-apply when the OS preference flips.
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  // Stable identity so callers (the header toggle *and* the global `t` shortcut in
  // App) can list it in an effect's deps without re-subscribing every render.
  const cycle = useCallback(() => setPref((p) => NEXT[p]), []);
  return { pref, cycle };
}
