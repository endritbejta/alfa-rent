import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { enUS, sq } from "date-fns/locale";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n/server";
import { NotFoundError } from "@/lib/errors";
import { formatNumber } from "@/lib/number-format";
import { publicContact } from "@/lib/site-config";
import { rentalCalendarDay, businessWallClock } from "@/lib/business-time";
import { rentalDays } from "@/lib/rental-dates";
import {
  getHandoverRecord,
  type HandoverRecord,
} from "@/services/reservation.service";
import {
  formatDay,
  formatRentalPeriod,
} from "@/app/(dashboard)/admin/reservations/format-day";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Handover",
  robots: { index: false, follow: false },
};

/**
 * The sheet is paper, not themed UI: black on white in either theme, on
 * screen and printed. So its colours are fixed values — the brand red and a
 * neutral grey scale — rather than the theme tokens, which turn dark.
 */
const RED = "text-[#dc2028]";

/**
 * The vehicle handover sheet: a printed page the customer signs to confirm
 * they received the car in the condition written on it — and, once it is
 * back, that they returned it in the condition recorded then.
 *
 * Outside the admin shell (its own route group) so it prints as a clean A4
 * page with no sidebar, but still under /admin, so the proxy's session
 * perimeter covers it, and the page checks the user itself as well.
 *
 * Filled from the pickup (or return) inspection when one has been recorded,
 * down to the names and the date beside each signature, so the customer only
 * signs. Before that, the condition fields are blank lines to fill in by hand
 * at the counter, so the sheet can be printed ahead of the handover; the
 * dates are then the booked day.
 *
 * A paper document in the brand: the red "A" and the wordmark, a red rule,
 * numbered sections and a fuel gauge — black on white on screen too, in
 * either theme, since the screen is a preview of the paper. It prints on its
 * own named page with no margin (globals.css, `@page handover-sheet`): the
 * browser draws its date, title and URL in the page margin, so with none
 * there is nowhere to draw them, and the sheet pads itself instead.
 */
