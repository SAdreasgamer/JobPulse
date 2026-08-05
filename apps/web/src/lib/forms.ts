import type { KeyboardEvent } from "react";

// The one form-key rule across the app: Esc cancels, Cmd/Ctrl+Enter saves. Attach
// to a form's container so it fires from any field within. Cmd/Ctrl+Enter (not a
// bare Enter) so multi-line fields keep Enter for newlines. Esc stops propagation
// so cancelling a field edit inside the drawer doesn't also bubble up and close
// the drawer itself.
export function formKeys(onSave: (() => void) | undefined, onCancel: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSave?.();
    }
  };
}
