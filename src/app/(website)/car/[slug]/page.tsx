import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  Users,
  Fuel,
  Settings2,
  CalendarRange,
  Gauge,
  ShieldCheck,
} from "lucide-react";
import { getPublicVehicleBySlug } from "@/services/vehicle.service";
import { NotFoundError } from "@/lib/errors";
import { StatusBadge } from "@/components/shared/status-badge";
import { AvailabilityWidget } from "@/components/forms/availability-widget";

export const dynamic = "force-dynamic";

const loadVehicle = cache(async (slug: string) => {
  try {
    return await getPublicVehicleBySlug(slug);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const vehicle = await loadVehicle(slug);
  return {
    title: `${vehicle.brand} ${vehicle.model} ${vehicle.year} — Rent from ${Number(vehicle.pricePerDay)} EUR/day`,
    description: vehicle.description.slice(0, 155),
    openGraph: vehicle.images[0]
      ? { images: [{ url: vehicle.images[0].url }] }
      : undefined,
  };
}

export default async function VehiclePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { slug } = await params;
  const { from, to } = await searchParams;
  const vehicle = await loadVehicle(slug);
  const [cover, ...rest] = vehicle.images;

  const specs = [
    {
      icon: Settings2,
      label: "Transmission",
      value: vehicle.transmission === "AUTOMATIC" ? "Automatic" : "Manual",
    },
    {
      icon: Fuel,
      label: "Fuel",
      value:
        vehicle.fuelType.charAt(0) + vehicle.fuelType.slice(1).toLowerCase(),
    },
    { icon: Users, label: "Seats", value: `${vehicle.seats}` },
    { icon: CalendarRange, label: "Year", value: `${vehicle.year}` },
    {
      icon: Gauge,
      label: "Category",
      value:
        vehicle.category.charAt(0) + vehicle.category.slice(1).toLowerCase(),
    },
    { icon: ShieldCheck, label: "Insurance", value: "Included" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        <div>
          {/* Gallery */}
          <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-gradient-to-br from-neutral-800 via-neutral-900 to-neutral-800">
            {cover ? (
              <Image
                src={cover.url}
                alt={`${vehicle.brand} ${vehicle.model}`}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="object-cover"
              />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-sm tracking-[0.16em] text-neutral-500 uppercase">
                {vehicle.brand} {vehicle.model}
              </span>
            )}
            <span className="absolute top-4 left-4">
              <StatusBadge status={vehicle.status} />
            </span>
          </div>
          {rest.length > 0 && (
            <div className="mt-3 grid grid-cols-4 gap-3">
              {rest.slice(0, 4).map((image) => (
                <div
                  key={image.id}
                  className="relative aspect-[16/10] overflow-hidden rounded-lg bg-neutral-900"
                >
                  <Image
                    src={image.url}
                    alt={`${vehicle.brand} ${vehicle.model}`}
                    fill
                    sizes="15vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          <span className="eyebrow text-muted-foreground mt-10">
            {vehicle.category.toLowerCase()}
          </span>
          <h1 className="font-display mt-3 text-4xl font-bold tracking-tight">
            {vehicle.brand} {vehicle.model}
          </h1>
          <p className="text-muted-foreground mt-4 max-w-2xl leading-relaxed">
            {vehicle.description}
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {specs.map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-card rounded-xl border p-4">
                <Icon className="text-brand mb-2 h-5 w-5" />
                <p className="text-muted-foreground text-xs">{label}</p>
                <p className="text-sm font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Booking rail */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="bg-card rounded-2xl border p-6 shadow-sm">
            <p className="font-display text-3xl font-bold">
              {Number(vehicle.pricePerDay)}
              <span className="text-muted-foreground font-sans text-sm font-medium">
                {" "}
                EUR / day
              </span>
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Insurance included. Confirmed by our team within hours.
            </p>
            <AvailabilityWidget
              vehicleId={vehicle.id}
              slug={vehicle.slug}
              initialFrom={from}
              initialTo={to}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
