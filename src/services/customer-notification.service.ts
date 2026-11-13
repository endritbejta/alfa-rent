import { format, parseISO } from "date-fns";
import { sq as sqDateLocale, enUS } from "date-fns/locale";
import type { Prisma, ReservationStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isEmailConfigured, sendEmail, type SendResult } from "@/lib/email";
import {
  EMAIL_COLORS as C,
  EMAIL_FONT as FONT,
  emailCarPhotoUrl,
  escapeHtml,
} from "@/lib/email/html";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";
import {
  dictionaries,
  translate,
  type TranslationKey,
} from "@/lib/i18n/translations";
import { formatEur } from "@/lib/money";
import { rentalDays } from "@/lib/rental-dates";
import {
  businessTodayAsRentalDate,
  rentalCalendarDay,
} from "@/lib/reservation-lifecycle";
import { publicContact } from "@/lib/site-config";
import { absoluteUrl } from "@/lib/site-url";

/**
 * Emails to the customer about their own booking (audit finding P2-13).
 *
 * Before these, the reference existed only on the confirmation screen: a
 * customer who closed the tab had no record of asking, and called or asked
 * again. Four messages, one per moment the customer would otherwise not know
 * about:
 *
 * - `received`  — the public request was saved; it is not a booking yet.
 * - `confirmed` — staff confirmed it.
 * - `cancelled` — staff cancelled it (pending or confirmed).
 * - `expired`   — its pickup day passed without a decision (the daily sweep).
 *
 * Who gets them: only reservations made through the public form, addressed
 * to the contact snapshot — what the customer typed for *this* request, not
 * the customer record it was linked to, which staff may have edited or
 * merged since. Staff bookings have no snapshot and get nothing: the
 * customer was on the phone or at the counter. An anonymised customer gets
 * nothing, whatever is left on the row.
 *
 * The staff cancellation reason never appears. It is an internal note
 * (often naming the reason a customer was turned down) written for the
 * audit trail, not for the customer, so the email says neutrally that the
 * booking was cancelled and how to reach the branch.
 *
 * Every send runs after the response (`after()` in the route and the status
 * action), and `sendEmail` never throws, so a slow or failing provider can
 * delay or fail neither the booking nor the staff action.
 */

export type CustomerEmailKind =
  "received" | "confirmed" | "cancelled" | "expired";

export type CustomerEmailData = {
  /** The reservation id: what the confirmation screen calls the reference. */
  reference: string;
  firstName: string;
  vehicle: {
    brand: string;
    model: string;
    /** The cover photo's Cloudinary URL, when the car has one. */
    imageUrl: string | null;
  };
  pickupDate: Date;
  returnDate: Date;
  totalPrice: Prisma.Decimal | number;
  /** The branch's public phone, when one is configured. */
  contactPhone: string | null;
  /** Where "see available cars" leads, when the site URL is known. */
  carsUrl: string | null;
};

/** The stored booking language, or the default for older and staff rows. */
export function customerLocale(stored: string | null | undefined): Locale {
  return stored && isLocale(stored) ? stored : DEFAULT_LOCALE;
}

const COPY: Record<
  CustomerEmailKind,
  {
    subject: TranslationKey;
    badge: TranslationKey;
    heading: TranslationKey;
    intro: TranslationKey;
    tone: "pending" | "confirmed" | "cancelled";
    photo: boolean;
    browse: boolean;
  }
> = {
  received: {
    subject: "customerEmail.receivedSubject",
    badge: "customerEmail.receivedBadge",
    heading: "customerEmail.receivedHeading",
    intro: "customerEmail.receivedIntro",
    tone: "pending",
    photo: true,
    browse: false,
  },
  confirmed: {
    subject: "customerEmail.confirmedSubject",
    badge: "customerEmail.confirmedBadge",
    heading: "customerEmail.confirmedHeading",
    intro: "customerEmail.confirmedIntro",
    tone: "confirmed",
    photo: true,
    browse: false,
  },
  cancelled: {
    subject: "customerEmail.cancelledSubject",
    badge: "customerEmail.cancelledBadge",
    heading: "customerEmail.cancelledHeading",
    intro: "customerEmail.cancelledIntro",
    tone: "cancelled",
    photo: false,
    browse: true,
  },
  expired: {
    subject: "customerEmail.expiredSubject",
    badge: "customerEmail.expiredBadge",
    heading: "customerEmail.expiredHeading",
    intro: "customerEmail.expiredIntro",
    tone: "cancelled",
    photo: false,
    browse: true,
  },
};

