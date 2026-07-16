"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { VehicleCategory } from "@prisma/client";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Fleet filters. The URL is the source of truth — a filtered view is
 * shareable, survives a refresh, and the server does the querying rather
 * than shipping the whole fleet to the browser to sift.
 */
const AVAILABILITY = [
  { key: "AVAILABLE", label: "Free" },
  { key: "RENTED", label: "Taken" },
  { key: "SERVICE", label: "In service" },
  { key: "INACTIVE", label: "Retired" },
] as const;

const REGISTRATION = [
  { key: "valid", label: "Registered" },
  { key: "due", label: "Expiring soon" },
  { key: "expired", label: "Expired" },
  { key: "missing", label: "Not recorded" },
] as const;

export function VehicleFilters({
  brands,
  total,
}: {
  brands: string[];
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    // Clicking the active chip clears it — no separate "all" control needed.
    if (value === null || next.get(key) === value) next.delete(key);
    else next.set(key, value);
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `/admin/vehicles?${qs}` : "/admin/vehicles", {
      scroll: false,
    });
  };

  const active = ["brand", "category", "status", "registration"].filter((k) =>
    params.get(k)
  );

  const chip = (isActive: boolean) =>
    cn(
      "cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
      isActive
        ? "border-transparent bg-foreground text-background font-semibold"
        : "bg-card text-muted-foreground hover:text-foreground"
    );

  const select =
    "border-input bg-card focus:ring-ring h-8 cursor-pointer rounded-full border px-3 text-xs outline-none focus:ring-2";

  return (
    <div className="bg-secondary/60 space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Label>Brand</Label>
        <select
          className={select}
          value={params.get("brand") ?? ""}
          onChange={(e) => set("brand", e.target.value || null)}
        >
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        <Label>Category</Label>
        <select
          className={select}
          value={params.get("category") ?? ""}
          onChange={(e) => set("category", e.target.value || null)}
        >
          <option value="">All categories</option>
          {Object.values(VehicleCategory).map((c) => (
            <option key={c} value={c}>
              {c.charAt(0) + c.slice(1).toLowerCase()}
            </option>
          ))}
        </select>

        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          {total} vehicle{total === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Label>Availability</Label>
        {AVAILABILITY.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={chip(params.get("status") === key)}
            onClick={() => set("status", key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Label>Registration</Label>
        {REGISTRATION.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={chip(params.get("registration") === key)}
            onClick={() => set("registration", key)}
          >
            {label}
          </button>
        ))}

        {active.length > 0 && (
          <button
            type="button"
            onClick={() => router.push("/admin/vehicles", { scroll: false })}
            className="text-muted-foreground hover:text-foreground ml-auto flex cursor-pointer items-center gap-1 text-xs font-semibold transition-colors"
          >
            <X className="h-3 w-3" />
            Clear {active.length} filter{active.length === 1 ? "" : "s"}
          </button>
        )}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-muted-foreground w-20 shrink-0 text-[10px] font-semibold tracking-[0.1em] uppercase">
      {children}
    </span>
  );
}
