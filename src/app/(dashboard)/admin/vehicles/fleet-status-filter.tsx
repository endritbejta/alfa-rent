"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { VehicleStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

/**
 * Availability as a segmented control, replacing both the Fleet size /
 * Available / Rented stat cards and the Availability row inside the filter
 * panel.
 *
 * Those were the same four numbers twice: a stat row that read as primary
 * content but did nothing, and a filter that did the work but showed no
 * counts. Merging them makes the count and the control one thing, and gives
 * the row back to the fleet itself.
 *
 * Client-side rather than links because the rest of the fleet filters push
 * with `scroll: false` — a plain <Link> would fling the operator back to the
 * top of the page on every filter change.
 */
const OPTIONS: { key: VehicleStatus; label: string; dot: string }[] = [
  { key: "AVAILABLE", label: "Free", dot: "bg-status-available" },
  { key: "RENTED", label: "Taken", dot: "bg-status-rented" },
  { key: "SERVICE", label: "In service", dot: "bg-status-maint" },
  { key: "INACTIVE", label: "Retired", dot: "bg-status-inactive" },
];

export function FleetStatusFilter({
  counts,
}: {
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get("status");

  // Whole-fleet figures from a groupBy, not the current page — the stat card
  // this replaces counted `items`, so "Fleet size" read 20 of 49 and came out
  // lower than "Available".
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  const select = (status: VehicleStatus | null) => {
    const next = new URLSearchParams(params.toString());
    if (status === null) next.delete("status");
    else next.set("status", status);
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `/admin/vehicles?${qs}` : "/admin/vehicles", {
      scroll: false,
    });
  };

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div
        role="group"
        aria-label="Filter by availability"
        className="bg-secondary inline-flex w-max rounded-full border p-0.5"
      >
        <Segment
          selected={!active}
          onSelect={() => select(null)}
          label="All"
          count={total}
        />
        {OPTIONS.map((option) => (
          <Segment
            key={option.key}
            selected={active === option.key}
            onSelect={() => select(option.key)}
            label={option.label}
            count={counts[option.key] ?? 0}
            dot={option.dot}
          />
        ))}
      </div>
    </div>
  );
}

function Segment({
  selected,
  onSelect,
  label,
  count,
  dot,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  count: number;
  dot?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
        selected
          ? "bg-card text-foreground shadow-xs"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />}
      {label}
      <span
        className={cn(
          "tabular-nums",
          selected ? "text-muted-foreground" : "text-muted-foreground/60"
        )}
      >
        {count}
      </span>
    </button>
  );
}
