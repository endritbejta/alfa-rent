"use client";

import { LayoutGrid, List, Rows3 } from "lucide-react";
import { useI18n } from "@/components/shared/locale-provider";
import { cn } from "@/lib/utils";
import { useOptimisticParams } from "@/lib/use-optimistic-params";
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
  const { params, navigate, pending } = useOptimisticParams(basePath);
  // While the other view renders on the server, the tab just chosen is the
  // one shown pressed; the server's answer takes over when it lands.
  const requested = (params.get("view") ?? DEFAULT_VIEW) as View;
  const shown = pending && views.includes(requested) ? requested : active;

  const select = (view: View) => {
    const next = new URLSearchParams(params.toString());
    if (view === DEFAULT_VIEW) next.delete("view");
    else next.set("view", view);
    navigate(next);
  };

  return (
    <div className="mb-4 flex justify-end">
      <div className="inline-flex border-b">
        {views.map((view) => {
          const Icon = ICONS[view];
          return (
            <button
              key={view}
              type="button"
              aria-pressed={shown === view}
              onClick={() => select(view)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-xs font-semibold transition-colors",
                shown === view
                  ? "border-foreground text-foreground"
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
