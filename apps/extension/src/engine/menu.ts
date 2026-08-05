// ── Overflow menu (⋯) — rare, low-frequency card actions ─────────────────────
// Blocking a company is a once-per-company, permanent act, so it doesn't earn a
// permanent button next to the per-job toggles (status/star/hide). Instead a
// single quiet ⋯ opens a small menu housing it — a plain left-click affordance
// (no right-click, trackpad-friendly) and the natural home for future rare
// actions. Reuses the same outside-click / Escape dismissal as the match popover.
import type { Engine } from "./types.js";
import { ICON } from "../icons.js";

export function createMenu(engine: Engine) {
  let openMenu: HTMLElement | null = null;

  function closeOverflowMenu() {
    openMenu?.remove();
    openMenu = null;
    document.removeEventListener("click", onMenuOutsideClick, true);
    document.removeEventListener("keydown", onMenuKey, true);
  }

  function onMenuOutsideClick(e: MouseEvent) {
    const t = e.target as Element | null;
    if (t?.closest(".jh-menu") || t?.closest(".jh-btn-more")) return;
    closeOverflowMenu();
  }

  function onMenuKey(e: KeyboardEvent) {
    if (e.key === "Escape") closeOverflowMenu();
  }

  function openOverflowMenu(card: HTMLElement, btn: HTMLElement) {
    closeOverflowMenu();
    const company = (card.dataset.jobCompany || "").trim();
    const menu = document.createElement("div");
    menu.className = "jh-menu";

    // In the narrow list view the inline Open button is folded here to save the row.
    if (card.dataset.jhCompact === "1") {
      const id = card.dataset.jhId || "";
      const open = document.createElement("button");
      open.className = "jh-menu-item";
      open.innerHTML = ICON.open; // label appended as text so it can't inject HTML
      open.append("Open in dashboard");
      open.disabled = !id;
      open.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeOverflowMenu();
        engine.openDashboardJob(id);
      });
      menu.appendChild(open);
    }

    const block = document.createElement("button");
    block.className = "jh-menu-item";
    block.innerHTML = ICON.ban; // label text appended below so it can't inject HTML
    block.append(company ? `Block “${company}”` : "Block company");
    block.disabled = !company; // nothing to key a block on
    block.title = company
      ? `Stop capturing and showing ${company} everywhere (manage in the dashboard)`
      : "This card has no company to block";
    block.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeOverflowMenu();
      void engine.blockCardCompany(card);
    });
    menu.appendChild(block);

    document.body.appendChild(menu);
    // Fixed, clamped under the ⋯ and right-aligned to it (it sits at the end of the
    // bar), floating on the body like the match popover — the host's layout is
    // untrustworthy to nest inside.
    const r = btn.getBoundingClientRect();
    const width = 240;
    menu.style.top = `${Math.round(r.bottom + 6)}px`;
    menu.style.left = `${Math.max(8, Math.min(Math.round(r.right - width), window.innerWidth - width - 8))}px`;
    openMenu = menu;
    document.addEventListener("click", onMenuOutsideClick, true);
    document.addEventListener("keydown", onMenuKey, true);
  }

  function mkOverflowButton(card: HTMLElement) {
    const btn = engine.mkBtn("jh-btn-more", "⋯", "More");
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (openMenu) closeOverflowMenu();
      else openOverflowMenu(card, btn);
    });
    return btn;
  }

  return { mkOverflowButton };
}
