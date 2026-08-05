import { useEffect, useState } from "react";
import { ICON } from "../icons.js";
import { cycleTheme, THEME_KEY, type Theme } from "./theme.js";
import { ACTION_BUTTON, ICON as ICON_CLASS } from "./ui";

// Theme control — the value side of the "Theme" row in the settings panel. Shows the
// current choice as an icon + word (monitor / System, sun / Light, moon / Dark) and
// cycles system → light → dark on click. `applyTheme` stamps <html> live;
// chrome.storage persists it for the next open.
const FACE: Record<Theme, { icon: string; text: string }> = {
  system: { icon: ICON.monitor, text: "System" },
  light: { icon: ICON.sun, text: "Light" },
  dark: { icon: ICON.moon, text: "Dark" },
};

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  // Read the stored choice, then track later changes through storage. That covers both
  // our own click and the `t` shortcut cycling the theme while this panel is open, so
  // the face never goes stale.
  useEffect(() => {
    chrome.storage.local.get(THEME_KEY, (data) => {
      setTheme((data[THEME_KEY] as Theme) || "system");
    });
    const onChanged = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === "local" && changes[THEME_KEY]) {
        setTheme((changes[THEME_KEY].newValue as Theme) || "system");
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const f = FACE[theme];
  return (
    <button
      className={ACTION_BUTTON}
      title="Theme: system follows your OS. Click to cycle system → light → dark."
      aria-label={`Theme: ${f.text}. Click to change.`}
      onClick={cycleTheme}
    >
      <span className={ICON_CLASS} dangerouslySetInnerHTML={{ __html: f.icon }} />
      {f.text}
    </button>
  );
}
