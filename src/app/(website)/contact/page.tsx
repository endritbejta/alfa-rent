import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Clock, Mail, MapPin, Phone } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { publicContact } from "@/lib/site-config";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("contact.metaTitle"),
    description: t("contact.intro"),
    alternates: { canonical: "/contact" },
  };
}

export default async function ContactPage() {
  const { t } = await getI18n();
  const hasDirectContact = Boolean(publicContact.phone || publicContact.email);
  // Without a configured map link, a maps search for the configured address
  // is still accurate; it is derived from real data, not invented.
  const mapHref =
    publicContact.mapUrl ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(publicContact.address)}`;

  return (
    <>
      <section className="bg-band text-band-foreground">
        <div className="mx-auto max-w-6xl px-5 pt-8 pb-6 sm:pt-12 sm:pb-9">
          <span className="eyebrow text-band-muted">
            {t("contact.eyebrow")}
          </span>
          <h1 className="font-display mt-3 text-2xl font-bold tracking-tight sm:mt-4 sm:text-3xl lg:text-4xl">
            {t("contact.title")}
          </h1>
          <p className="text-band-muted mt-2 max-w-lg text-sm sm:mt-3 sm:text-base">
            {t("contact.intro")}
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-5 py-6 sm:gap-6 sm:py-14 lg:grid-cols-[1.35fr_.65fr]">
        <div className="border-t pt-6 sm:pt-8">
          <p className="text-muted-foreground text-xs font-semibold tracking-[0.14em] uppercase">
            {t("footer.contact")}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {publicContact.phone && (
              <ContactAction
                href={`tel:${publicContact.phone.replace(/\s/g, "")}`}
                icon={Phone}
                label={t("contact.phone")}
                value={publicContact.phone}
              />
            )}
            {publicContact.email && (
              <ContactAction
                href={`mailto:${publicContact.email}`}
                icon={Mail}
                label={t("contact.email")}
                value={publicContact.email}
              />
            )}
            {!hasDirectContact && (
              <p className="text-muted-foreground bg-muted rounded-none p-5 text-sm leading-relaxed sm:col-span-2">
                {t("contact.verifiedOnly")}
              </p>
            )}
            {!hasDirectContact && process.env.NODE_ENV === "development" && (
              // Visible only in development: tells whoever runs the site what
              // to set, without ever showing customers a configuration note.
              <p className="rounded-none border border-dashed border-amber-500/60 p-4 font-mono text-xs leading-relaxed text-amber-700 sm:col-span-2 dark:text-amber-400">
                Dev only: set NEXT_PUBLIC_CONTACT_PHONE and/or
                NEXT_PUBLIC_CONTACT_EMAIL to show direct contact options.
              </p>
            )}
          </div>

          <div className="border-divider mt-7 border-t pt-7">
            <h2 className="font-display text-xl font-bold">
              {t("contact.bookingAction")}
            </h2>
            <p className="text-muted-foreground mt-2 max-w-lg text-sm">
              {t("contact.bookingText")}
            </p>
            <Button
              className="mt-5"
              nativeButton={false}
              render={<Link href="/car" />}
            >
              {t("common.viewAllVehicles")}
              <ArrowUpRight />
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <a
            href={mapHref}
            target="_blank"
            rel="noreferrer"
            className="hover:bg-surface-hover group flex min-h-32 items-start gap-4 border-t p-5 transition-colors"
          >
            <ContactIcon icon={MapPin} />
            <div>
              <p className="font-display font-bold">{t("contact.address")}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {publicContact.address}
              </p>
              <span className="text-foreground mt-4 inline-flex items-center gap-1 text-sm font-medium">
                {t("contact.openMap")}
                <ArrowUpRight className="h-4 w-4 transition-transform duration-[var(--motion-hover)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none" />
              </span>
            </div>
          </a>

          <div className="flex min-h-32 items-start gap-4 border-t p-5">
            <ContactIcon icon={Clock} />
            <div>
              <p className="font-display font-bold">{t("contact.hours")}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {t("contact.weekdays")}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {t("contact.sunday")}
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function ContactAction({
  href,
  icon,
  label,
  value,
}: {
  href: string;
  icon: typeof Phone;
  label: string;
  value: string;
}) {
  return (
    <a
      href={href}
      className="bg-foreground text-background group rounded-none p-5"
    >
      <ContactIcon icon={icon} inverted />
      <p className="mt-6 text-xs font-semibold tracking-[0.12em] uppercase opacity-65">
        {label}
      </p>
      <p className="mt-1 flex items-center justify-between gap-3 font-semibold">
        {value}
        <ArrowUpRight className="h-4 w-4" />
      </p>
    </a>
  );
}

function ContactIcon({
  icon: Icon,
  inverted = false,
}: {
  icon: typeof Phone;
  inverted?: boolean;
}) {
  return (
    <span
      className={
        inverted
          ? "flex h-10 w-10 items-center justify-center rounded-full bg-white/12"
          : "bg-accent text-accent-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
      }
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}
