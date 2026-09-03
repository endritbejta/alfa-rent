/**
 * One place every unexpected failure passes through.
 *
 * This is a **seam, not a destination**. It does not ship errors anywhere yet:
 * it gives them a single shape and a single integration point, so wiring a
 * real reporter is one edit to `deliver` below rather than a hunt through
 * scattered `console.error` calls.
 *
 * Until that happens the platform log is the only record — which on Vercel
 * means `vercel logs <url> --json`, the route HANDOFF.md already documents,
 * because Vercel marks the project's environment variables Sensitive and
 * `vercel env pull` returns empty strings.
 *
 * Structured on purpose: a JSON line is greppable and can be ingested later
 * without reformatting, where `console.error("thing:", err)` cannot.
 */

export type ErrorContext = {
  /** Where it happened, e.g. "route-handler", "admin-boundary". */
  scope: string;
  /**
   * Next's error digest where one exists. This is the only identifier shared
   * between what the user was shown and what the log recorded, so it is the
   * thread to pull — always pass it through when you have it.
   */
  digest?: string;
  /** Anything else that helps, as long as it is not customer data. */
  [key: string]: unknown;
};

type Report = {
  level: "error";
  message: string;
  name?: string;
  stack?: string;
  at: string;
} & Record<string, unknown>;

/**
 * Replace this body to send reports on. Keep it non-throwing: a reporter that
 * fails must never become the error the user sees.
 */
function deliver(report: Report): void {
  console.error(JSON.stringify(report));
}

function describe(error: unknown): Pick<Report, "message" | "name" | "stack"> {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack };
  }
  // Anything can be thrown in JS; never lose it entirely.
  return { message: typeof error === "string" ? error : JSON.stringify(error) };
}

export function reportError(error: unknown, context: ErrorContext): void {
  try {
    deliver({
      level: "error",
      at: new Date().toISOString(),
      ...describe(error),
      ...context,
    });
  } catch {
    // Reporting is best-effort by definition.
  }
}
