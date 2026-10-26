import { reportError } from "@/lib/observability";

/**
 * Outgoing email through Resend's HTTP API.
 *
 * A plain `fetch` rather than the SDK: one endpoint, one payload, and no
 * dependency to keep patched. Nothing here may throw. Email is a side effect
 * of work that has already succeeded (a booking is saved before staff are
 * told about it), so a mail outage must never surface as a failed request.
 *
 * Off until configured: without RESEND_API_KEY and EMAIL_FROM every send is
 * a no-op, so development, CI and previews never mail anyone by accident.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Long enough for a slow API, short enough not to eat a function's budget. */
const SEND_TIMEOUT_MS = 8_000;

export type EmailMessage = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  /** Lets staff hit Reply and reach the customer directly. */
  replyTo?: string;
};

export type SendResult = "sent" | "skipped" | "failed";

type EmailConfig = { apiKey: string; from: string };

function emailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  return apiKey && from ? { apiKey, from } : null;
}

/** Comma- or semicolon-separated addresses from an env var, trimmed. */
export function parseRecipients(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,;]/)
    .map((address) => address.trim())
    .filter((address) => address.includes("@"));
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const config = emailConfig();
  if (!config || message.to.length === 0) return "skipped";

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo && { reply_to: message.replyTo }),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      // The body names the cause (unverified domain, bad key, rate limit)
      // and never echoes the API key, so it is safe to keep.
      const detail = (await response.text().catch(() => "")).slice(0, 500);
      reportError(new Error(`Resend responded ${response.status}`), {
        scope: "email-send",
        status: response.status,
        detail,
      });
      return "failed";
    }
    return "sent";
  } catch (error) {
    reportError(error, { scope: "email-send" });
    return "failed";
  }
}
