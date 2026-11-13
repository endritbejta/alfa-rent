import { format, parseISO } from "date-fns";
import { sq as sqDateLocale, enUS } from "date-fns/locale";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { parseRecipients, sendEmail, type SendResult } from "@/lib/email";
import {
  EMAIL_COLORS,
  EMAIL_FONT,
  emailCarPhotoUrl,
  escapeHtml,
} from "@/lib/email/html";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import {
  dictionaries,
  translate,
  type TranslationKey,
} from "@/lib/i18n/translations";
import { formatEur } from "@/lib/money";
import { rentalDays } from "@/lib/rental-dates";
import { rentalCalendarDay } from "@/lib/business-time";
import { vehicleLabel } from "@/lib/vehicle-label";
import {
  reservationContactDifference,
  CONTACT_SNAPSHOT_SELECT,
  type ContactDifference,
} from "@/lib/booking-contact";

/**
 * Staff work in Albanian, the app's default language. A single constant so
 * the day the team wants English mail is a one-line change.
 */
const STAFF_LOCALE: Locale = DEFAULT_LOCALE;

export type BookingRequestEmailData = {
  reservationId: string;
  vehicle: {
    brand: string;
    model: string;
    plate: string | null;
    year: number;
    /** The cover photo's Cloudinary URL, when the car has one. */
    imageUrl: string | null;
  };
  /** The customer on file the request was linked to. */
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  /**
   * Set when the request carried other contact details than `customer`. The
   * email then leads with what was submitted — that is who asked, and the
   * number that will answer — and lists the differing details on file below.
   */
  contactDifference?: ContactDifference | null;
  pickupDate: Date;
  returnDate: Date;
  totalPrice: Prisma.Decimal | number;
  notes: string | null;
  /** Absolute link to the reservation in the admin, when the app URL is known. */
  adminUrl: string | null;
};

export { emailCarPhotoUrl };

const C = EMAIL_COLORS;
const FONT = EMAIL_FONT;

