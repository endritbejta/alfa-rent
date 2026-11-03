"use client";

import { useEffect } from "react";

type NavigateEventLike = Event & {
  navigationType: "push" | "replace" | "reload" | "traverse";
  cancelable: boolean;
};

type NavigationLike = EventTarget & {
  addEventListener(
    type: "navigate",
    listener: (event: NavigateEventLike) => void
  ): void;
  removeEventListener(
    type: "navigate",
    listener: (event: NavigateEventLike) => void
  ): void;
};

/**
 * Asks before a form with unsaved edits is left behind.
 *
 * The vehicle form knew it was dirty — it says "Unsaved changes" and its own
 * Cancel asks first — yet the sidebar, the Back button and a reload all
 * dropped the edits without a word. Three exits, three mechanisms:
 *
 * - Reload, closing the tab, typing a URL: `beforeunload`. The browser
 *   writes the prompt itself; pages are no longer allowed to.
 * - An in-app link: Next navigates without unloading, so `beforeunload` never
 *   fires. A capture-phase click listener asks first, and a refusal stops
 *   the click before Link's own handler sees it.
 * - Back and Forward: also same-document. Where the Navigation API exists
 *   (Chromium) a traversal can be cancelled before it happens, so it is.
 *   Elsewhere there is no honest way to stop one — faking it by pushing
 *   dummy history entries breaks the router — so those browsers keep the
 *   other two guards and nothing pretends otherwise.
 */
export function useUnsavedChangesGuard(dirty: boolean, message: string) {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Still required by older Safari and Chrome to show the prompt.
      event.returnValue = "";
    };

    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const to = new URL(anchor.href, window.location.href);
      if (to.origin !== window.location.origin) return; // beforeunload asks
      const here = new URL(window.location.href);
      // An in-page anchor or this very URL does not leave the form.
      if (to.pathname === here.pathname && to.search === here.search) return;
      if (window.confirm(message)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    const navigation = (window as { navigation?: NavigationLike }).navigation;
    const onNavigate = (event: NavigateEventLike) => {
      if (event.navigationType !== "traverse" || !event.cancelable) return;
      if (!window.confirm(message)) event.preventDefault();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    navigation?.addEventListener("navigate", onNavigate);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      navigation?.removeEventListener("navigate", onNavigate);
    };
  }, [dirty, message]);
}
