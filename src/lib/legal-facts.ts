import type { Locale } from "@/lib/i18n/config";

/**
 * The facts the privacy notice (/privacy) and the rental terms (/terms) rest
 * on, which only the business or its lawyer can supply.
 *
 * Nothing here may be guessed. A wrong company name, registration number or
 * retention period on a published privacy notice is worse than a visible gap:
 * it is a statement the business is held to. So every unknown is a `todo()`,
 * which the pages render as "To be confirmed" under a draft banner, and
 * `missingLegalFacts` lists. Replace a `todo(...)` with the real value:
 *
 * - a plain string for something that reads the same in both languages
 *   (a name, a number, an address, an email);
 * - `{ sq: "...", en: "..." }` for anything that is a sentence.
 *
 * The pages stop calling themselves a draft once nothing here is a todo.
 * `REQUIRE_FINAL_LEGAL_FACTS=1 npm test` fails while any is left; see
 * legal-facts.test.ts.
 *
 * The prose around these facts lives in translations.ts under `privacy.*`
 * and `terms.*`, and needs the same legal review.
 */

/** A fact still to be supplied; `todo` says what is needed. */
export type Todo = { readonly todo: string };
export type Localized = { readonly sq: string; readonly en: string };
export type Fact = string | Localized | Todo;

const todo = (what: string): Todo => ({ todo: what });

export const legalFacts = {
  controller: {
    legalName: todo(
      "The business's registered name, exactly as on its ARBK registration"
    ),
    registrationNumber: todo(
      "Business registration number and/or fiscal number (NUI/NF)"
    ),
    address: todo("Registered address of the business"),
    privacyEmail: todo(
      "Email address people write to with privacy requests (monitored)"
    ),
    privacyContact: todo(
      "Who handles privacy requests (a role is enough), and whether a data protection officer is appointed"
    ),
  },
  processors: {
    locations: todo(
      "Where Supabase, Vercel, Cloudinary and Resend store the data (the regions configured for this account), and the safeguard for any transfer outside Kosovo"
    ),
  },
  retention: {
    rentalRecords: todo(
      "How long reservation and payment records are kept for accounting and tax law"
    ),
    customerContact: todo(
      "How long a customer's name, email and phone are kept after their last rental"
    ),
    unconfirmedRequests: todo(
      "How long a booking request that was never confirmed, or was cancelled, is kept"
    ),
    technicalRecords: todo(
      "How long technical records are kept: hosting logs and the IP-address counters that limit repeated requests"
    ),
  },
  rights: {
    responseTime: todo(
      "How quickly a privacy request is answered (the deadline the law sets)"
    ),
  },
  terms: {
    driverAge: todo("Minimum (and any maximum) driver age"),
    licence: todo("How long the driver must have held a licence"),
    documents: todo("Documents to bring at pickup"),
    payment: todo("When and how the rental is paid (methods accepted)"),
    deposit: todo("Security deposit: amount, how it is taken and returned"),
    fuel: todo("Fuel policy"),
    mileage: todo("Mileage limit, if any, and the charge beyond it"),
    lateReturn: todo("What happens, and what is charged, on a late return"),
    insurance: todo("Insurance included, and the customer's excess"),
    damage: todo("How damage found at return is assessed and charged"),
    cancellation: todo("Cancellation by the customer, and any fee"),
    crossBorder: todo("Whether the car may leave Kosovo, and on what terms"),
    liability: todo("Limits of liability, governing law and competent court"),
  },
  /** When the approved texts take effect. */
  effectiveDate: todo("Date the approved notice and terms take effect"),
} as const satisfies Record<string, Fact | Record<string, Fact>>;

export function isTodo(fact: Fact): fact is Todo {
  return typeof fact === "object" && "todo" in fact;
}

/** The fact in this locale, or null while it is still to be supplied. */
export function resolveFact(fact: Fact, locale: Locale): string | null {
  if (isTodo(fact)) return null;
  const text = typeof fact === "string" ? fact : fact[locale];
  return text.trim() || null;
}

/**
 * Dotted paths of every fact not yet supplied. An empty string, or a
 * translation left empty in one language, counts as missing too.
 */
export function missingLegalFacts(
  facts: Record<string, unknown> = legalFacts,
  prefix = ""
): string[] {
  return Object.entries(facts).flatMap(([key, value]) => {
    const path = prefix + key;
    if (typeof value === "string") return value.trim() ? [] : [path];
    if (value && typeof value === "object") {
      if ("todo" in value) return [path];
      if ("sq" in value && "en" in value) {
        const { sq, en } = value as Localized;
        return sq.trim() && en.trim() ? [] : [path];
      }
      return missingLegalFacts(value as Record<string, unknown>, `${path}.`);
    }
    return [path];
  });
}

/** True until every fact above is supplied. The pages say so while it is. */
export const legalTextIsDraft = missingLegalFacts().length > 0;
