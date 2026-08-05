import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Popup } from "./Popup";
import { applyTheme, THEME_KEY, type Theme } from "./theme.js";
import "./popup.css";

// The popup's React entry. Mounted into #root in index.html; the stylesheet is
// imported here so CRXJS/Vite bundle it with the popup chunk.
//
// Theme is applied BEFORE the first render, so an explicit light/dark override never
// flashes the system theme first. An extension page's CSP forbids the inline <head>
// script the web usually uses for this, so the stored choice is read from async
// chrome.storage and the mount deferred into its callback — a few ms on a tiny panel,
// so nothing visible. `system` clears the attribute and prefers-color-scheme paints it.
function mount() {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Popup />
    </StrictMode>,
  );
}

chrome.storage.local.get(THEME_KEY, (data) => {
  applyTheme((data[THEME_KEY] as Theme) || "system");
  mount();
});
