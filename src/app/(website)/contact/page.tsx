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
  };
}

export default async function ContactPage() {
  const { t } = await getI18n();
  const hasDirectContact = Boolean(publicContact.phone || publicContact.email);

  return (
    <>
      <section className="bg-band text-band-foreground">
        <div className="mx-auto max-w-6xl px-5 pt-14 pb-10">
          <span className="eyebrow text-band-muted">
            {t("contact.eyebrow")}
          </span>
          <h1 className="font-display mt-4 text-4xl font-bold tracking-tight">
            {t("contact.title")}
          </h1>
          <p className="text-band-muted mt-3 max-w-lg">{t("contact.intro")}</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-5 py-14 lg:grid-cols-[1.35fr_.65fr]">
        <div className="bg-card rounded-3xl p-6 shadow-sm sm:p-8">
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
              <p className="text-muted-foreground bg-muted rounded-2xl p-5 text-sm leading-relaxed sm:col-span-2">
                {t("contact.verifiedOnly")}
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
          {publicContact.mapUrl ? (
            <a
              href={publicContact.mapUrl}
              target="_blank"
              rel="noreferrer"
              className="bg-card hover:bg-surface-hover group flex min-h-32 items-start gap-4 rounded-2xl p-5 shadow-sm transition-colors"
            >
              <ContactIcon icon={MapPin} />
              <div>
                <p className="font-display font-bold">{t("contact.address")}</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {publicContact.address}
                </p>
                <ArrowUpRight className="text-muted-foreground mt-4 h-4 w-4" />
              </div>
            </a>
          ) : (
            <div className="bg-card flex min-h-32 items-start gap-4 rounded-2xl p-5 shadow-sm">
              <ContactIcon icon={MapPin} />
              <div>
                <p className="font-display font-bold">{t("contact.address")}</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {publicContact.address}
                </p>
              </div>
            </div>
          )}

          <div className="bg-card flex min-h-32 items-start gap-4 rounded-2xl p-5 shadow-sm">
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
      className="bg-foreground text-background group rounded-2xl p-5"
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