const TONES = {
  pending: { ink: C.pendingInk, bg: C.pendingBg },
  confirmed: { ink: C.confirmedInk, bg: C.confirmedBg },
  cancelled: { ink: C.cancelledInk, bg: C.cancelledBg },
} as const;

/**
 * One customer email as subject, HTML and plain text. Pure, so language,
 * escaping and the figures are unit-tested without a database or provider.
 *
 * The same mail-client rules as the staff email: tables, inline styles, a
 * text wordmark, and nothing that needs images to be read. The only remote
 * image is the car's photo, which the staff email already sends, and only
 * in the two messages about a booking that is going ahead.
 */
export function buildCustomerEmail(
  kind: CustomerEmailKind,
  data: CustomerEmailData,
  locale: Locale
) {
  const copy = COPY[kind];
  const t = (key: TranslationKey, values?: Record<string, string | number>) =>
    translate(dictionaries[locale], key, values);
  const dateLocale = locale === "sq" ? sqDateLocale : enUS;
  // Rental dates are UTC calendar values; format the calendar day itself so
  // a UTC server never shifts a pickup onto the previous day.
  const day = (date: Date) =>
    format(parseISO(rentalCalendarDay(date)), "EEE, dd MMM yyyy", {
      locale: dateLocale,
    });

  // No plate: it is internal (audit P3-2), and means nothing to a customer.
  const carName = `${data.vehicle.brand} ${data.vehicle.model}`.trim();
  const name = data.firstName.trim();
  const days = rentalDays(data.pickupDate, data.returnDate);
  const duration =
    days === 1 ? t("email.oneDay") : t("email.days", { count: days });
  const total = formatEur(data.totalPrice, locale);
  const pickup = day(data.pickupDate);
  const dropoff = day(data.returnDate);
  const contactLine = data.contactPhone
    ? t("customerEmail.callUs", { phone: data.contactPhone })
    : t("customerEmail.quoteReference");
  const nextSteps =
    kind === "received"
      ? [
          t("customerEmail.nextCheck"),
          t("customerEmail.nextConfirm"),
          t("customerEmail.nextPay"),
        ]
      : [];
  const browseUrl = copy.browse ? data.carsUrl : null;

  const subject = t(copy.subject, { vehicle: carName });
  const heading = t(copy.heading, { name });
  const intro = t(copy.intro);
  const badge = t(copy.badge);
  const reference = t("customerEmail.reference");

  const text = [
    `${badge} — ${heading}`,
    "",
    intro,
    "",
    `${reference}: ${data.reference}`,
    carName,
    `${t("email.pickup")}: ${pickup}`,
    `${t("email.return")}: ${dropoff}`,
    `${t("email.total")} (${duration}): ${total}`,
    ...(nextSteps.length > 0
      ? ["", t("customerEmail.nextTitle"), ...nextSteps.map((s) => `- ${s}`)]
      : []),
    ...(browseUrl
      ? ["", `${t("customerEmail.browseCars")}: ${browseUrl}`]
      : []),
    "",
    contactLine,
    "",
    "Alfa Rent",
    t("customerEmail.footer"),
  ].join("\n");

  const e = escapeHtml;
  const tone = TONES[copy.tone];
  const label = (value: string) =>
    `<div style="font-size:11px;line-height:16px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted}">${e(value)}</div>`;
  const photo = copy.photo ? emailCarPhotoUrl(data.vehicle.imageUrl) : null;

  const photoBlock = photo
    ? `<img src="${e(photo)}" width="560" alt="${e(carName)}" style="display:block;width:100%;max-width:560px;height:auto;border:0;background:${C.photo}">`
    : "";

  const referenceBlock =
    `<div style="margin:20px 0 0;background:${C.soft};border:1px solid ${C.line};border-radius:12px;padding:14px 18px">` +
    label(reference) +
    `<div style="margin-top:4px;font-size:16px;line-height:22px;font-weight:700;color:${C.ink};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all">${e(data.reference)}</div>` +
    `</div>`;

  const tripBlock =
    `<div style="margin-top:24px;font-size:18px;line-height:24px;font-weight:800;color:${C.ink}">${e(carName)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;border:1px solid ${C.line};border-radius:12px">` +
    `<tr>` +
    `<td width="50%" valign="top" style="padding:14px 18px">${label(t("email.pickup"))}<div style="margin-top:4px;font-size:15px;line-height:21px;font-weight:700;color:${C.ink}">${e(pickup)}</div></td>` +
    `<td width="50%" valign="top" style="padding:14px 18px;border-left:1px solid ${C.line}">${label(t("email.return"))}<div style="margin-top:4px;font-size:15px;line-height:21px;font-weight:700;color:${C.ink}">${e(dropoff)}</div></td>` +
    `</tr>` +
    `<tr><td colspan="2" style="border-top:1px solid ${C.line};padding:12px 18px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="font-size:14px;color:${C.muted}">${e(t("email.total"))} · ${e(duration)}</td>` +
    `<td align="right" style="font-size:20px;line-height:26px;font-weight:800;color:${C.ink}">${e(total)}</td>` +
    `</tr></table></td></tr></table>`;

  const nextBlock =
    nextSteps.length > 0
      ? `<h2 style="margin:24px 0 8px;font-size:15px;line-height:22px;font-weight:700;color:${C.ink}">${e(t("customerEmail.nextTitle"))}</h2>` +
        `<ol style="margin:0;padding:0 0 0 20px;font-size:14px;line-height:22px;color:${C.ink}">` +
        nextSteps
          .map((step) => `<li style="margin:0 0 4px">${e(step)}</li>`)
          .join("") +
        `</ol>`
      : "";

  // A table-based button: Outlook ignores padding on <a>.
  const browseBlock = browseUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px"><tr><td align="center" bgcolor="${C.brand}" style="border-radius:10px"><a href="${e(browseUrl)}" style="display:block;padding:13px 20px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">${e(t("customerEmail.browseCars"))}</a></td></tr></table>`
    : "";

  const contactHtml = data.contactPhone
    ? e(contactLine).replace(
        e(data.contactPhone),
        `<a href="${e(`tel:${data.contactPhone.replace(/[^\d+]/g, "")}`)}" style="color:${C.brand};text-decoration:none;font-weight:700;white-space:nowrap">${e(data.contactPhone)}</a>`
      )
    : e(contactLine);

  const html =
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">` +
    `<title>${e(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${C.page}">` +
    // Preheader: the line inbox lists show beside the subject.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${e(`${reference} ${data.reference} · ${pickup} – ${dropoff} · ${total}`)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:32px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:${FONT};color:${C.ink}">` +
    `<tr><td style="padding:0 4px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="font-size:18px;font-weight:800;letter-spacing:0.04em;color:${C.ink}">ALFA <span style="color:${C.brand}">RENT</span></td>` +
    `<td align="right"><span style="display:inline-block;background:${tone.bg};color:${tone.ink};font-size:12px;font-weight:700;padding:5px 12px;border-radius:999px">${e(badge)}</span></td>` +
    `</tr></table></td></tr>` +
    `<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:16px;overflow:hidden">` +
    photoBlock +
    `<div style="padding:26px 28px 30px">` +
    `<h1 style="margin:0;font-size:22px;line-height:29px;font-weight:800;color:${C.ink}">${e(heading)}</h1>` +
    `<p style="margin:12px 0 0;font-size:15px;line-height:23px;color:${C.muted}">${e(intro)}</p>` +
    referenceBlock +
    tripBlock +
    nextBlock +
    browseBlock +
    `<p style="margin:24px 0 0;font-size:14px;line-height:21px;color:${C.ink}">${contactHtml}</p>` +
    `</div></td></tr>` +
    `<tr><td align="center" style="padding:20px 24px 0;font-size:12px;line-height:18px;color:${C.muted}">${e(t("customerEmail.footer"))}</td></tr>` +
    `</table></td></tr></table></body></html>`;

  return { subject, text, html };
}

