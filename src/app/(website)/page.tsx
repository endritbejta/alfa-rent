import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
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
import { BusinessJsonLd } from "@/components/shared/business-json-ld";
import { getI18n } from "@/lib/i18n/server";
import type { TranslationKey } from "@/lib/i18n/translations";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("home.metaTitle"),
    description: t("home.metaDescription"),
    alternates: { canonical: "/" },
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

export default async function HomePage() {
  const { t } = await getI18n();
  const { items: featured } = await getPublicVehicles({ page: 1, perPage: 3 });

  return (
    <>
      <BusinessJsonLd description={t("home.metaDescription")} />
      {/* Hero — charcoal band, availability-first search */}
      <section className="bg-band text-band-foreground relative isolate overflow-hidden">
        <HeroBackground />
        <div className="relative z-10 mx-auto max-w-6xl px-5 pt-14 pb-14 lg:pt-20 lg:pb-16">
          <span className="eyebrow text-band-muted">{t("home.eyebrow")}</span>
          <h1 className="display-xl reveal mt-5 max-w-4xl text-balance">
            {t("home.titleLine1")}
            <br />
            {t("home.titleLine2")}{" "}
            <span className="text-brand">{t("home.titleAccent")}</span>
          </h1>
          <p className="text-band-muted mt-6 max-w-xl text-base sm:text-lg">
            {t("home.intro")}
          </p>

          <HeroSearch />

          <div className="border-band-border mt-10 flex flex-wrap gap-x-10 gap-y-3 border-t pt-6">
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
      <section
        aria-labelledby="featured-heading"
        className="mx-auto max-w-6xl px-5 py-16 lg:py-20"
      >
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="eyebrow text-muted-foreground">
              {t("home.featured")}
            </span>
            <h2 id="featured-heading" className="display-lg mt-3">
              {t("home.latest")}
            </h2>
          </div>
          <Link
            href="/car"
            className="text-muted-foreground hover:text-foreground group inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold transition-colors"
          >
            {t("common.viewAllVehicles")}
            <ArrowRight className="h-4 w-4 transition-transform duration-[var(--motion-hover)] group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </Link>
        </div>
        <div className="rule-list">
          {featured.map((vehicle, index) => (
            <VehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              preload={index === 0}
            />
          ))}
        </div>
      </section>

      {/* How it works — warm tint band */}
      <section className="bg-secondary">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <span className="eyebrow text-muted-foreground">{t("home.how")}</span>
          <h2 className="display-lg mt-3 mb-12">{t("home.stepsTitle")}</h2>
          <ol className="rule-list border-t">
            {STEPS.map(({ title, text }, i) => (
              <li
                key={title}
                className="grid gap-2 py-7 md:grid-cols-12 md:gap-8"
              >
                <p className="text-muted-foreground text-sm tabular-nums md:col-span-2">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="text-xl font-semibold tracking-tight md:col-span-4">
                  {t(title)}
                </h3>
                <p className="text-muted-foreground max-w-md text-sm leading-relaxed md:col-span-6">
                  {t(text)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Why Alfa — charcoal band */}
      <section className="bg-band text-band-foreground">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <span className="eyebrow text-band-muted">{t("home.why")}</span>
          <h2 className="display-lg mt-3 mb-12">{t("home.whyTitle")}</h2>
          <div className="border-band-border grid gap-x-12 border-t sm:grid-cols-2">
            {WHY.map(({ title, text }) => (
              <div key={title} className="border-band-border border-b py-8">
                <h3 className="mb-2 text-xl font-semibold tracking-tight">
                  {t(title)}
                </h3>
                <p className="text-band-muted text-sm leading-relaxed">
                  {t(text)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band — the one red ground */}
      <section className="bg-brand-fill text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-5 py-16">
          <div>
            <h2 className="display-lg">{t("home.ctaTitle")}</h2>
            <p className="mt-2 text-white/80">{t("home.ctaText")}</p>
          </div>
          <Button
            size="lg"
            className="bg-card text-foreground hover:bg-secondary px-8"
            nativeButton={false}
            render={<Link href="/car" />}
          >
            {t("common.bookVehicle")}
          </Button>
        </div>
      </section>
    </>
  );
}
