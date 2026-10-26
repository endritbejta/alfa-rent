import { format, parseISO } from "date-fns";
import { sq as sqDateLocale, enUS } from "date-fns/locale";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { parseRecipients, sendEmail, type SendResult } from "@/lib/email";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import {
  dictionaries,
  translate,
  type TranslationKey,
} from "@/lib/i18n/translations";
import { formatEur } from "@/lib/money";
import { rentalCalendarDay } from "@/lib/reservation-lifecycle";
import { vehicleLabel } from "@/lib/vehicle-label";

/**
 * Staff work in Albanian, the app's default language. A single constant so
 * the day the team wants English mail is a one-line change.
 */
const STAFF_LOCALE: Locale = DEFAULT_LOCALE;

export type BookingRequestEmailData = {
  reservationId: string;
  vehicle: { brand: string; model: string; plate: string | null; year: number };
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  pickupDate: Date;
  returnDate: Date;
  totalPrice: Prisma.Decimal | number;
  notes: string | null;
  /** Absolute link to the reservation in the admin, when the app URL is known. */
  adminUrl: string | null;
};

/** Customer-typed text goes into HTML; none of it may become markup. */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * The staff notification for a new website booking request, as subject,
 * HTML and plain text. Pure, so its content is unit-tested without a
 * database or a mail provider.
 */
export function buildStaffBookingEmail(
  data: BookingRequestEmailData,
  locale: Locale = STAFF_LOCALE
) {
  const t = (key: TranslationKey, values?: Record<string, string | number>) =>
    translate(dictionaries[locale], key, values);
  const dateLocale = locale === "sq" ? sqDateLocale : enUS;
  // Rental dates are stored as UTC calendar values; format the calendar day
  // itself so a UTC server never shifts a pickup onto the previous day.
  const day = (date: Date) =>
    format(parseISO(rentalCalendarDay(date)), "EEE, dd MMM yyyy", {
      locale: dateLocale,
    });

  const vehicle = vehicleLabel(data.vehicle);
  const name = `${data.customer.firstName} ${data.customer.lastName}`.trim();
  const rows: [string, string][] = [
    [t("email.vehicle"), vehicle],
    [t("email.pickup"), day(data.pickupDate)],
    [t("email.return"), day(data.returnDate)],
    [t("email.total"), formatEur(data.totalPrice, locale)],
    [t("email.customer"), name],
    [t("email.phone"), data.customer.phone],
    [t("email.email"), data.customer.email],
    ...(data.notes
      ? ([[t("email.notes"), data.notes]] as [string, string][])
      : []),
  ];

  const subject = t("email.newBookingSubject", { vehicle, name });
  const intro = t("email.newBookingIntro");
  const cta = t("email.openInAdmin");

  const text = [
    intro,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(data.adminUrl ? ["", `${cta}: ${data.adminUrl}`] : []),
  ].join("\n");

  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#6b6b6b;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td>` +
        `<td style="padding:6px 0;color:#161414;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`
    )
    .join("");
  const button = data.adminUrl
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(data.adminUrl)}" style="display:inline-block;background:#dc2028;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">${escapeHtml(cta)}</a></p>`
    : "";
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#161414">` +
    `<p style="margin:0 0 16px">${escapeHtml(intro)}</p>` +
    `<table style="border-collapse:collapse">${htmlRows}</table>` +
    button +
    `</div>`;

  return { subject, text, html };
}

/** Where the admin lives, from the same setting Auth.js uses. */
function adminReservationUrl(reservationId: string): string | null {
  const base = process.env.AUTH_URL?.trim();
  if (!base) return null;
  try {
    const url = new URL("/admin/reservations", base);
    url.searchParams.set("reservation", reservationId);
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Tells staff a customer has asked for a car on the website. Called after
 * the booking response has gone out, so it never delays or fails a booking.
 * Off unless STAFF_NOTIFICATION_EMAILS lists at least one address.
 */
export async function notifyStaffOfBookingRequest(
  reservationId: string
): Promise<SendResult> {
  const to = parseRecipients(process.env.STAFF_NOTIFICATION_EMAILS);
  if (to.length === 0) return "skipped";

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      pickupDate: true,
      returnDate: true,
      totalPrice: true,
      notes: true,
      vehicle: {
        select: { brand: true, model: true, plate: true, year: true },
      },
      customer: {
        select: { firstName: true, lastName: true, email: true, phone: true },
      },
    },
  });
  if (!reservation) return "skipped";

  const message = buildStaffBookingEmail({
    reservationId: reservation.id,
    vehicle: reservation.vehicle,
    customer: reservation.customer,
    pickupDate: reservation.pickupDate,
    returnDate: reservation.returnDate,
    totalPrice: reservation.totalPrice,
    notes: reservation.notes,
    adminUrl: adminReservationUrl(reservation.id),
  });

  return sendEmail({ to, ...message, replyTo: reservation.customer.email });
}