/** Everything a customer email needs from a reservation, and no more. */
const CUSTOMER_EMAIL_SELECT = {
  id: true,
  status: true,
  locale: true,
  pickupDate: true,
  returnDate: true,
  totalPrice: true,
  expiryNotifiedAt: true,
  contactFirstName: true,
  contactEmail: true,
  customer: { select: { anonymisedAt: true } },
  vehicle: {
    select: {
      brand: true,
      model: true,
      images: {
        take: 1,
        orderBy: { sortOrder: "asc" },
        select: { url: true },
      },
    },
  },
} as const satisfies Prisma.ReservationSelect;

type CustomerEmailRow = Prisma.ReservationGetPayload<{
  select: typeof CUSTOMER_EMAIL_SELECT;
}>;

/** Whether the reservation's state still matches the email about it. */
function stillTrue(kind: CustomerEmailKind, row: CustomerEmailRow): boolean {
  const expected: Partial<Record<CustomerEmailKind, ReservationStatus>> = {
    confirmed: "CONFIRMED",
    cancelled: "CANCELLED",
    expired: "PENDING",
  };
  const status = expected[kind];
  if (status && row.status !== status) return false;
  // A lapsed request the sweep already explained is not cancelled twice.
  if (kind === "cancelled" && row.expiryNotifiedAt) return false;
  return true;
}

let reportedUnconfigured = false;

