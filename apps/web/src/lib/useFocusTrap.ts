import { useEffect, type RefObject } from "react";

// Modal focus management, shared by every dialog (the detail drawer, the
// shortcuts sheet): move focus into the container on open, keep Tab cycling
// inside it, close on Escape, and hand focus back to whatever opened it on close.
export function useFocusTrap(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  // Initial + restore focus. Runs once per mount so the "restore" target is the
  // element that was focused when the dialog opened (typically the trigger).
  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => restoreTo?.focus?.();
  }, [ref]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = ref.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ref, onClose]);
}

// The other half of "modal": while a dialog is open, the page behind it must not
// scroll. Without this, a wheel gesture aimed at the drawer's own scroller falls
// through to the board once the drawer hits its end, moving the background under a
// surface that claims to own the screen.
//
// The class goes on BOTH <html> and <body>. The board is `h-full` with no scroller of
// its own, so which element actually scrolls depends on how far the columns overflow,
// and locking one is a silent no-op if you guess wrong. Restoring removes only what
// this hook added, so nested or consecutive dialogs can't strand the page.
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    const targets = [document.documentElement, document.body];
    const added = targets.filter((el) => !el.classList.contains("overflow-hidden"));
    for (const el of added) el.classList.add("overflow-hidden");
    return () => {
      for (const el of added) el.classList.remove("overflow-hidden");
    };
  }, [active]);
}
