/**
 * Turning a browser's CSP violation report into one safe log line.
 *
 * Browsers send two shapes:
 * - `report-uri` (CSP2, Firefox, older Chrome): `application/csp-report`,
 *   one object `{ "csp-report": { "document-uri", "violated-directive", … } }`.
 * - `report-to` (Reporting API, current Chrome/Edge): `application/reports+json`,
 *   an array of `{ type: "csp-violation", body: { documentURL,
 *   effectiveDirective, … } }`, batched and possibly mixed with other types.
 *
 * Everything in a report is attacker-controllable — anyone can POST one — and
 * the honest ones carry real URLs, whose query strings here can hold a
 * reservation reference or a customer search. So nothing is logged verbatim:
 * URLs are cut to origin + path (and same-origin ones to path alone), strings
 * are length-capped, and the sample is dropped.
 */

/** Real reports are a few hundred bytes; a Reporting API batch a few KB. */
export const MAX_REPORT_BYTES = 16 * 1024;
/** One page load with a broken policy can send a dozen; a flood cannot. */
export const REPORTS_PER_MINUTE = 30;

export type CspViolation = {
  directive: string;
  blocked: string;
  page: string;
  source?: string;
  line?: number;
  column?: number;
  disposition?: string;
};

const MAX_FIELD = 200;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0
    ? value.slice(0, MAX_FIELD)
    : undefined;
}

/** Directive names and dispositions: lowercase words and dashes, nothing else. */
function token(value: unknown): string | undefined {
  const raw = str(value);
  return raw && /^[a-z-]{1,64}$/.test(raw) ? raw : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : undefined;
}

/**
 * A URL with its query and fragment removed. Keywords browsers put in
 * `blocked-uri` (`inline`, `eval`, `data`, `blob`, …) pass through, as does
 * anything unparsable, length-capped and with anything after `?` or `#` cut.
 */
export function redactUrl(
  value: unknown,
  ownOrigin?: string
): string | undefined {
  const raw = str(typeof value === "string" ? value : undefined);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol === "data:" || url.protocol === "blob:") {
      return url.protocol.slice(0, -1);
    }
    if (url.origin === ownOrigin) return url.pathname;
    return url.origin === "null" ? url.protocol : url.origin + url.pathname;
  } catch {
    return raw.split(/[?#]/)[0];
  }
}

function fromLegacy(
  body: Record<string, unknown>,
  origin?: string
): CspViolation {
  return {
    directive:
      token(body["effective-directive"]) ??
      token(str(body["violated-directive"])?.split(" ")[0]) ??
      "unknown",
    blocked: redactUrl(body["blocked-uri"], origin) ?? "unknown",
    page: redactUrl(body["document-uri"], origin) ?? "unknown",
    source: redactUrl(body["source-file"], origin),
    line: num(body["line-number"]),
    column: num(body["column-number"]),
    disposition: token(body.disposition),
  };
}

function fromReportingApi(
  body: Record<string, unknown>,
  origin?: string
): CspViolation {
  return {
    directive: token(body.effectiveDirective) ?? "unknown",
    blocked: redactUrl(body.blockedURL, origin) ?? "unknown",
    page: redactUrl(body.documentURL, origin) ?? "unknown",
    source: redactUrl(body.sourceFile, origin),
    line: num(body.lineNumber),
    column: num(body.columnNumber),
    disposition: token(body.disposition),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** At most this many violations are logged from one request. */
export const MAX_VIOLATIONS_PER_REQUEST = 20;

/**
 * Every CSP violation in a parsed report body, in either format. Anything
 * else — other Reporting API types, junk — is ignored, not an error: a
 * reporting endpoint that 400s on surprises just makes browsers retry.
 */
export function parseCspReport(
  payload: unknown,
  origin?: string
): CspViolation[] {
  if (isObject(payload) && isObject(payload["csp-report"])) {
    return [fromLegacy(payload["csp-report"], origin)];
  }
  if (Array.isArray(payload)) {
    return payload
      .filter(
        (entry): entry is { type: string; body: Record<string, unknown> } =>
          isObject(entry) &&
          entry.type === "csp-violation" &&
          isObject(entry.body)
      )
      .slice(0, MAX_VIOLATIONS_PER_REQUEST)
      .map((entry) => fromReportingApi(entry.body, origin));
  }
  return [];
}