/**
 * The staff notification for a new website booking request, as subject,
 * HTML and plain text. Pure, so its content is unit-tested without a
 * database or a mail provider.
 *
 * Built for mail clients, not browsers: table layout, inline styles, no web
 * fonts, and it still reads in full with images blocked (the wordmark is
 * text, the photo has alt text and sits on a dark block).
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
  const day = (date: Date, pattern: string) =>
    format(parseISO(rentalCalendarDay(date)), pattern, { locale: dateLocale });

  const vehicle = vehicleLabel(data.vehicle);
  const carName = `${data.vehicle.brand} ${data.vehicle.model}`;
  const carMeta = [data.vehicle.plate, String(data.vehicle.year)]
    .filter(Boolean)
    .join(" · ");
  const difference = data.contactDifference ?? null;
  const who = difference?.submitted ?? data.customer;
  const name = `${who.firstName} ${who.lastName}`.trim();
  // Only the fields that disagree, so a matching email is not repeated.
  const onFile = difference
    ? [
        difference.name
          ? `${difference.onFile.firstName} ${difference.onFile.lastName}`.trim()
          : null,
        difference.phone ? difference.onFile.phone : null,
        difference.email ? difference.onFile.email : null,
      ].filter((value): value is string => !!value)
    : [];
  const days = rentalDays(data.pickupDate, data.returnDate);
  const duration =
    days === 1 ? t("email.oneDay") : t("email.days", { count: days });
  const total = formatEur(data.totalPrice, locale);
  const pickupLong = day(data.pickupDate, "EEE, dd MMM yyyy");
  const returnLong = day(data.returnDate, "EEE, dd MMM yyyy");
  const photo = emailCarPhotoUrl(data.vehicle.imageUrl);

  const subject = t("email.newBookingSubject", { vehicle, name });
  const cta = t("email.openInAdmin");
  const preheader = `${name} · ${carName} · ${day(data.pickupDate, "dd MMM")} – ${day(data.returnDate, "dd MMM")} · ${total}`;

  const text = [
    `${t("email.newRequestBadge")} — ${t("email.newBookingIntro")}`,
    "",
    vehicle,
    `${pickupLong} → ${returnLong} (${duration})`,
    `${t("email.total")}: ${total}`,
    "",
    t("email.customer"),
    name,
    who.phone,
    who.email,
    ...(onFile.length > 0
      ? [
          "",
          t("email.contactDiffers"),
          `${t("email.contactOnFile")}: ${onFile.join(" · ")}`,
        ]
      : []),
    ...(data.notes ? ["", t("email.notes"), data.notes] : []),
    ...(data.adminUrl ? ["", `${cta}: ${data.adminUrl}`] : []),
    "",
    t("email.footer"),
  ].join("\n");

  const e = escapeHtml;
  const label = (value: string) =>
    `<div style="font-size:11px;line-height:16px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted}">${e(value)}</div>`;
  const phoneHref = `tel:${who.phone.replace(/[^\d+]/g, "")}`;

  const photoBlock = photo
    ? `<img src="${e(photo)}" width="560" alt="${e(carName)}" style="display:block;width:100%;max-width:560px;height:auto;border:0;background:${C.photo}">`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:${C.photo};padding:56px 24px;font-family:${FONT};font-size:13px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:#a8a2a1">${e(data.vehicle.brand)}</td></tr></table>`;

  const tripBlock =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft};border:1px solid ${C.line};border-radius:12px">` +
    `<tr>` +
    `<td width="50%" valign="top" style="padding:16px 18px">${label(t("email.pickup"))}<div style="margin-top:4px;font-size:16px;line-height:22px;font-weight:700;color:${C.ink}">${e(pickupLong)}</div></td>` +
    `<td width="50%" valign="top" style="padding:16px 18px;border-left:1px solid ${C.line}">${label(t("email.return"))}<div style="margin-top:4px;font-size:16px;line-height:22px;font-weight:700;color:${C.ink}">${e(returnLong)}</div></td>` +
    `</tr>` +
    `<tr><td colspan="2" style="border-top:1px solid ${C.line};padding:14px 18px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="font-size:14px;color:${C.muted}">${e(t("email.total"))} · ${e(duration)}</td>` +
    `<td align="right" style="font-size:22px;line-height:28px;font-weight:800;color:${C.ink}">${e(total)}</td>` +
    `</tr></table></td></tr></table>`;

  const customerBlock =
    `<div style="margin-top:24px">${label(t("email.customer"))}` +
    `<div style="margin-top:6px;font-size:16px;line-height:22px;font-weight:700;color:${C.ink}">${e(name)}</div>` +
    `<div style="margin-top:4px;font-size:14px;line-height:22px"><a href="${e(phoneHref)}" style="color:${C.brand};text-decoration:none;font-weight:600">${e(who.phone)}</a></div>` +
    `<div style="font-size:14px;line-height:22px"><a href="mailto:${e(who.email)}" style="color:${C.brand};text-decoration:none">${e(who.email)}</a></div>` +
    (onFile.length > 0
      ? `<div style="margin-top:12px;background:${C.pendingBg};border-radius:8px;padding:10px 14px;font-size:13px;line-height:20px;color:${C.pendingInk}">` +
        `<div style="font-weight:700">${e(t("email.contactDiffers"))}</div>` +
        `<div style="margin-top:2px">${e(t("email.contactOnFile"))}: ${onFile.map(e).join(" · ")}</div>` +
        `</div>`
      : "") +
    `</div>`;

  const notesBlock = data.notes
    ? `<div style="margin-top:20px;background:${C.soft};border-left:3px solid ${C.line};border-radius:8px;padding:12px 16px">${label(t("email.notes"))}<div style="margin-top:4px;font-size:14px;line-height:21px;color:${C.ink};white-space:pre-wrap">${e(data.notes)}</div></div>`
    : "";

  // A table-based button: Outlook ignores padding on <a>.
  const ctaBlock = data.adminUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px"><tr><td align="center" bgcolor="${C.brand}" style="border-radius:10px"><a href="${e(data.adminUrl)}" style="display:block;padding:14px 20px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">${e(cta)}</a></td></tr></table>`
    : "";

  const html =
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">` +
    `<title>${e(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${C.page}">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${e(preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:32px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:${FONT};color:${C.ink}">` +
    // Header: text wordmark, so it survives blocked images.
    `<tr><td style="padding:0 4px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="font-size:18px;font-weight:800;letter-spacing:0.04em;color:${C.ink}">ALFA <span style="color:${C.brand}">RENT</span></td>` +
    `<td align="right"><span style="display:inline-block;background:${C.pendingBg};color:${C.pendingInk};font-size:12px;font-weight:700;padding:5px 12px;border-radius:999px">${e(t("email.newRequestBadge"))}</span></td>` +
    `</tr></table></td></tr>` +
    // Card
    `<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:16px;overflow:hidden">` +
    photoBlock +
    `<div style="padding:26px 28px 30px">` +
    `<div style="font-size:24px;line-height:30px;font-weight:800;color:${C.ink}">${e(carName)}</div>` +
    (carMeta
      ? `<div style="margin-top:2px;font-size:13px;line-height:20px;color:${C.muted};font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${e(carMeta)}</div>`
      : "") +
    `<p style="margin:14px 0 20px;font-size:14px;line-height:21px;color:${C.muted}">${e(t("email.newBookingIntro"))}</p>` +
    tripBlock +
    customerBlock +
    notesBlock +
    ctaBlock +
    `</div></td></tr>` +
    // Footer
    `<tr><td align="center" style="padding:20px 24px 0;font-size:12px;line-height:18px;color:${C.muted}">${e(t("email.footer"))}</td></tr>` +
    `</table></td></tr></table></body></html>`;

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
        select: {
          brand: true,
          model: true,
          plate: true,
          year: true,
          images: {
            take: 1,
            orderBy: { sortOrder: "asc" },
            select: { url: true },
          },
        },
      },
      ...CONTACT_SNAPSHOT_SELECT,
      customer: {
        select: { firstName: true, lastName: true, email: true, phone: true },
      },
    },
  });
  if (!reservation) return "skipped";
  const contactDifference = reservationContactDifference(reservation);

  const message = buildStaffBookingEmail({
    reservationId: reservation.id,
    vehicle: {
      brand: reservation.vehicle.brand,
      model: reservation.vehicle.model,
      plate: reservation.vehicle.plate,
      year: reservation.vehicle.year,
      imageUrl: reservation.vehicle.images[0]?.url ?? null,
    },
    customer: reservation.customer,
    contactDifference,
    pickupDate: reservation.pickupDate,
    returnDate: reservation.returnDate,
    totalPrice: reservation.totalPrice,
    notes: reservation.notes,
    adminUrl: adminReservationUrl(reservation.id),
  });

  // Replies go to whoever sent the request, which is the submitted address.
  return sendEmail({
    to,
    ...message,
    replyTo: contactDifference?.submitted.email ?? reservation.customer.email,
  });
}
