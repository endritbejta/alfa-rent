"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List, Rows3 } from "lucide-react";
import { useI18n } from "@/components/shared/locale-provider";
import { cn } from "@/lib/utils";
import { DEFAULT_VIEW, VIEWS, type View } from "@/components/dashboard/view";

const ICONS = { grid: LayoutGrid, list: List, compact: Rows3 } as const;
const LABELS = {
  grid: "admin.grid",
  list: "admin.list",
  compact: "admin.compact",
} as const;

/**
 * Which view a list is in, in the URL rather than in React state.
 *
 * The three views used to be passed in as fully rendered slots and toggled
 * client-side, so every fleet render shipped twenty-four vehicles three times
 * over and only one of them was ever shown. Now the server renders the one
 * that was asked for. The choice also survives a reload and can be sent to
 * someone, which the local state could not do.
 *
 * router.push, not the History API: unlike the detail drawer, the markup for
 * the other view only exists on the server.
 */
export function ViewSwitcher({
  active,
  basePath,
  views = VIEWS,
}: {
  active: View;
  basePath: string;
  views?: readonly View[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();

  const select = (view: View) => {
    const next = new URLSearchParams(params.toString());
    if (view === DEFAULT_VIEW) next.delete("view");
    else next.set("view", view);
    const query = next.toString();
    router.push(query ? `${basePath}?${query}` : basePath, { scroll: false });
  };

  return (
    <div className="mb-4 flex justify-end">
      <div className="bg-secondary inline-flex rounded-full border p-0.5">
        {views.map((view) => {
          const Icon = ICONS[view];
          return (
            <button
              key={view}
              type="button"
              aria-pressed={active === view}
              onClick={() => select(view)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                active === view
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t(LABELS[view])}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
