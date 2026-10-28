"use client";

import Image from "next/image";
import Link from "next/link";
import { Cog, Fuel, Users } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { useI18n } from "@/components/shared/locale-provider";
import { formatAmount } from "@/lib/money";

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
  pricePerDay: number;
  status: "AVAILABLE" | "RENTED" | "SERVICE" | "INACTIVE";
  image: string | null;
};

/**
 * Admin fleet grid. Staff open a vehicle to manage it, so a card goes
 * straight to the edit page rather than a read-only drawer.
 */
export function VehicleGrid({ items }: { items: Item[] }) {
  const { locale, t } = useI18n();
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
      {items.map((v) => (
        <Link
          key={v.id}
          href={`/admin/vehicles/${v.id}/edit`}
          className="group block cursor-pointer overflow-hidden text-left"
        >
          <div className="bg-media relative aspect-[16/10] overflow-hidden rounded-md">
            {v.image ? (
              <Image
                src={v.image}
                alt={`${v.brand} ${v.model}`}
                fill
                // Must track the column count above, or every card downloads
                // an image sized for a wider slot than it renders in.
                sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
                className="object-cover transition-transform duration-500 ease-[var(--ease-standard)] group-hover:scale-[1.03] motion-reduce:transition-none"
              />
            ) : (
              <span className="text-media-foreground absolute inset-0 flex items-center justify-center text-xs tracking-[0.14em] uppercase">
                {v.brand}
              </span>
            )}
            {v.status !== "AVAILABLE" && (
              <span className="absolute top-3 right-3">
                <StatusBadge status={v.status} variant="overlay" />
              </span>
            )}
          </div>
          <div className="border-b py-4">
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
                    v.transmission === "AUTOMATIC"
                      ? t("vehicle.automatic")
                      : t("vehicle.manual"),
                },
                {
                  icon: Fuel,
                  label: t(
                    `vehicle.${v.fuelType.toLowerCase()}` as
                      | "vehicle.petrol"
                      | "vehicle.diesel"
                      | "vehicle.hybrid"
                      | "vehicle.electric"
                  ),
                },
                { icon: Users, label: t("vehicle.seats", { count: v.seats }) },
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
              {formatAmount(v.pricePerDay, locale)}
              <span className="text-muted-foreground font-sans text-xs font-medium">
                {" "}
                {t("admin.perDay")}
              </span>
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
