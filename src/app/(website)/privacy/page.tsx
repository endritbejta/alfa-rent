import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { legalFacts } from "@/lib/legal-facts";
import {
  FactList,
  LegalList,
  LegalPage,
  LegalSection,
} from "@/components/shared/legal-page";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("privacy.metaTitle"),
    description: t("privacy.metaDescription"),
    alternates: { canonical: "/privacy" },
  };
}

/**
 * The privacy notice the booking form links to. Structured as the GDPR, which
 * Kosovo's Law No. 06/L-082 follows, expects: controller, data, purposes and
 * legal basis, recipients, retention, rights. Every business-specific fact
 * comes from lib/legal-facts.ts; the wording needs legal review.
 */
export default async function PrivacyPage() {
  const { t } = await getI18n();
  const { controller, processors, retention, rights } = legalFacts;

  return (
    <LegalPage
      eyebrow={t("privacy.eyebrow")}
      title={t("privacy.title")}
      intro={t("privacy.intro")}
    >
      <LegalSection number={1} title={t("privacy.controllerTitle")}>
        <p>{t("privacy.controllerBody")}</p>
        <FactList
          rows={[
            [t("privacy.fact.legalName"), controller.legalName],
            [
              t("privacy.fact.registrationNumber"),
              controller.registrationNumber,
            ],
            [t("privacy.fact.address"), controller.address],
            [t("privacy.fact.privacyEmail"), controller.privacyEmail, "email"],
            [t("privacy.fact.privacyContact"), controller.privacyContact],
          ]}
        />
      </LegalSection>

      <LegalSection number={2} title={t("privacy.collectTitle")}>
        <LegalList
          items={[
            t("privacy.collectBooking"),
            t("privacy.collectRental"),
            t("privacy.collectInspection"),
            t("privacy.collectNotes"),
            t("privacy.collectTechnical"),
          ]}
        />
      </LegalSection>

      <LegalSection number={3} title={t("privacy.purposeTitle")}>
        <LegalList
          items={[
            t("privacy.purposeBooking"),
            t("privacy.purposeAccounting"),
            t("privacy.purposeSecurity"),
          ]}
        />
        <p>{t("privacy.purposeNoConsent")}</p>
      </LegalSection>

      <LegalSection number={4} title={t("privacy.recipientsTitle")}>
        <p>{t("privacy.recipientsBody")}</p>
        <LegalList
          items={[
            t("privacy.recipientSupabase"),
            t("privacy.recipientVercel"),
            t("privacy.recipientCloudinary"),
            t("privacy.recipientResend"),
          ]}
        />
        <FactList
          rows={[[t("privacy.fact.processorLocations"), processors.locations]]}
        />
      </LegalSection>

      <LegalSection number={5} title={t("privacy.retentionTitle")}>
        <FactList
          rows={[
            [t("privacy.fact.rentalRecords"), retention.rentalRecords],
            [t("privacy.fact.customerContact"), retention.customerContact],
            [
              t("privacy.fact.unconfirmedRequests"),
              retention.unconfirmedRequests,
            ],
            [t("privacy.fact.technicalRecords"), retention.technicalRecords],
          ]}
        />
        <p>{t("privacy.retentionBody")}</p>
      </LegalSection>

      <LegalSection number={6} title={t("privacy.rightsTitle")}>
        <p>{t("privacy.rightsBody")}</p>
        <LegalList
          items={[
            t("privacy.rightAccess"),
            t("privacy.rightRectify"),
            t("privacy.rightErase"),
            t("privacy.rightRestrict"),
          ]}
        />
        <p>{t("privacy.rightsHow")}</p>
        <FactList
          rows={[
            [t("privacy.fact.privacyEmail"), controller.privacyEmail, "email"],
            [t("privacy.fact.responseTime"), rights.responseTime],
          ]}
        />
        <p>{t("privacy.complaint")}</p>
      </LegalSection>

      <LegalSection number={7} title={t("privacy.cookiesTitle")}>
        <p>{t("privacy.cookiesBody")}</p>
      </LegalSection>
    </LegalPage>
  );
}
