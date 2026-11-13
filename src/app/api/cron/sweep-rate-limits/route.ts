import { isAuthorisedCronRequest } from "@/lib/cron-auth";
import { reportError } from "@/lib/observability";
import { sweepExpiredRateLimits } from "@/lib/rate-limit";

/**
 * Daily: deletes rate-limit windows that expired more than a day ago (audit
 * P3-7). Scheduled in vercel.json and authorised exactly like the
 * expired-requests cron. The answer is a count only: the keys hold IPs.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorisedCronRequest(request)) {
    return Response.json({ success: false }, { status: 401 });
  }
  try {
    const deleted = await sweepExpiredRateLimits();
    return Response.json({ success: true, data: { deleted } });
  } catch (error) {
    reportError(error, { scope: "cron-sweep-rate-limits" });
    return Response.json({ success: false }, { status: 500 });
  }
}
