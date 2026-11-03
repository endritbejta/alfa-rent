import { z } from "zod";

/**
 * Naming a submission so the server can recognise a retry of it.
 *
 * Disabling the button only covers the double-click. The case that actually
 * makes duplicates is a request that commits on the server after the browser
 * has given up on it — the booking form aborts at 20 seconds on a slow phone
 * connection — and a customer who, reasonably, presses Send again. Only the
 * server can tell that second request apart from a new booking, and only if
 * the two carry the same name.
 *
 * The header is the IETF one (draft-ietf-httpapi-idempotency-key-header), so
 * any HTTP client can opt in. Sending no key keeps the old behaviour.
 */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

/** Set on a response that is a replay of an earlier request's result. */
export const IDEMPOTENT_REPLAY_HEADER = "Idempotent-Replayed";

/**
 * Long enough that a key cannot be guessed, short enough to index, and plain
 * enough to log. A UUID and a 32-character hex string both qualify.
 */
export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,128}$/, "Invalid idempotency key");

/**
 * A fresh key for one submission.
 *
 * randomUUID only exists in secure contexts, and the site is opened over
 * plain http on a LAN address when it is tried on a phone during
 * development; getRandomValues works everywhere and is just as random.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

/**
 * The key to send for this payload: the same one again for an identical
 * retry, a new one as soon as anything about the request changes. A changed
 * request is a different booking, and reusing its key would have the server
 * refuse it as a mismatch.
 */
export function keyForPayload(
  previous: { payload: string; key: string } | null,
  payload: string
): { payload: string; key: string } {
  if (previous && previous.payload === payload) return previous;
  return { payload, key: newIdempotencyKey() };
}
