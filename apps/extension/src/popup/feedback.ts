import { useCallback, useEffect, useRef, useState } from "react";

// Action feedback, split by kind so the common success path is near-silent:
//  • showOk() — a ✓ badge flashing in the corner. Fixed-position, so it never reflows
//    the view or covers the job text; the new status is already visible in the
//    row/detail, so a sentence would be noise on a repetitive task.
//  • showError() — a text pill. A failure needs words ("is the tracker running?").
// Returns the two transient booleans driving `.show` plus the trigger callbacks.
// Timers are cleared on unmount so a flash can't outlive the popup.
export interface Feedback {
  ok: boolean;
  toast: string;
  showOk: () => void;
  showError: (text: string) => void;
}

export function useFeedback(): Feedback {
  const [ok, setOk] = useState(false);
  const [toast, setToast] = useState("");
  const okTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showOk = useCallback(() => {
    setOk(true);
    clearTimeout(okTimer.current);
    okTimer.current = setTimeout(() => setOk(false), 1200);
  }, []);

  const showError = useCallback((text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  useEffect(
    () => () => {
      clearTimeout(okTimer.current);
      clearTimeout(toastTimer.current);
    },
    [],
  );

  return { ok, toast, showOk, showError };
}
