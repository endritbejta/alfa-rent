import type { Metadata } from "next";
import { MapPin, Phone, Mail, Clock } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import type { TranslationKey } from "@/lib/i18n/translations";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("contact.metaTitle"),
    description: t("contact.intro"),
  };
}

const ITEMS = [
  {
    icon: MapPin,
    label: "contact.address",
    lines: ["Prishtina, Kosovo"],
  },
  {
    icon: Phone,
    label: "contact.phone",
    lines: ["+383 44 000 000"],
  },
  {
    icon: Mail,
    label: "contact.email",
    lines: ["info@alfarent.com"],
  },
  {
    icon: Clock,
    label: "contact.hours",
    lines: ["contact.weekdays", "contact.sunday"],
    translatedLines: true,
  },
] satisfies {
  icon: typeof MapPin;
  label: TranslationKey;
  lines: string[];
  translatedLines?: boolean;
}[];

export default async function ContactPage() {
  const { t } = await getI18n();
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
      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map(({ icon: Icon, label, lines, translatedLines }) => (
            <div
              key={label}
              className="bg-card rounded-xl border p-6 shadow-xs"
            >
              <div className="bg-accent text-accent-foreground mb-4 flex h-10 w-10 items-center justify-center rounded-full">
                <Icon className="h-5 w-5" />
              </div>
              <p className="font-display font-bold">{t(label)}</p>
              {lines.map((line) => (
                <p key={line} className="text-muted-foreground mt-1 text-sm">
                  {translatedLines ? t(line as TranslationKey) : line}
                </p>
              ))}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
