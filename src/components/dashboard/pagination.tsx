"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/shared/locale-provider";

/**
 * URL-driven pagination shared by admin lists. Page lives in the query so
 * a page of results is linkable and survives a refresh, and every filter
 * already in the URL is carried along untouched.
 */
export function Pagination({
  page,
  totalPages,
  total,
  perPage,
  basePath,
  label = "items",
}: {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  basePath: string;
  label?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();

  if (totalPages <= 1) return null;

  const go = (next: number) => {
    const query = new URLSearchParams(params.toString());
    // Page 1 is the default — keep it out of the URL.
    if (next <= 1) query.delete("page");
    else query.set("page", String(next));
    const qs = query.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
  };

  const first = (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-muted-foreground text-xs tabular-nums">
        <span className="text-foreground font-semibold">
          {first}-{last}
        </span>{" "}
        of {total} {label}
      </p>

      <div className="flex items-center gap-1">
        <Arrow
          direction="prev"
          label={t("common.previous")}
          disabled={page <= 1}
          onClick={() => go(page - 1)}
        />
        {pageWindow(page, totalPages).map((entry, i) =>
          entry === "gap" ? (
            <span
              key={`gap-${i}`}
              className="text-muted-foreground px-1 text-xs"
            >
              &hellip;
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              aria-current={entry === page ? "page" : undefined}
              onClick={() => go(entry)}
              className={cn(
                "h-8 min-w-8 cursor-pointer rounded-lg border px-2 text-xs font-semibold tabular-nums transition-colors",
                entry === page
                  ? "border-foreground bg-foreground text-background"
                  : "bg-card text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              )}
            >
              {entry}
            </button>
          )
        )}
        <Arrow
          direction="next"
          label={t("common.next")}
          disabled={page >= totalPages}
          onClick={() => go(page + 1)}
        />
      </div>
    </nav>
  );
}

function Arrow({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="bg-card text-muted-foreground hover:bg-surface-hover hover:text-foreground disabled:border-border disabled:bg-skeleton disabled:text-muted-foreground h-8 cursor-pointer rounded-lg border px-2 transition-colors disabled:cursor-not-allowed"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/** First, last, and a window around the current page — gaps collapse. */
function pageWindow(page: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, totalPages, page]);
  if (page - 1 > 1) pages.add(page - 1);
  if (page + 1 < totalPages) pages.add(page + 1);

  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}
