import { createHash, timingSafeEqual } from "node:crypto";
import { reportError } from "@/lib/observability";
import { notifyCustomersOfExpiredRequests } from "@/services/customer-notification.service";

/**
 * Daily: emails customers whose request lapsed without a decision (audit
 * P2-13). Scheduled in vercel.json; Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET` when that variable is set, and this
 * refuses everything else. Without CRON_SECRET it refuses everyone, so an
 * unconfigured deployment cannot be made to send mail by a stranger.
 *
 * The answer is counts only: no ids, addresses or names.
 */
export const dynamic = "force-dynamic";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function authorised(header: string | null): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !header) return false;
  // Hashing first gives equal lengths, so the comparison is constant-time.
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

export async function GET(request: Request): Promise<Response> {
  if (!authorised(request.headers.get("authorization"))) {
    return Response.json({ success: false }, { status: 401 });
  }
  try {
    const result = await notifyCustomersOfExpiredRequests();
    return Response.json({ success: true, data: result });
  } catch (error) {
    reportError(error, { scope: "cron-expired-requests" });
    return Response.json({ success: false }, { status: 500 });
  }
}
