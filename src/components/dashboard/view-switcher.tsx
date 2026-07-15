"use client";

import { useState } from "react";
import { LayoutGrid, List, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Server-rendered views passed in as slots; the client only toggles
 * visibility — no serialization of Prisma rows across the boundary.
 */
export function ViewSwitcher({
  grid,
  list,
  compact,
}: {
  grid: React.ReactNode;
  list: React.ReactNode;
  compact?: React.ReactNode;
}) {
  const [view, setView] = useState<"grid" | "list" | "compact">("grid");
  const options = [
    { key: "grid" as const, icon: LayoutGrid, label: "Grid" },
    { key: "list" as const, icon: List, label: "List" },
    ...(compact
      ? [{ key: "compact" as const, icon: Rows3, label: "Compact" }]
      : []),
  ];

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <div className="bg-secondary inline-flex rounded-full border p-0.5">
          {options.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                view === key
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>
      {view === "grid" && grid}
      {view === "list" && list}
      {view === "compact" && compact}
    </div>
  );
}
