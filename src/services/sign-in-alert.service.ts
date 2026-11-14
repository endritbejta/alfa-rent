import { createHash } from "node:crypto";
import { after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit";
import { sendEmail, type SendResult } from "@/lib/email";
import { EMAIL_COLORS, EMAIL_FONT, escapeHtml } from "@/lib/email/html";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { dictionaries, translate } from "@/lib/i18n/translations";
import { consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { reportError } from "@/lib/observability";

/**
 * Failed sign-ins against one account, wherever they come from (audit
 * finding P2-1b).
 *
 * The IP limiter in auth/index.ts stops one address guessing; it cannot see
 * a guess spread across many addresses, and an IPv6 attacker has plenty.
 * This counter is keyed by the account instead, and it only ever tells
 * someone. It never refuses a sign-in: refusing on an email-keyed counter is
 * exactly the lockout the IP limiter was designed to avoid, since anyone who
 * knows a colleague's address could keep them out of their own account.
 *
 * Five in an hour is past honest fumbling (a forgotten password is usually
 * two or three tries, then a reset) and well short of what a guessing run
 * needs to get anywhere against bcrypt.
 */
export const ACCOUNT_FAILURE_THRESHOLD = 5;
export const ACCOUNT_FAILURE_WINDOW_SECONDS = 60 * 60;

/**
 * The counter's key. Hashed, so the table never holds an address in the
 * clear: most of what is typed into a sign-in form under attack is not a
 * staff address at all, and the table is not where anyone would think to
 * look for personal data.
 */
export function accountFailureKey(email: string): string {
  const normalised = email.trim().toLowerCase();
  return `login-account:${createHash("sha256").update(normalised).digest("hex")}`;
}

/**
 * Whether this failure is the one that crosses the threshold. The counter is
 * incremented in one statement, so exactly one request per window sees the
 * threshold value: that is the whole dedup, with nothing extra to store.
 */
export function crossesThreshold(count: number): boolean {
  return count === ACCOUNT_FAILURE_THRESHOLD;
}

/**
 * Counts a refused sign-in against the account it named, and schedules the
 * alert when this one crosses the threshold.
 *
 * Never throws and never changes the sign-in's answer. Everything that
 * depends on whether the account exists (the lookup, the audit event, the
 * email) runs after the response, so neither the reply nor its timing says
 * anything about the account. The password is never passed in.
 */
export async function noteFailedSignIn(
  email: string,
  ip: string
): Promise<void> {
  try {
    const { count } = await consumeRateLimit(
      accountFailureKey(email),
      ACCOUNT_FAILURE_THRESHOLD,
      ACCOUNT_FAILURE_WINDOW_SECONDS
    );
    if (!crossesThreshold(count)) return;
    runAfterResponse(() => alertRepeatedFailures(email, ip));
  } catch (error) {
    reportError(error, { scope: "sign-in-alert" });
  }
}

/** A success clears the account's count, as it clears the IP's. */
export async function clearFailedSignIns(email: string): Promise<void> {
  try {
    await resetRateLimit(accountFailureKey(email));
  } catch (error) {
    reportError(error, { scope: "sign-in-alert" });
  }
}

/**
 * after() where there is a request to run after, a detached promise where
 * there is not (a script, a test). Either way a failure is reported, never
 * thrown into the sign-in.
 */
function runAfterResponse(task: () => Promise<unknown>): void {
  const guarded = () =>
    task().catch((error) => reportError(error, { scope: "sign-in-alert" }));
  try {
    after(guarded);
  } catch {
    void guarded();
  }
}

export type FailedSignInAlert = {
  accountEmail: string;
  accountName: string;
  failures: number;
  windowMinutes: number;
  ip: string;
  at: Date;
};

const STAFF_LOCALE = DEFAULT_LOCALE;

/** The owner's alert, as subject, HTML and text. Pure, for the unit tests. */
export function buildFailedSignInEmail(alert: FailedSignInAlert): {
  subject: string;
  html: string;
  text: string;
} {
  const dictionary = dictionaries[STAFF_LOCALE];
  const t = (
    key: Parameters<typeof translate>[1],
    values?: Record<string, string | number>
  ) => translate(dictionary, key, values);
  const values = {
    name: alert.accountName,
    email: alert.accountEmail,
    count: alert.failures,
    minutes: alert.windowMinutes,
  };
  const subject = t("email.signInAlert.subject", values);
  const lines = [
    t("email.signInAlert.body", values),
    `${t("email.signInAlert.lastAddress")}: ${alert.ip}`,
    `${t("email.signInAlert.time")}: ${alert.at.toISOString()}`,
    t("email.signInAlert.notLocked"),
    t("email.signInAlert.advice"),
  ];
  const C = EMAIL_COLORS;
  const html =
    `<!doctype html><html><body style="margin:0;padding:24px;background:${C.page};font-family:${EMAIL_FONT};color:${C.ink}">` +
    `<h1 style="font-size:18px;margin:0 0 16px">${escapeHtml(subject)}</h1>` +
    lines
      .map(
        (line) =>
          `<p style="font-size:14px;line-height:22px;margin:0 0 12px">${escapeHtml(line)}</p>`
      )
      .join("") +
    `</body></html>`;
  return { subject, html, text: lines.join("\n\n") };
}

/**
 * Records the event and mails the active admins. Only for an account that
 * exists: alerting on every address an attacker sprays at the form would
 * bury the owner in mail about nobody.
 */
export async function alertRepeatedFailures(
  email: string,
  ip: string,
  now = new Date()
): Promise<SendResult | "no-account"> {
  const account = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, name: true, email: true },
  });
  if (!account) return "no-account";

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { email: true },
  });
  const windowMinutes = ACCOUNT_FAILURE_WINDOW_SECONDS / 60;
  // Resend not configured, or no admin to tell: "skipped", and the event
  // below is still recorded, so the trail has it either way.
  const result = await sendEmail({
    to: admins.map((admin) => admin.email),
    ...buildFailedSignInEmail({
      accountEmail: account.email,
      accountName: account.name,
      failures: ACCOUNT_FAILURE_THRESHOLD,
      windowMinutes,
      ip,
      at: now,
    }),
  });

  await prisma.$transaction((tx) =>
    recordAudit(tx, {
      actorId: null,
      action: "staff.failedSignIns",
      entityId: account.id,
      // No address: the audit trail is kept for good, and an IP address
      // is personal data the email already carried to the people who
      // need it.
      after: {
        failures: ACCOUNT_FAILURE_THRESHOLD,
        windowMinutes,
        alertEmail: result,
      },
    })
  );
  return result;
}
