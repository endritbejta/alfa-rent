"use client";

import { useEffect, useState } from "react";
import { BellRing, CalendarX, Columns2, Rows3 } from "lucide-react";
import {
  PendingRequestCard,
  type PendingRequest,
} from "./pending-request-card";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/shared/locale-provider";

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
  const { t } = useI18n();
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

  // The server orders actionable requests first, so splitting keeps order.
  const waiting = requests.filter((request) => !request.expired);
  const expired = requests.filter((request) => request.expired);

  const grid = (items: PendingRequest[]) => (
    <div
      className={cn(
        "grid gap-3",
        layout === "double" ? "xl:grid-cols-2" : "grid-cols-1"
      )}
    >
      {items.map((request) => (
        <PendingRequestCard
          key={request.id}
          request={request}
          emphasis={layout === "single"}
        />
      ))}
    </div>
  );

  // Expired requests are listed apart, after the real work: their pickup day
  // has passed, so staff can only cancel them.
  const expiredSection = expired.length > 0 && (
    <section aria-labelledby="expired-requests" className="mt-8 border-t pt-4">
      <div className="mb-4 flex items-center gap-3">
        <span className="bg-secondary text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-none">
          <CalendarX className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2
            id="expired-requests"
            className="font-display flex items-center gap-2 text-lg font-bold tracking-tight"
          >
            {t("admin.expiredRequests")}
            <span className="bg-secondary text-muted-foreground rounded-none px-2 py-0.5 text-xs font-bold tabular-nums">
              {expired.length}
            </span>
          </h2>
          <p className="text-muted-foreground text-xs">
            {t("admin.expiredRequestsHint")}
          </p>
        </div>
      </div>
      {grid(expired)}
    </section>
  );

  if (waiting.length === 0) {
    if (compact) return null;
    return (
      <>
        <div className="border-y px-6 py-14 text-center">
          <p className="font-display text-lg font-bold">
            {t("admin.nothingWaiting")}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("admin.queueEmpty")}
          </p>
        </div>
        {expiredSection}
      </>
    );
  }

  return (
    <section className={cn("border-brand/40 border-t-2 pt-4", compact && "")}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="bg-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-none text-white">
            <BellRing className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 className="font-display flex items-center gap-2 text-lg font-bold tracking-tight">
              {t("admin.pendingRequests")}
              <span className="bg-brand rounded-none px-2 py-0.5 text-xs font-bold text-white tabular-nums">
                {waiting.length}
              </span>
            </h2>
            <p className="text-muted-foreground text-xs">
              {t("admin.processFirst")}
            </p>
          </div>
        </div>

        <div className="inline-flex rounded-none border p-0.5">
          {(
            [
              ["single", Rows3, t("admin.oneColumn")],
              ["double", Columns2, t("admin.twoColumns")],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              aria-label={label}
              aria-pressed={layout === key}
              onClick={() => choose(key)}
              className={cn(
                "cursor-pointer rounded-none p-1.5 transition-colors",
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

      {grid(waiting)}
      {expiredSection}
    </section>
  );
}