export default async function HandoverSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  await requireUser();
  const { locale, t } = await getI18n();
  const { id } = await params;
  const { type: rawType } = await searchParams;
  const type = rawType === "return" ? "RETURN" : "PICKUP";

  let record: HandoverRecord;
  try {
    record = await getHandoverRecord(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const dateLocale = locale === "sq" ? sq : enUS;
  const inspection = record.inspections.find((i) => i.type === type) ?? null;
  const pickupDay = rentalCalendarDay(record.pickupDate);
  const returnDay = rentalCalendarDay(record.returnDate);
  const customerName =
    `${record.customer.firstName} ${record.customer.lastName}`.trim();
  const isPickup = type === "PICKUP";
  // When the handover happened at the branch, if it has; the sheet's date.
  const when =
    inspection?.acknowledgedAt ??
    (isPickup ? record.startedAt : record.completedAt);
  const stamp = (date: Date) =>
    format(businessWallClock(date), "d MMM yyyy, HH:mm", {
      locale: dateLocale,
    });
  // Beside both signatures: the day of the handover, or the booked day when
  // the sheet is printed ahead of it.
  const signedOn = when
    ? format(businessWallClock(when), "d MMM yyyy", { locale: dateLocale })
    : formatDay(isPickup ? pickupDay : returnDay, dateLocale);
  const reference = record.id.slice(-8).toUpperCase();
  const contact = [
    publicContact.address,
    publicContact.phone,
    publicContact.email,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <main className="handover-sheet-page min-h-screen bg-[#e5e5e5]/60 print:min-h-0 print:bg-white">
      <div className="mx-auto max-w-[210mm] px-4 py-8 print:max-w-none print:p-0">
        <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
          <p className="text-sm text-[#525252]">{t("handover.screenHint")}</p>
          <PrintButton label={t("handover.print")} />
        </div>

        {/* The marker the admin's print frame waits for: it proves the
            response is this reservation's sheet, of this type, and not a
            sign-in page or an error, before print() is called on it. */}
        <article
          data-print-sheet={record.id}
          data-print-type={type}
          className="relative flex min-h-[297mm] flex-col overflow-hidden bg-white px-[14mm] pt-[12mm] pb-[10mm] text-[12.5px] leading-relaxed text-[#171717] shadow-sm [print-color-adjust:exact] print:shadow-none"
        >
          {/* The red "A", very faint, as the paper's watermark. A plain
              <img> throughout: loaded with the page, so it is there when
              the print dialog opens. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/alfa-logo-red.png"
            alt=""
            aria-hidden
            className="pointer-events-none absolute -right-[18mm] -bottom-[18mm] w-[110mm] opacity-[0.035] select-none"
          />

          <header className="relative flex items-start justify-between gap-6">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/alfa-logo-red.png"
                alt=""
                aria-hidden
                width={226}
                height={223}
                className="h-12 w-12 object-contain"
              />
              <div>
                <p className="font-display text-[22px] leading-none font-bold tracking-tight">
                  ALFA <span className={RED}>RENT</span>{" "}
                  <span className="text-[15px] font-medium text-[#737373]">
                    a Car
                  </span>
                </p>
                <p className="mt-1.5 text-[10.5px] whitespace-pre text-[#737373]">
                  {contact}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p
                className={`text-[10px] font-bold tracking-[0.16em] uppercase ${RED}`}
              >
                {isPickup ? t("print.pickup") : t("print.return")}
              </p>
              <h1 className="font-display mt-1 text-[17px] leading-tight font-semibold">
                {isPickup
                  ? t("handover.titlePickup")
                  : t("handover.titleReturn")}
              </h1>
              <p className="mt-1.5 inline-block border border-[#d4d4d4] px-2 py-0.5 text-[10.5px] font-medium tabular-nums">
                {t("handover.reference", { ref: reference })}
              </p>
            </div>
          </header>

          <div className="relative mt-5 h-[3px] bg-[#dc2028]" />

          <Section number="01" title={t("handover.sectionCustomer")}>
            <div className="grid grid-cols-2 gap-x-10">
              <Field label={t("handover.customer")} value={customerName} />
              <Field
                label={t("handover.phone")}
                value={record.customer.phone}
              />
              <Field label={t("handover.idDocument")} value={null} />
              <Field label={t("handover.licence")} value={null} />
            </div>
          </Section>

          <Section number="02" title={t("handover.sectionVehicle")}>
            <div className="grid grid-cols-2 gap-x-10">
              <Field
                label={t("handover.vehicle")}
                value={`${record.vehicle.brand} ${record.vehicle.model} (${record.vehicle.year})`}
              />
              <Field
                label={t("handover.plate")}
                value={record.vehicle.plate ?? null}
              />
              <Field
                label={t("handover.period")}
                value={`${formatRentalPeriod(pickupDay, returnDay, dateLocale)} · ${t(
                  "handover.days",
                  { count: rentalDays(record.pickupDate, record.returnDate) }
                )}`}
              />
              <Field
                label={
                  isPickup ? t("handover.handedOver") : t("handover.returnedAt")
                }
                value={when ? stamp(when) : null}
              />
            </div>
          </Section>

          <Section number="03" title={t("handover.condition")}>
            {/* The two readings that settle most disputes, given room. */}
            <div className="grid grid-cols-2 gap-px bg-[#e5e5e5]">
              <Reading label={t("handover.mileage")}>
                {inspection ? (
                  <>
                    {formatNumber(inspection.mileage, locale)}
                    <span className="ml-1 text-[12px] font-medium text-[#737373]">
                      km
                    </span>
                  </>
                ) : null}
              </Reading>
              <Reading label={t("handover.fuel")}>
                {inspection ? (
                  <span className="flex items-center gap-3">
                    <span>{inspection.fuelLevel}%</span>
                    <span
                      aria-hidden
                      className="relative h-2 flex-1 bg-[#e5e5e5]"
                    >
                      <span
                        className="absolute inset-y-0 left-0 bg-[#dc2028]"
                        style={{ width: `${inspection.fuelLevel}%` }}
                      />
                    </span>
                  </span>
                ) : null}
              </Reading>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-10">
              <Notes
                label={t("handover.exterior")}
                text={inspection?.exteriorNotes}
                recorded={!!inspection}
                none={t("handover.noRemarks")}
              />
              <Notes
                label={t("handover.interior")}
                text={inspection?.interiorNotes}
                recorded={!!inspection}
                none={t("handover.noRemarks")}
              />
            </div>
            <Notes
              label={t("handover.damage")}
              text={
                inspection
                  ? inspection.damageFound
                    ? inspection.damageNotes || t("handover.damageYes")
                    : t("handover.noDamage")
                  : null
              }
              recorded={!!inspection}
              none={t("handover.noRemarks")}
            />
            {inspection && inspection.photos.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[10.5px] text-[#737373]">
                  {t("handover.photos", { count: inspection.photos.length })}
                </p>
                <div className="grid grid-cols-6 gap-1.5">
                  {inspection.photos.slice(0, 12).map((photo) => (
                    // A plain <img>: next/image would lazy-load, and a photo
                    // still loading when the dialog opens prints as a hole.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={photo.id}
                      src={photo.url}
                      alt=""
                      className="aspect-square w-full border border-[#e5e5e5] object-cover"
                    />
                  ))}
                </div>
              </div>
            )}
            {inspection && (
              <p className="mt-2.5 text-[10.5px] text-[#737373]">
                {t("handover.recordedBy", {
                  name: inspection.createdBy.name,
                  signer: inspection.signerName,
                  time: stamp(inspection.acknowledgedAt),
                })}
              </p>
            )}
          </Section>

          <Section number="04" title={t("handover.sectionStatement")} last>
            <p>
              {isPickup
                ? t("handover.statementPickup", { name: customerName })
                : t("handover.statementReturn", { name: customerName })}
            </p>
            <p className="mt-1.5 text-[10.5px] text-[#737373]">
              {t("handover.statementNote")}
            </p>
          </Section>

          {/* Pushed to the foot of the page: the signatures sit where a
              signature is expected, whatever the length of the notes. */}
          <section className="relative mt-auto grid break-inside-avoid grid-cols-2 gap-12 pt-8">
            <Signature
              role={t("handover.customerSignature")}
              name={inspection?.signerName ?? customerName}
              date={signedOn}
            />
            <Signature
              role={t("handover.staffSignature")}
              name={inspection?.createdBy.name ?? null}
              date={signedOn}
            />
          </section>

          <footer className="relative mt-8 flex items-center justify-between gap-4 border-t border-[#e5e5e5] pt-3 text-[10px] text-[#737373]">
            <span>
              <span className="font-semibold text-[#404040]">
                ALFA <span className={RED}>RENT</span>
              </span>{" "}
              · {t("handover.thanks")}
            </span>
            <span className="tabular-nums">{reference}</span>
          </footer>
        </article>
      </div>
    </main>
  );
}

/** A numbered section with a quiet uppercase title. */
function Section({
  number,
  title,
  last = false,
  children,
}: {
  number: string;
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`relative break-inside-avoid py-4 ${last ? "" : "border-b border-[#e5e5e5]"}`}
    >
      <h2 className="mb-2.5 flex items-baseline gap-2 text-[10.5px] font-bold tracking-[0.14em] uppercase">
        <span className={`tabular-nums ${RED}`}>{number}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A labelled value, or a blank line to write on when there is none yet. */
function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline gap-2 py-1">
      <span className="shrink-0 text-[10.5px] text-[#737373]">{label}</span>
      {value ? (
        <span className="font-semibold">{value}</span>
      ) : (
        <span
          aria-hidden
          className="h-5 flex-1 border-b border-dotted border-[#a3a3a3]"
        />
      )}
    </div>
  );
}

