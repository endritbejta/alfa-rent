import { isAuthorisedCronRequest } from "@/lib/cron-auth";
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

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorisedCronRequest(request)) {
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
