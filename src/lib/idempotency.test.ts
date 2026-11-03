import { afterEach, describe, expect, it, vi } from "vitest";
import {
  idempotencyKeySchema,
  keyForPayload,
  newIdempotencyKey,
} from "@/lib/idempotency";

describe("idempotency keys", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts what the client mints and refuses what could not be one", () => {
    expect(idempotencyKeySchema.safeParse(newIdempotencyKey()).success).toBe(
      true
    );
    expect(idempotencyKeySchema.safeParse("short").success).toBe(false);
    expect(idempotencyKeySchema.safeParse("x".repeat(129)).success).toBe(false);
    // Anything outside the URL-safe alphabet: quotes, spaces, SQL.
    expect(
      idempotencyKeySchema.safeParse("abcdefghijklmnop' OR 1=1").success
    ).toBe(false);
  });

  /**
   * A phone on the office Wi-Fi opens the dev server over plain http, where
   * crypto.randomUUID does not exist. Throwing there would have surfaced as
   * "could not send your booking" on every attempt.
   */
  it("still mints a valid key outside a secure context", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(171);
        return bytes;
      },
    });
    const key = newIdempotencyKey();
    expect(key).toBe("ab".repeat(16));
    expect(idempotencyKeySchema.safeParse(key).success).toBe(true);
  });

  it("reuses the key for an identical retry and mints one when anything changes", () => {
    const first = keyForPayload(null, '{"to":"2026-12-10"}');
    const retry = keyForPayload(first, '{"to":"2026-12-10"}');
    const changed = keyForPayload(retry, '{"to":"2026-12-11"}');

    expect(retry.key).toBe(first.key);
    expect(changed.key).not.toBe(first.key);
    expect(changed.payload).toBe('{"to":"2026-12-11"}');
  });
});
