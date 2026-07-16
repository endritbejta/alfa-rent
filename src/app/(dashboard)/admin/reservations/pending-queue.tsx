"use client";

import { useEffect, useState } from "react";
import { BellRing, Columns2, Rows3 } from "lucide-react";
import {
  PendingRequestCard,
  type PendingRequest,
} from "./pending-request-card";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "alfa.pending.layout";
type Layout = "single" | "double";

/**
 * The queue that should be cleared before anything else. It carries its own
 * heading and tinted frame so it reads as the page's first priority rather
 * than one panel among many, and remembers the operator's column choice.
 */
export function PendingQueue({
  requests,
  compact = false,
}: {
  requests: PendingRequest[];
  /** Dashboard shows a trimmed version above the day's numbers. */
  compact?: boolean;
}) {
  // Default to one column: bigger cards, more detail, harder to skim past.
  const [layout, setLayout] = useState<Layout>("single");

  // Applied after hydration rather than in a lazy initializer: the server
  // always renders the default, so reading storage during the hydration
  // render would mismatch and be discarded.
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== "double") return;
    const timer = setTimeout(() => setLayout("double"), 0);
    return () => clearTimeout(timer);
  }, []);

  const choose = (next: Layout) => {
    setLayout(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  if (requests.length === 0) {
    if (compact) return null;
    return (
      <div className="bg-card rounded-2xl border border-dashed px-6 py-12 text-center">
        <p className="font-display text-lg font-bold">Nothing waiting</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Every request has been reviewed. Enjoy the quiet.
        </p>
      </div>
    );
  }

  return (
    <section
      className={cn(
        "border-brand/20 from-brand/[0.05] rounded-2xl border bg-gradient-to-b to-transparent p-4 sm:p-5",
        compact && "shadow-sm"
      )}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="bg-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white">
            <BellRing className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 className="font-display flex items-center gap-2 text-lg font-bold tracking-tight">
              Pending requests
              <span className="bg-brand rounded-full px-2 py-0.5 text-xs font-bold text-white tabular-nums">
                {requests.length}
              </span>
            </h2>
            <p className="text-muted-foreground text-xs">
              Process these first — customers are waiting on a decision
            </p>
          </div>
        </div>

        <div className="bg-card inline-flex rounded-full border p-0.5">
          {(
            [
              ["single", Rows3, "One column"],
              ["double", Columns2, "Two columns"],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              aria-label={label}
              aria-pressed={layout === key}
              onClick={() => choose(key)}
              className={cn(
                "cursor-pointer rounded-full p-1.5 transition-colors",
                layout === key
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      <div
        className={cn(
          "grid gap-3",
          layout === "double" ? "xl:grid-cols-2" : "grid-cols-1"
        )}
      >
        {requests.map((request) => (
          <PendingRequestCard
            key={request.id}
            request={request}
            emphasis={layout === "single"}
          />
        ))}
      </div>
    </section>
  );
}
