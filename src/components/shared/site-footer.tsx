import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";

export async function SiteFooter() {
  const { t } = await getI18n();
  return (
    <footer className="bg-band text-band-muted border-band-border border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-band-foreground text-lg font-bold">
            ALFA <span className="text-brand">RENT</span>
          </p>
          <p className="mt-3 max-w-xs text-sm">{t("footer.tagline")}</p>
        </div>
        <div>
          <p className="text-band-foreground mb-3 text-sm font-semibold">
            {t("footer.explore")}
          </p>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/car" className="hover:text-band-foreground">
                {t("footer.fleet")}
              </Link>
            </li>
            <li>
              <Link href="/booking" className="hover:text-band-foreground">
                {t("footer.book")}
              </Link>
            </li>
            <li>
              <Link href="/contact" className="hover:text-band-foreground">
                {t("footer.contact")}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-band-foreground mb-3 text-sm font-semibold">
            {t("footer.contact")}
          </p>
          <ul className="space-y-2 text-sm">
            <li>Prishtina, Kosovo</li>
            <li>+383 44 000 000</li>
            <li>info@alfarent.com</li>
          </ul>
        </div>
        <div>
          <p className="text-band-foreground mb-3 text-sm font-semibold">
            {t("footer.hours")}
          </p>
          <ul className="space-y-2 text-sm">
            <li>{t("footer.weekdays")}</li>
            <li>{t("footer.sunday")}</li>
            <li>{t("footer.confirmation")}</li>
          </ul>
        </div>
      </div>
      <div className="border-band-border border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-5 text-xs">
          <span>
            {new Date().getFullYear()} Alfa Rent a Car. {t("footer.rights")}
          </span>
          <Link href="/login" className="hover:text-band-foreground">
            {t("footer.staffLogin")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
