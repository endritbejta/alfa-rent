import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

function hashPaymentAccessToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest();
}

export function createPaymentAccessToken() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    hash: hashPaymentAccessToken(token).toString("hex"),
  };
}

export function verifyPaymentAccessToken(token: string, expectedHash: string) {
  const actual = hashPaymentAccessToken(token);
  const expected = Buffer.from(expectedHash, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
