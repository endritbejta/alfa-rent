"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Traps Tab inside an overlay and hands focus back when it closes.
 *
 * The drawer, confirm dialog and command palette are hand-rolled overlays —
 * without this, Tab walks straight out into the page underneath, and closing
 * drops keyboard users at the top of the document instead of on the row they
 * came from. (Known gap: HANDOFF.md cleanup item on DetailDrawer/Confirm.)
 *
 * On activate: remembers the opener, then moves focus to the first focusable
 * child unless something inside (an autofocused input, say) already has it.
 * On deactivate: returns focus to the opener if it still exists.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean
) {
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const opener = document.activeElement as HTMLElement | null;

    // Deferred so it runs after any autoFocus inside the overlay has landed.
    const claim = setTimeout(() => {
      if (node.contains(document.activeElement)) return;
      const first = node.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node).focus();
    }, 0);

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((el) => el.getClientRects().length > 0);
      if (items.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      const outside = !node.contains(current);

      if (event.shiftKey && (current === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };

    // Capture phase, so the trap sees Tab before anything inside stops it.
    document.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(claim);
      document.removeEventListener("keydown", onKey, true);
      if (opener?.isConnected) opener.focus();
    };
  }, [ref, active]);
}