async function sendCustomerEmail(
  kind: CustomerEmailKind,
  row: CustomerEmailRow
): Promise<SendResult> {
  const to = row.contactEmail?.trim();
  if (!to || !row.contactFirstName || row.customer.anonymisedAt) {
    return "skipped";
  }
  if (!stillTrue(kind, row)) return "skipped";

  const message = buildCustomerEmail(
    kind,
    {
      reference: row.id,
      firstName: row.contactFirstName,
      vehicle: {
        brand: row.vehicle.brand,
        model: row.vehicle.model,
        imageUrl: row.vehicle.images[0]?.url ?? null,
      },
      pickupDate: row.pickupDate,
      returnDate: row.returnDate,
      totalPrice: row.totalPrice,
      contactPhone: publicContact.phone,
      carsUrl: absoluteUrl("/car"),
    },
    customerLocale(row.locale)
  );

  if (!isEmailConfigured() && !reportedUnconfigured) {
    // Once per server instance, like a missing optional feature: not an
    // error. (Dev bundles the route and the actions apart, so twice there.)
    reportedUnconfigured = true;
    console.info(
      "Customer emails are off: RESEND_API_KEY and EMAIL_FROM are not both set."
    );
  }

  // Replies reach the branch's public inbox, when there is one; otherwise
  // they go to EMAIL_FROM, which the operator chose.
  const result = await sendEmail({
    to: [to],
    ...message,
    replyTo: publicContact.email ?? undefined,
  });

  if (process.env.NODE_ENV === "development") {
    // Proof in a dev log that the message was built, without a body or a
    // full address: the subject names only the car.
    console.info(
      `[customer-email] ${kind} ${row.id} "${message.subject}" → *@${to.split("@").pop()} (${result})`
    );
  }
  return result;
}

async function loadRow(reservationId: string) {
  return prisma.reservation.findUnique({
    where: { id: reservationId },
    select: CUSTOMER_EMAIL_SELECT,
  });
}

/**
 * Tells the customer about their booking: received, confirmed or
 * cancelled. Meant for `after()`. Re-reads the reservation, so a status that
 * moved on before this ran (a confirmation cancelled a moment later) sends
 * nothing stale.
 */
export async function notifyCustomer(
  reservationId: string,
  kind: Exclude<CustomerEmailKind, "expired">
): Promise<SendResult> {
  const row = await loadRow(reservationId);
  if (!row) return "skipped";
  return sendCustomerEmail(kind, row);
}

/**
 * How far back the sweep looks. A request lapses at midnight of its pickup
 * day; the sweep runs daily, so one day would do, and two forgive one missed
 * run. It also stops the first run after deployment from writing to every
 * request that ever went stale.
 */
const EXPIRY_LOOKBACK_DAYS = 2;

export type ExpirySweepResult = {
  sent: number;
  failed: number;
  skipped: number;
};

/**
 * Emails the customer of every public request that lapsed recently without
 * a decision. Expiry is derived (isExpiredRequest), so there is no moment it
 * "happens" to hook into; a daily cron runs this instead.
 *
 * Each row is claimed by setting `expiryNotifiedAt` in one UPDATE before any
 * mail goes out, so overlapping runs cannot both send. A send that fails is
 * released for the next run (still inside the lookback window); one that was
 * skipped stays claimed, because nothing about it will change.
 *
 * Does nothing, and claims nothing, while email is not configured: turning
 * email on later should still tell the customers inside the window.
 */
export async function notifyCustomersOfExpiredRequests(
  now = new Date()
): Promise<ExpirySweepResult> {
  const result: ExpirySweepResult = { sent: 0, failed: 0, skipped: 0 };
  if (!isEmailConfigured()) return result;

  const today = businessTodayAsRentalDate(now);
  const earliest = new Date(today);
  earliest.setUTCDate(earliest.getUTCDate() - EXPIRY_LOOKBACK_DAYS);

  const claimed = await prisma.reservation.updateManyAndReturn({
    where: {
      status: "PENDING",
      pickupDate: { gte: earliest, lt: today },
      expiryNotifiedAt: null,
      contactEmail: { not: null },
      customer: { anonymisedAt: null },
    },
    data: { expiryNotifiedAt: now },
    select: { id: true },
  });

  for (const { id } of claimed) {
    const row = await loadRow(id);
    const outcome = row ? await sendCustomerEmail("expired", row) : "skipped";
    result[outcome] += 1;
    if (outcome === "failed") {
      await prisma.reservation.updateMany({
        where: { id, expiryNotifiedAt: now },
        data: { expiryNotifiedAt: null },
      });
    }
  }
  return result;
}