/** A reading given weight: the label small, the figure large. */
function Reading({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#fafafa] px-4 py-3">
      <p className="text-[10px] font-semibold tracking-[0.1em] text-[#737373] uppercase">
        {label}
      </p>
      <div className="font-display mt-1 h-7 text-[20px] leading-7 font-bold tabular-nums">
        {children ?? (
          <span
            aria-hidden
            className="block h-6 border-b border-dotted border-[#a3a3a3]"
          />
        )}
      </div>
    </div>
  );
}

/**
 * Notes. Once the inspection is recorded, an empty note says so in words
 * rather than leaving lines that invite writing after the fact; before it,
 * two blank lines for handwriting.
 */
function Notes({
  label,
  text,
  recorded,
  none,
}: {
  label: string;
  text?: string | null;
  recorded: boolean;
  none: string;
}) {
  return (
    <div className="mt-2">
      <p className="text-[10.5px] text-[#737373]">{label}</p>
      {text ? (
        <p className="font-medium whitespace-pre-line">{text}</p>
      ) : recorded ? (
        <p className="text-[#737373]">{none}</p>
      ) : (
        <div aria-hidden>
          <div className="h-6 border-b border-dotted border-[#a3a3a3]" />
          <div className="h-6 border-b border-dotted border-[#a3a3a3]" />
        </div>
      )}
    </div>
  );
}

/**
 * Who signs and on what day, already written under the line; only the
 * signature itself is left for the pen.
 */
function Signature({
  role,
  name,
  date,
}: {
  role: string;
  name: string | null;
  date: string;
}) {
  return (
    <div className="break-inside-avoid">
      <p className="text-[10px] font-bold tracking-[0.14em] text-[#737373] uppercase">
        {role}
      </p>
      <div className="mt-12 border-b border-[#171717]" />
      <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[11px]">
        {name ? (
          <span className="font-semibold">{name}</span>
        ) : (
          <span
            aria-hidden
            className="inline-block h-4 w-36 border-b border-dotted border-[#a3a3a3]"
          />
        )}
        <span className="text-[#737373] tabular-nums">{date}</span>
      </div>
    </div>
  );
}
