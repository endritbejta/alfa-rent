"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { VehicleCategory } from "@prisma/client";
import { SlidersHorizontal, X } from "lucide-react";
import { useI18n } from "@/components/shared/locale-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

/**
 * Fleet filters. The URL is the source of truth — a filtered view is
 * shareable, survives a refresh, and lets a notification hand the operator
 * a pre-filtered page instead of a search box.
 */
/**
 * Availability is not here: it is the segmented control above the fleet,
 * where the counts live. Two controls for one parameter meant the operator
 * could see it set in one place and clear it in another.
 */
const GROUPS = [
  {
    param: "registration",
    label: "admin.registration",
    options: [
      { key: "valid", label: "admin.registered", dot: "bg-status-available" },
      { key: "due", label: "admin.expiringSoon", dot: "bg-status-maint" },
      { key: "expired", label: "admin.expired", dot: "bg-destructive" },
      { key: "missing", label: "admin.notRecorded", dot: "bg-status-inactive" },
    ],
  },
] as const;

const FILTER_LABELS: Record<string, TranslationKey> = {
  brand: "admin.brand",
  category: "admin.category",
  registration: "admin.registration",
};

const VALUE_LABELS: Record<string, TranslationKey> = {
  valid: "admin.registered",
  due: "admin.expiringSoon",
  expired: "admin.expired",
  missing: "admin.notRecorded",
};

/**
 * No "status": the segmented control above shows what it is set to and can
 * clear it, so a chip here would be the same state a second time.
 */
const KEYS = ["brand", "category", "registration"] as const;

export function VehicleFilters({
  brands,
  total,
}: {
  brands: string[];
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useI18n();

  const apply = (next: URLSearchParams) => {
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `/admin/vehicles?${qs}` : "/admin/vehicles", {
      scroll: false,
    });
  };

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    // Clicking the active option clears it — no redundant "All" control.
    if (value === null || next.get(key) === value) next.delete(key);
    else next.set(key, value);
    apply(next);
  };

  const active = KEYS.filter((k) => params.get(k)).map((k) => ({
    key: k,
    value: params.get(k) as string,
  }));

  return (
    <section
      id="fleet"
      className="bg-card scroll-mt-6 overflow-hidden rounded-xl border shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="font-display flex items-center gap-2 text-sm font-bold">
          <SlidersHorizontal className="text-brand h-4 w-4" />
          {t("admin.filterFleet")}
        </h2>
        <p className="text-muted-foreground text-xs tabular-nums">
          {t("admin.fleetShown", { count: total })}
        </p>
      </div>

      <div className="grid gap-x-6 gap-y-4 p-4 lg:grid-cols-2">
        <Group label={t("admin.brand")}>
          <select
            className={selectClass}
            value={params.get("brand") ?? ""}
            onChange={(e) => set("brand", e.target.value || null)}
          >
            <option value="">{t("admin.allBrands")}</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Group>

        <Group label={t("admin.category")}>
          <select
            className={selectClass}
            value={params.get("category") ?? ""}
            onChange={(e) => set("category", e.target.value || null)}
          >
            <option value="">{t("admin.allCategories")}</option>
            {Object.values(VehicleCategory).map((c) => (
              <option key={c} value={c}>
                {t(
                  `filter.${c.toLowerCase()}` as
                    | "filter.economy"
                    | "filter.compact"
                    | "filter.sedan"
                    | "filter.suv"
                    | "filter.luxury"
                    | "filter.van"
                )}
              </option>
            ))}
          </select>
        </Group>

        {GROUPS.map((group) => (
          <Group key={group.param} label={t(group.label)}>
            <div className="flex flex-wrap gap-1.5">
              {group.options.map((option) => {
                const isActive = params.get(group.param) === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => set(group.param, option.key)}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-[background-color,border-color,color] duration-[var(--motion-hover)]",
                      isActive
                        ? "border-foreground bg-foreground text-background font-semibold"
                        : "bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        option.dot,
                        isActive && "ring-background/40 ring-2"
                      )}
                    />
                    {t(option.label)}
                  </button>
                );
              })}
            </div>
          </Group>
        ))}
      </div>

      {active.length > 0 && (
        <div className="bg-secondary/50 flex flex-wrap items-center gap-2 border-t px-4 py-3">
          <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.1em] uppercase">
            {t("admin.activeFilters")}
          </span>
          {active.map(({ key, value }) => (
            <button
              key={key}
              type="button"
              onClick={() => set(key, null)}
              className="bg-card hover:border-destructive/40 hover:text-destructive group flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            >
              <span className="text-muted-foreground group-hover:text-destructive/70">
                {t(FILTER_LABELS[key])}:
              </span>
              {(VALUE_LABELS[value] && t(VALUE_LABELS[value])) ??
                value.charAt(0) + value.slice(1).toLowerCase()}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => router.push("/admin/vehicles", { scroll: false })}
            className="text-muted-foreground hover:text-foreground ml-auto cursor-pointer text-xs font-semibold transition-colors"
          >
            {t("admin.clearAll")}
          </button>
        </div>
      )}
    </section>
  );
}

const selectClass =
  "border-input bg-control focus:ring-ring h-9 w-full cursor-pointer rounded-lg border px-3 text-sm outline-none transition-colors focus:ring-2";

/**
 * A <label> wrapping the control, not a <p> beside it.
 *
 * These two selects — brand and category — were the only unlabelled controls
 * left in the app: the caption was a paragraph, so a screen reader announced
 * "combo box" with no hint of what it filtered. Wrapping associates the two
 * without either of them needing an id, and the ids would have had to be
 * unique across a page that already renders this panel more than once.
 */
function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-muted-foreground mb-2 block text-[10px] font-semibold tracking-[0.1em] uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
