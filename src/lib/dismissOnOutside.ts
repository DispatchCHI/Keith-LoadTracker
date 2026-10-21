/**
 * 1.1.47: expanded station / specialty panels close on a click anywhere else
 * in the app, or Escape. Clicks inside the panel, or inside any dialog /
 * overlay it opened (confirm, edit, notes), never close it.
 */
import { useEffect, useRef, type RefObject } from "react";

export const KEEP_OPEN_SELECTOR =
  '[role="dialog"],[aria-modal="true"],.confirm-overlay,[data-keep-panel-open]';

type NodeLike = { closest?: (sel: string) => unknown } | null;

export function shouldDismissPanel(
  panel: { contains: (n: never) => boolean } | null,
  target: unknown,
): boolean {
  if (!panel || !target) return false;
  if (panel.contains(target as never)) return false;
  const el = target as NodeLike;
  if (el && typeof el.closest === "function" && el.closest(KEEP_OPEN_SELECTOR)) return false;
  return true;
}

export function useDismissOnOutside(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      // Detached node (row just re-rendered) is not a click outside.
      if (t && !t.isConnected) return;
      if (shouldDismissPanel(ref.current, t)) close.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"],[role="dialog"]')) return;
      close.current();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref]);
}
