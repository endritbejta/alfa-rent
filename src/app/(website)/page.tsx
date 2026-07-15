import Link from "next/link";
import type { Metadata } from "next";
import {
  ShieldCheck,
  Clock,
  MapPin,
  BadgeEuro,
  KeyRound,
  CalendarCheck,
} from "lucide-react";
import { getVehicles } from "@/services/vehicle.service";
import { VehicleCard } from "@/components/shared/vehicle-card";
import { Button } from "@/components/ui/button";
import { HeroSearch } from "@/components/forms/hero-search";

export const metadata: Metadata = {
  title: "Premium Car Rental in Kosovo",
  description:
    "Drive premium, travel without limits. Modern, fully insured rental fleet in Prishtina with airport delivery and transparent pricing.",
};

export const dynamic = "force-dynamic";

const PROOF = [
  { icon: ShieldCheck, label: "Fully insured fleet" },
  { icon: Clock, label: "24/7 airport pickup" },
  { icon: BadgeEuro, label: "Transparent pricing, no hidden fees" },
];

const WHY = [
  {
    icon: ShieldCheck,
    title: "Maintained like our own",
    text: "Every vehicle is serviced on schedule and inspected between rentals. You drive cars we would put our family in.",
  },
  {
    icon: BadgeEuro,
    title: "The price is the price",
    text: "The total you see when you pick your dates is the total you pay. No airport surcharges, no fine print.",
  },
  {
    icon: MapPin,
    title: "Delivered where you land",
    text: "Prishtina Airport, your hotel, or your doorstep — tell us where and the keys will be waiting.",
  },
  {
    icon: Clock,
    title: "Backed by Alfa Globe",
    text: "We are part of a company that keeps fleets moving across Kosovo. Reliability is the family business.",
  },
];

const STEPS = [
  {
    icon: CalendarCheck,
    title: "Choose your dates",
    text: "Tell us when you need a car. We show you only what is actually available — no dead ends.",
  },
  {
    icon: KeyRound,
    title: "Pick your vehicle",
    text: "From economy hatchbacks to the E-Class. Every listing shows the full price for your dates.",
  },
  {
    icon: ShieldCheck,
    title: "We confirm, you drive",
    text: "Our team confirms your request within hours and meets you with the keys.",
  },
];

const REVIEWS = [
  {
    quote:
      "Landed at 2 AM, the car was waiting at arrivals with a full tank. This is how rental should work everywhere.",
    name: "Liridon H.",
    detail: "Airport pickup, BMW X5",
  },
  {
    quote:
      "Booked the E-Class for a wedding weekend. Spotless car, fair price, zero paperwork drama.",
    name: "Vjosa R.",
    detail: "Weekend rental, E-Class",
  },
  {
    quote:
      "Second summer in a row renting from Alfa. The price they quote is the price you pay.",
    name: "Mark T.",
    detail: "Two-week rental, RAV4 Hybrid",
  },
];

export default async function HomePage() {
  const { items: featured } = await getVehicles({ page: 1, perPage: 3 });

  return (
    <>
      {/* Hero — charcoal band, availability-first search */}
      <section className="bg-band text-band-foreground">
        <div className="mx-auto max-w-6xl px-5 pt-20 pb-16 lg:pt-28">
          <span className="eyebrow text-band-muted">
            Premium car rental — Kosovo
          </span>
          <h1 className="font-display mt-5 max-w-3xl text-4xl leading-[1.08] font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Drive premium.
            <br />
            Travel <span className="text-brand">without limits.</span>
          </h1>
          <p className="text-band-muted mt-6 max-w-xl text-lg">
            A modern, fully insured fleet — from city runabouts to executive
            sedans — delivered wherever your journey starts.
          </p>

          <HeroSearch />

          <div className="border-band-border mt-12 flex flex-wrap gap-x-10 gap-y-4 border-t pt-8">
            {PROOF.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="text-band-muted flex items-center gap-2.5 text-sm"
              >
                <Icon className="text-brand h-4.5 w-4.5" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Featured fleet */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="eyebrow text-muted-foreground">
              Featured fleet
            </span>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight">
              The latest additions
            </h2>
          </div>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/car" />}
          >
            View all vehicles
          </Button>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} />
          ))}
        </div>
      </section>

      {/* How it works — warm tint band */}
      <section className="bg-secondary border-y">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <span className="eyebrow text-muted-foreground">How it works</span>
          <h2 className="font-display mt-3 mb-12 text-3xl font-bold tracking-tight">
            Three steps to the open road
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <div key={title} className="relative">
                <div className="bg-accent text-accent-foreground mb-4 flex h-11 w-11 items-center justify-center rounded-full">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-muted-foreground text-xs font-semibold tracking-[0.14em]">
                  STEP {i + 1}
                </p>
                <h3 className="font-display mt-1 mb-2 text-lg font-bold">
                  {title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Alfa — charcoal band */}
      <section className="bg-band text-band-foreground">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <span className="eyebrow text-band-muted">Why choose Alfa</span>
          <h2 className="font-display mt-3 mb-12 text-3xl font-bold tracking-tight">
            Built on the family business of keeping Kosovo moving
          </h2>
          <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {WHY.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-4">
                <div className="bg-brand/15 text-brand flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display mb-1.5 text-lg font-bold">
                    {title}
                  </h3>
                  <p className="text-band-muted text-sm leading-relaxed">
                    {text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reviews */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <span className="eyebrow text-muted-foreground">Reviews</span>
        <h2 className="font-display mt-3 mb-12 text-3xl font-bold tracking-tight">
          Drivers who came back
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {REVIEWS.map((review) => (
            <figure
              key={review.name}
              className="bg-card rounded-xl border p-6 shadow-xs"
            >
              <blockquote className="text-sm leading-relaxed">
                &ldquo;{review.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-4 border-t pt-4">
                <p className="text-sm font-semibold">{review.name}</p>
                <p className="text-muted-foreground text-xs">{review.detail}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* CTA band — the one red ground */}
      <section className="bg-gradient-to-r from-[#B8161F] to-[#DC2028] text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-5 py-16">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight">
              Ready to drive?
            </h2>
            <p className="mt-2 text-white/80">
              Check availability now — booking takes two minutes.
            </p>
          </div>
          <Button
            size="lg"
            className="bg-white px-8 text-[#B8161F] hover:bg-white/90"
            nativeButton={false}
            render={<Link href="/booking" />}
          >
            Book your vehicle
          </Button>
        </div>
      </section>
    </>
  );
}
