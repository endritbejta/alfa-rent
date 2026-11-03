"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const noSubscription = () => () => {};

function isApple(): boolean {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform = nav.userAgentData?.platform ?? nav.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/**
 * A keyboard shortcut, printed the way this keyboard prints it: ⌘ K on a
 * Mac, Ctrl K everywhere else. `mod` stands for whichever applies.
 *
 * Shown only with a fine pointer — a phone has no keyboard to be reminded
 * of — and only after hydration, since the server cannot know which keyboard
 * is on the other end. Hidden from assistive technology: the control it sits
 * on carries `aria-keyshortcuts`, which is the accessible way to say this.
 */
export function ShortcutHint({
  keys,
  className,
}: {
  keys: string[];
  className?: string;
}) {
  const apple = useSyncExternalStore(noSubscription, isApple, () => null);
  if (apple === null) return null;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "hidden shrink-0 items-center gap-0.5 pointer-fine:inline-flex",
        className
      )}
    >
      {keys.map((key) => (
        <kbd
          key={key}
          className="min-w-5 rounded-none border border-current/25 px-1 text-center font-sans text-[10px] leading-4 font-medium"
        >
          {key === "mod" ? (apple ? "⌘" : "Ctrl") : key}
        </kbd>
      ))}
    </span>
  );
}
