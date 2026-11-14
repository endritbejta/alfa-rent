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
import { formatRentalPeriod } from "@/app/(dashboard)/admin/reservations/format-day";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Handover",
  robots: { index: false, follow: false },
};

/**
 * The vehicle handover sheet: a printed page the customer signs to confirm
 * they received the car in the condition written on it — and, once it is
 * back, that they returned it in the condition recorded then.
 *
 * Outside the admin shell (its own route group) so it prints as a clean A4
 * page with no sidebar, but still under /admin, so the proxy's session
 * perimeter covers it, and the page checks the user itself as well.
 *
 * Filled from the pickup (or return) inspection when one has been recorded.
 * Before that, the condition fields are blank lines to fill in by hand at the
 * counter, so the sheet can be printed ahead of the handover.
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

  return (
    <main className="bg-background text-foreground min-h-screen print:bg-white print:text-black">
      <div className="mx-auto max-w-[210mm] px-6 py-8 print:max-w-none print:p-0">
        <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
          <p className="text-muted-foreground text-sm">
            {t("handover.screenHint")}
          </p>
          <PrintButton label={t("handover.print")} />
        </div>

        {/* The marker the admin's print frame waits for: it proves the
            response is this reservation's sheet, of this type, and not a
            sign-in page or an error, before print() is called on it. */}
        <article
          data-print-sheet={record.id}
          data-print-type={type}
          className="bg-card border p-8 text-[13px] leading-relaxed print:border-0 print:bg-transparent print:p-0"
        >
          <header className="flex items-start justify-between gap-6 border-b-2 border-current pb-4">
            <div>
              <p className="font-display text-xl font-semibold tracking-tight">
                ALFA RENT <span className="font-normal">a Car</span>
              </p>
              <p className="text-muted-foreground text-xs print:text-black">
                {[
                  publicContact.address,
                  publicContact.phone,
                  publicContact.email,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="text-right">
              <h1 className="font-display text-lg font-semibold">
                {isPickup
                  ? t("handover.titlePickup")
                  : t("handover.titleReturn")}
              </h1>
              <p className="text-xs tabular-nums">
                {t("handover.reference", {
                  ref: record.id.slice(-8).toUpperCase(),
                })}
              </p>
            </div>
          </header>

          <section className="grid grid-cols-2 gap-x-8 gap-y-1 border-b py-4">
            <Field label={t("handover.customer")} value={customerName} />
            <Field label={t("handover.phone")} value={record.customer.phone} />
            <Field label={t("handover.idDocument")} value={null} />
            <Field label={t("handover.licence")} value={null} />
          </section>

          <section className="grid grid-cols-2 gap-x-8 gap-y-1 border-b py-4">
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
          </section>

          <section className="border-b py-4">
            <h2 className="mb-3 text-xs font-semibold tracking-[0.14em] uppercase">
              {t("handover.condition")}
            </h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1">
              <Field
                label={t("handover.mileage")}
                value={
                  inspection
                    ? `${formatNumber(inspection.mileage, locale)} km`
                    : null
                }
              />
              <Field
                label={t("handover.fuel")}
                value={inspection ? `${inspection.fuelLevel}%` : null}
              />
            </div>
            <Notes
              label={t("handover.exterior")}
              text={inspection?.exteriorNotes}
            />
            <Notes
              label={t("handover.interior")}
              text={inspection?.interiorNotes}
            />
            <Notes
              label={t("handover.damage")}
              text={
                inspection
                  ? inspection.damageFound
                    ? inspection.damageNotes || t("handover.damageYes")
                    : t("handover.noDamage")
                  : null
              }
            />
            {inspection && inspection.photos.length > 0 && (
              <div className="mt-3">
                <p className="text-muted-foreground mb-2 text-xs print:text-black">
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
                      className="aspect-square w-full border object-cover"
                    />
                  ))}
                </div>
              </div>
            )}
            {inspection && (
              <p className="text-muted-foreground mt-3 text-xs print:text-black">
                {t("handover.recordedBy", {
                  name: inspection.createdBy.name,
                  signer: inspection.signerName,
                  time: stamp(inspection.acknowledgedAt),
                })}
              </p>
            )}
          </section>

          <section className="py-5">
            <p>
              {isPickup
                ? t("handover.statementPickup", { name: customerName })
                : t("handover.statementReturn", { name: customerName })}
            </p>
            <p className="text-muted-foreground mt-2 text-xs print:text-black">
              {t("handover.statementNote")}
            </p>
          </section>

          <section className="grid grid-cols-2 gap-10 pt-6">
            <Signature
              role={t("handover.customerSignature")}
              name={inspection?.signerName ?? customerName}
              dateLabel={t("handover.date")}
              nameLabel={t("handover.nameLabel")}
            />
            <Signature
              role={t("handover.staffSignature")}
              name={inspection?.createdBy.name ?? null}
              dateLabel={t("handover.date")}
              nameLabel={t("handover.nameLabel")}
            />
          </section>
        </article>
      </div>
    </main>
  );
}

/** A labelled value, or a blank line to write on when there is none yet. */
function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline gap-2 py-1">
      <span className="text-muted-foreground shrink-0 text-xs print:text-black">
        {label}:
      </span>
      {value ? (
        <span className="font-medium">{value}</span>
      ) : (
        <span
          aria-hidden
          className="h-5 flex-1 border-b border-dotted border-current"
        />
      )}
    </div>
  );
}

/** Notes, or two blank lines for handwriting. */
function Notes({ label, text }: { label: string; text?: string | null }) {
  return (
    <div className="mt-2">
      <p className="text-muted-foreground text-xs print:text-black">{label}:</p>
      {text ? (
        <p className="whitespace-pre-line">{text}</p>
      ) : (
        <div aria-hidden>
          <div className="h-6 border-b border-dotted border-current" />
          <div className="h-6 border-b border-dotted border-current" />
        </div>
      )}
    </div>
  );
}

function Signature({
  role,
  name,
  dateLabel,
  nameLabel,
}: {
  role: string;
  name: string | null;
  dateLabel: string;
  nameLabel: string;
}) {
  return (
    <div className="break-inside-avoid">
      <div className="h-14 border-b border-current" />
      <p className="mt-1 text-xs font-semibold">{role}</p>
      <p className="text-xs">
        {nameLabel}: {name ?? "______________________"}
      </p>
      <p className="mt-3 text-xs">{dateLabel}: ______________________</p>
    </div>
  );
}
