import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { legalFacts } from "@/lib/legal-facts";
import {
  FactList,
  LegalPage,
  LegalSection,
} from "@/components/shared/legal-page";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("terms.metaTitle"),
    description: t("terms.metaDescription"),
    alternates: { canonical: "/terms" },
  };
}

/**
 * The rental terms. Only what the website itself does is stated as fact: a
 * request is not a rental until staff confirm it, the price shown is an
 * estimate, nothing is paid online, and the car's condition is recorded at
 * handover and return. Everything the business decides (age, deposit, fuel,
 * insurance, cancellation, law) is a fact in lib/legal-facts.ts, and the
 * whole text needs legal review.
 */
export default async function TermsPage() {
  const { t } = await getI18n();
  const { controller, terms } = legalFacts;

  return (
    <LegalPage
      eyebrow={t("terms.eyebrow")}
      title={t("terms.title")}
      intro={t("terms.intro")}
    >
      <LegalSection number={1} title={t("terms.bookingTitle")}>
        <FactList rows={[[t("terms.provider"), controller.legalName]]} />
        <p>{t("terms.bookingRequest")}</p>
        <p>{t("terms.bookingPrice")}</p>
        <p>{t("terms.bookingPayment")}</p>
      </LegalSection>

      <LegalSection number={2} title={t("terms.driverTitle")}>
        <FactList
          rows={[
            [t("terms.fact.driverAge"), terms.driverAge],
            [t("terms.fact.licence"), terms.licence],
            [t("terms.fact.documents"), terms.documents],
          ]}
        />
      </LegalSection>

      <LegalSection number={3} title={t("terms.paymentTitle")}>
        <FactList
          rows={[
            [t("terms.fact.payment"), terms.payment],
            [t("terms.fact.deposit"), terms.deposit],
          ]}
        />
      </LegalSection>

      <LegalSection number={4} title={t("terms.handoverTitle")}>
        <p>{t("terms.handoverInspection")}</p>
        <FactList
          rows={[
            [t("terms.fact.fuel"), terms.fuel],
            [t("terms.fact.mileage"), terms.mileage],
            [t("terms.fact.lateReturn"), terms.lateReturn],
          ]}
        />
      </LegalSection>

      <LegalSection number={5} title={t("terms.insuranceTitle")}>
        <FactList
          rows={[
            [t("terms.fact.insurance"), terms.insurance],
            [t("terms.fact.damage"), terms.damage],
          ]}
        />
      </LegalSection>

      <LegalSection number={6} title={t("terms.cancellationTitle")}>
        <FactList rows={[[t("terms.fact.cancellation"), terms.cancellation]]} />
      </LegalSection>

      <LegalSection number={7} title={t("terms.travelTitle")}>
        <FactList rows={[[t("terms.fact.crossBorder"), terms.crossBorder]]} />
      </LegalSection>

      <LegalSection number={8} title={t("terms.liabilityTitle")}>
        <FactList rows={[[t("terms.fact.liability"), terms.liability]]} />
      </LegalSection>

      <LegalSection number={9} title={t("terms.privacyTitle")}>
        <p>{t("terms.privacyBody")}</p>
        <p>
          <Link
            href="/privacy"
            className="text-foreground font-medium underline underline-offset-4"
          >
            {t("footer.privacy")}
          </Link>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
