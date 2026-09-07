"use client";

import { useEffect, useRef } from "react";
import { toasts } from "@/components/dashboard/toaster";

/**
 * Confirms something that happened on the other side of a redirect.
 *
 * An action that finishes with `redirect()` has no client left to speak, so
 * it hands the outcome over in the URL and the destination says it. That is
 * what the original `?created=1` was for; nothing ever read it.
 *
 * The param is cleared once it has been spoken, so a reload or a shared link
 * does not repeat the news. replaceState rather than router.replace: this is
 * tidying the URL, not asking the server for anything.
 */
export function ToastOnArrival({
  message,
  param,
}: {
  message: string;
  param: string;
}) {
  const spoken = useRef(false);

  useEffect(() => {
    if (spoken.current) return;
    spoken.current = true;
    // Deferred: adding a toast sets state in the provider, and setting state
    // synchronously from an effect is what the lint rule here forbids.
    const queued = setTimeout(() => {
      toasts.success(message);
      const next = new URLSearchParams(window.location.search);
      next.delete(param);
      const query = next.toString();
      window.history.replaceState(
        null,
        "",
        query ? `?${query}` : window.location.pathname
      );
    }, 0);
    return () => clearTimeout(queued);
  }, [message, param]);

  return null;
}
