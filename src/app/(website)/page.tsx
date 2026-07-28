import Link from "next/link";
import type { Metadata } from "next";
import {
  ShieldCheck,
  Clock,
  BadgeEuro,
  KeyRound,
  CalendarCheck,
} from "lucide-react";
import { getPublicVehicles } from "@/services/vehicle.service";
import { VehicleCard } from "@/components/shared/vehicle-card";
import { Button } from "@/components/ui/button";
import { HeroSearch } from "@/components/forms/hero-search";
import { HeroBackground } from "@/components/shared/hero-background";
import { getI18n } from "@/lib/i18n/server";
import type { TranslationKey } from "@/lib/i18n/translations";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("home.metaTitle"),
    description: t("home.metaDescription"),
  };
}

export const dynamic = "force-dynamic";

const PROOF = [
  { icon: ShieldCheck, label: "home.proof.insured" },
  { icon: Clock, label: "home.proof.flexible" },
  { icon: BadgeEuro, label: "home.proof.transparent" },
] satisfies { icon: typeof ShieldCheck; label: TranslationKey }[];

const WHY = [
  {
    icon: ShieldCheck,
    title: "home.why1.title",
    text: "home.why1.text",
  },
  {
    icon: BadgeEuro,
    title: "home.why2.title",
    text: "home.why2.text",
  },
  {
    icon: KeyRound,
    title: "home.why3.title",
    text: "home.why3.text",
  },
  {
    icon: Clock,
    title: "home.why4.title",
    text: "home.why4.text",
  },
] satisfies {
  icon: typeof ShieldCheck;
  title: TranslationKey;
  text: TranslationKey;
}[];

const STEPS = [
  {
    icon: CalendarCheck,
    title: "home.step1.title",
    text: "home.step1.text",
  },
  {
    icon: KeyRound,
    title: "home.step2.title",
    text: "home.step2.text",
  },
  {
    icon: ShieldCheck,
    title: "home.step3.title",
    text: "home.step3.text",
  },
] satisfies {
  icon: typeof ShieldCheck;
  title: TranslationKey;
  text: TranslationKey;
}[];

const REVIEWS = [
  {
    quote:
      "Picked up the Tiguan for a family trip. It was spotless, comfortable, and exactly as described.",
    name: "Liridon H.",
    detail: "Family trip, Volkswagen Tiguan",
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
  const { t } = await getI18n();
  const { items: featured } = await getPublicVehicles({ page: 1, perPage: 3 });

  return (
    <>
      {/* Hero — charcoal band, availability-first search */}
      <section className="bg-band text-band-foreground relative isolate overflow-hidden">
        <HeroBackground />
        <div className="relative z-10 mx-auto max-w-6xl px-5 pt-20 pb-16 lg:pt-28">
          <span className="eyebrow text-band-muted">{t("home.eyebrow")}</span>
          <h1 className="font-display mt-5 max-w-3xl text-4xl leading-[1.08] font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            {t("home.titleLine1")}
            <br />
            {t("home.titleLine2")}{" "}
            <span className="text-brand">{t("home.titleAccent")}</span>
          </h1>
          <p className="text-band-muted mt-6 max-w-xl text-lg">
            {t("home.intro")}
          </p>

          <HeroSearch />

          <div className="border-band-border mt-12 flex flex-wrap gap-x-10 gap-y-4 border-t pt-8">
            {PROOF.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="text-band-muted flex items-center gap-2.5 text-sm"
              >
                <Icon className="text-brand h-4.5 w-4.5" />
                {t(label)}
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
              {t("home.featured")}
            </span>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight">
              {t("home.latest")}
            </h2>
          </div>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/car" />}
          >
            {t("common.viewAllVehicles")}
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
          <span className="eyebrow text-muted-foreground">{t("home.how")}</span>
          <h2 className="font-display mt-3 mb-12 text-3xl font-bold tracking-tight">
            {t("home.stepsTitle")}
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <div key={title} className="relative">
                <div className="bg-accent text-accent-foreground mb-4 flex h-11 w-11 items-center justify-center rounded-full">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-muted-foreground text-xs font-semibold tracking-[0.14em]">
                  {t("home.step", { number: i + 1 })}
                </p>
                <h3 className="font-display mt-1 mb-2 text-lg font-bold">
                  {t(title)}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {t(text)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Alfa — charcoal band */}
      <section className="bg-band text-band-foreground">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <span className="eyebrow text-band-muted">{t("home.why")}</span>
          <h2 className="font-display mt-3 mb-12 text-3xl font-bold tracking-tight">
            {t("home.whyTitle")}
          </h2>
          <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {WHY.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-4">
                <div className="bg-brand/15 text-brand flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display mb-1.5 text-lg font-bold">
                    {t(title)}
                  </h3>
                  <p className="text-band-muted text-sm leading-relaxed">
                    {t(text)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reviews */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <span className="eyebrow text-muted-foreground">
          {t("home.reviews")}
        </span>
        <h2 className="font-display mt-3 mb-12 text-3xl font-bold tracking-tight">
          {t("home.reviewsTitle")}
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
              {t("home.ctaTitle")}
            </h2>
            <p className="mt-2 text-white/80">{t("home.ctaText")}</p>
          </div>
          <Button
            size="lg"
            className="bg-white px-8 text-[#B8161F] hover:bg-white/90"
            nativeButton={false}
            render={<Link href="/booking" />}
          >
            {t("common.bookVehicle")}
          </Button>
        </div>
      </section>
    </>
  );
}
