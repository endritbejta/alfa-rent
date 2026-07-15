"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { VehicleCategory, Transmission } from "@prisma/client";
import { cn } from "@/lib/utils";

/**
 * Filters write to the URL, the server component reads them — the URL
 * is the single source of truth, so filtered views are shareable.
 */
export function FleetFilters() {
  const router = useRouter();
  const params = useSearchParams();

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value === null || next.get(key) === value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    next.delete("page");
    router.push(`/car?${next.toString()}`, { scroll: false });
  };

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-4 py-1.5 text-sm transition-colors",
      active
        ? "border-transparent bg-foreground text-background font-semibold"
        : "bg-card text-muted-foreground hover:text-foreground"
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground mr-1 w-24 text-xs font-semibold tracking-[0.12em] uppercase">
          Category
        </span>
        <button
          type="button"
          className={chip(!params.get("category"))}
          onClick={() => set("category", null)}
        >
          All
        </button>
        {Object.values(VehicleCategory).map((c) => (
          <button
            key={c}
            type="button"
            className={chip(params.get("category") === c)}
            onClick={() => set("category", c)}
          >
            {c.charAt(0) + c.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground mr-1 w-24 text-xs font-semibold tracking-[0.12em] uppercase">
          Gearbox
        </span>
        {Object.values(Transmission).map((t) => (
          <button
            key={t}
            type="button"
            className={chip(params.get("transmission") === t)}
            onClick={() => set("transmission", t)}
          >
            {t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground mr-1 w-24 text-xs font-semibold tracking-[0.12em] uppercase">
          Budget
        </span>
        {[40, 60, 100].map((cap) => (
          <button
            key={cap}
            type="button"
            className={chip(params.get("maxPrice") === String(cap))}
            onClick={() => set("maxPrice", String(cap))}
          >
            Under {cap} EUR
          </button>
        ))}
      </div>
    </div>
  );
}
