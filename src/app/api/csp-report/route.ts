import type { NextRequest } from "next/server";
import {
  MAX_REPORT_BYTES,
  parseCspReport,
  REPORTS_PER_MINUTE,
} from "@/lib/csp-report";
import { clientIp, consumeRateLimit } from "@/lib/rate-limit";

/**
 * Where browsers send Content-Security-Policy violation reports (see
 * src/lib/csp.ts, which names this path in `report-uri` and
 * `Reporting-Endpoints`).
 *
 * Unauthenticated by necessity, so it is built to be cheap to abuse:
 * - the body is capped before it is parsed;
 * - each IP gets a fixed budget per minute through the shared Postgres
 *   limiter, checked before the body is read at all;
 * - what it records is one compact line per violation with every URL cut to
 *   its path (src/lib/csp-report.ts), so it cannot be used to write
 *   arbitrary text or customer data into the log.
 *
 * It never echoes anything back. Browsers ignore the response, and 204 tells
 * a curious caller nothing.
 */

const ACCEPTED_TYPES = [
  "application/csp-report",
  "application/reports+json",
  "application/json",
];

function empty(status: number, headers?: HeadersInit): Response {
  return new Response(null, { status, headers });
}

export async function POST(request: NextRequest): Promise<Response> {
  const type = (request.headers.get("content-type") ?? "")
    .split(";")[0]!
    .trim()
    .toLowerCase();
  if (!ACCEPTED_TYPES.includes(type)) return empty(415);

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REPORT_BYTES) {
    return empty(413);
  }

  const { allowed, retryAfter } = await consumeRateLimit(
    `csp-report:${clientIp(request.headers)}`,
    REPORTS_PER_MINUTE,
    60
  );
  if (!allowed) return empty(429, { "Retry-After": String(retryAfter) });

  // Content-Length can be absent (chunked) or wrong, so measure what arrived.
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REPORT_BYTES) {
    return empty(413);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return empty(400);
  }

  for (const violation of parseCspReport(payload, request.nextUrl.origin)) {
    // TODO(P1-2): forward to the error tracker once the owner picks one.
    // Until then the platform log is the record: `vercel logs … | grep csp-violation`.
    console.warn(
      JSON.stringify({
        level: "warn",
        scope: "csp-violation",
        at: new Date().toISOString(),
        ...violation,
      })
    );
  }
  return empty(204);
}
