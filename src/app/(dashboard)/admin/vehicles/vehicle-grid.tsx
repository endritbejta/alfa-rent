"use client";

import Image from "next/image";
import Link from "next/link";
import { Cog, Fuel, Users } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";

type Item = {
  id: string;
  brand: string;
  model: string;
  plate: string | null;
  year: number;
  category: string;
  transmission: string;
  fuelType: string;
  seats: number;
  pricePerDay: string;
  status: "AVAILABLE" | "RENTED" | "SERVICE" | "INACTIVE";
  image: string | null;
  registrationDue: boolean;
  registrationExpired: boolean;
};

/**
 * Admin fleet grid. Staff open a vehicle to manage it, so a card goes
 * straight to the edit page rather than a read-only drawer.
 */
export function VehicleGrid({ items }: { items: Item[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
      {items.map((v) => (
        <Link
          key={v.id}
          href={`/admin/vehicles/${v.id}/edit`}
          className="glass-card hover:border-brand/30 group block cursor-pointer overflow-hidden rounded-xl border text-left shadow-sm transition-all hover:shadow-md"
        >
          <div className="relative aspect-[16/10] bg-gradient-to-br from-neutral-800 via-neutral-900 to-neutral-800">
            {v.image ? (
              <Image
                src={v.image}
                alt={`${v.brand} ${v.model}`}
                fill
                // Must track the column count above, or every card downloads
                // an image sized for a wider slot than it renders in.
                sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
                className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-xs tracking-[0.14em] text-neutral-500 uppercase">
                {v.brand}
              </span>
            )}
            <span className="absolute top-3 right-3">
              <StatusBadge status={v.status} />
            </span>
            {(v.registrationExpired || v.registrationDue) && (
              <span
                className={
                  v.registrationExpired
                    ? "bg-destructive absolute top-3 left-3 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                    : "bg-status-maint absolute top-3 left-3 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                }
              >
                {v.registrationExpired
                  ? "Registration expired"
                  : "Registration due"}
              </span>
            )}
          </div>
          <div className="p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-display truncate text-base font-bold">
                {v.brand} {v.model}
              </h3>
              <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
                {v.plate ?? v.year}
              </span>
            </div>
            <div className="mt-2 mb-3 flex flex-wrap gap-1.5">
              {[
                {
                  icon: Cog,
                  label:
                    v.transmission === "AUTOMATIC" ? "Automatic" : "Manual",
                },
                {
                  icon: Fuel,
                  label:
                    v.fuelType.charAt(0) + v.fuelType.slice(1).toLowerCase(),
                },
                { icon: Users, label: `${v.seats} seats` },
              ].map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="border-brand/15 bg-brand/[0.06] text-foreground/80 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
                >
                  <Icon className="text-brand h-3 w-3" />
                  {label}
                </span>
              ))}
            </div>
            <p className="font-display border-t pt-3 text-lg font-bold">
              {Number(v.pricePerDay)}
              <span className="text-muted-foreground font-sans text-xs font-medium">
                {" "}
                EUR / day
              </span>
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
