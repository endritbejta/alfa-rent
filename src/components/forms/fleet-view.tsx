"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/shared/locale-provider";

/** Square-cornered layout glyphs: n equal columns inside a sharp frame. */
function ColumnsIcon({ count }: { count: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      aria-hidden="true"
    >
      <rect x="1.5" y="2.5" width="13" height="11" />
      {Array.from({ length: count - 1 }, (_, i) => {
        const x = 1.5 + (13 / count) * (i + 1);
        return <line key={i} x1={x} y1="2.5" x2={x} y2="13.5" />;
      })}
    </svg>
  );
}

type View = "one" | "two" | "three";
const STORAGE_KEY = "alfa-fleet-view";

/*
 * Styling for the column switch's view transition, served as a static file
 * (public/fleet-view-transition.css) and hoisted into <head> by React.
 *
 * Not from globals.css, because Turbopack's CSS pass drops ::view-transition
 * rules (Tailwind's own output keeps them); a file in public/ never goes
 * through that pass. And not an inline <style>, as it used to be: the CSP
 * only admits <style> elements carrying the nonce, and React does not stamp
 * Next's nonce on hoisted styles, so the inline one was reported (and would
 * be blocked once the policy is enforced). A same-origin stylesheet is
 * allowed by `style-src-elem 'self'` without one.
 */
const VIEW_TRANSITION_STYLESHEET = "/fleet-view-transition.css";

/**
 * Results toolbar plus list. The cards are server-rendered and arrive as
 * children; the layout switches through a `data-view` attribute that the
 * card styles key off, so changing view never refetches anything. The choice
 * is a per-viewer convenience, remembered in localStorage when available.
 */
export function FleetView({
  summary,
  sort,
  children,
}: {
  summary: React.ReactNode;
  sort?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<View>("two");

  useEffect(() => {
    // Deferred: the lint rules forbid synchronous setState in an effect.
    const id = setTimeout(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === "one" || saved === "two" || saved === "three")
          setView(saved);
      } catch {}
    }, 0);
    return () => clearTimeout(id);
  }, []);

  /*
   * The cards rearrange instead of jumping: each is named after its vehicle
   * (VehicleCard), so the View Transitions API carries it from its old place
   * to its new one and the eye can follow a car across the switch. Same page,
   * same cars, so a move rather than a slide or a fade. Where the API is
   * missing, or reduced motion is asked for, the layout simply changes, as
   * it always did.
   */
  const choose = (next: View) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    const animate =
      typeof document.startViewTransition === "function" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animate) {
      setView(next);
      return;
    }
    document.startViewTransition(() => {
      flushSync(() => setView(next));
    });
  };

  const options = [
    { value: "one", label: t("fleet.viewOne"), count: 1 },
    { value: "two", label: t("fleet.viewTwo"), count: 2 },
    { value: "three", label: t("fleet.viewThree"), count: 3 },
  ] as const;

  return (
    <div data-view={view} className="group/fleet">
      <link
        rel="stylesheet"
        href={VIEW_TRANSITION_STYLESHEET}
        precedence="default"
      />
      <div className="mt-4 mb-6 hidden flex-wrap items-center justify-between gap-3 border-b pb-4 md:flex">
        {summary}
        <div className="flex items-center gap-3">
          {sort}
          <div
            role="group"
            aria-label={t("fleet.view")}
            className="hidden border-b md:inline-flex"
          >
            {options.map(({ value, label, count }) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                aria-label={label}
                title={label}
                onClick={() => choose(value)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center border-b-2 border-transparent transition-colors",
                  view === value
                    ? "border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ColumnsIcon count={count} />
              </button>
            ))}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
