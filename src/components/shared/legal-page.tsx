import { FileWarning } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import {
  isTodo,
  legalFacts,
  legalTextIsDraft,
  resolveFact,
  type Fact,
} from "@/lib/legal-facts";

/**
 * The shell shared by /privacy and /terms: the storefront's dark band header,
 * then one readable column of numbered sections.
 *
 * Every business fact goes through FactList, which is the only place a
 * missing one is drawn. A fact still to be supplied reads "To be confirmed"
 * rather than anything that could pass for the real value, and the page
 * carries a draft banner until none is left (see lib/legal-facts.ts).
 */
export async function LegalPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  const { t } = await getI18n();
  return (
    <>
      <section className="bg-band text-band-foreground">
        <div className="mx-auto max-w-6xl px-5 pt-8 pb-6 sm:pt-12 sm:pb-9">
          <span className="eyebrow text-band-muted">{eyebrow}</span>
          <h1 className="font-display mt-3 text-2xl font-bold tracking-tight sm:mt-4 sm:text-3xl lg:text-4xl">
            {title}
          </h1>
          <p className="text-band-muted mt-2 max-w-lg text-sm sm:mt-3 sm:text-base">
            {intro}
          </p>
        </div>
      </section>

      <article className="mx-auto max-w-3xl px-5 py-8 sm:py-14">
        {legalTextIsDraft && (
          <div
            role="note"
            className="bg-status-maint/10 border-status-maint mb-8 flex gap-3 border-l-2 p-4"
          >
            <FileWarning className="text-status-maint mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">{t("legal.draftTitle")}</p>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                {t("legal.draftBody")}
              </p>
            </div>
          </div>
        )}
        <FactList
          rows={[[t("legal.effectiveDate"), legalFacts.effectiveDate]]}
        />
        <div className="mt-8 space-y-10 sm:mt-10">{children}</div>
      </article>
    </>
  );
}

export function LegalSection({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t pt-6">
      <h2 className="font-display flex items-baseline gap-3 text-lg font-bold sm:text-xl">
        <span className="text-muted-foreground text-sm tabular-nums">
          {String(number).padStart(2, "0")}
        </span>
        {title}
      </h2>
      <div className="text-muted-foreground mt-3 space-y-3 text-sm leading-relaxed sm:text-[15px]">
        {children}
      </div>
    </section>
  );
}

export function LegalList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-current/40">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * Label and value pairs for the facts in legal-facts.ts. An email is linked
 * once it is supplied.
 */
export async function FactList({
  rows,
}: {
  rows: [label: string, fact: Fact, kind?: "email"][];
}) {
  const { locale, t } = await getI18n();
  return (
    <dl className="border-divider divide-divider divide-y border-y">
      {rows.map(([label, fact, kind]) => {
        const value = resolveFact(fact, locale);
        return (
          <div
            key={label}
            className="grid gap-1 py-3 sm:grid-cols-[13rem_1fr] sm:gap-4"
          >
            <dt className="text-muted-foreground text-xs font-semibold tracking-[0.08em] uppercase sm:pt-0.5">
              {label}
            </dt>
            <dd className="text-foreground text-sm">
              {value === null ? (
                <>
                  <span className="border-status-maint/60 text-status-maint inline-flex border border-dashed px-2 py-0.5 text-xs font-medium">
                    {t("legal.toBeConfirmed")}
                  </span>
                  {isTodo(fact) && process.env.NODE_ENV === "development" && (
                    // Development only: says what the business has to supply,
                    // without ever showing customers a configuration note.
                    <span className="text-muted-foreground mt-1 block font-mono text-[11px]">
                      Dev only, needed: {fact.todo}
                    </span>
                  )}
                </>
              ) : kind === "email" ? (
                <a
                  href={`mailto:${value}`}
                  className="underline underline-offset-4"
                >
                  {value}
                </a>
              ) : (
                value
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
