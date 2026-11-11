import { describe, expect, it } from "vitest";
import { assertSameSiteJson, ok, withErrorHandling } from "@/lib/api";
import { AppError } from "@/lib/errors";

const BOOKINGS_URL = "http://localhost/api/bookings";

function post(headers: Record<string, string>): Request {
  return new Request(BOOKINGS_URL, { method: "POST", headers, body: "{}" });
}

/** The HTTP status the guard settles on: 200 when it lets the request by. */
function statusOf(request: Request): number {
  try {
    assertSameSiteJson(request);
    return 200;
  } catch (error) {
    if (error instanceof AppError) return error.status;
    throw error;
  }
}

describe("assertSameSiteJson", () => {
  it.each([
    "application/json",
    "application/json; charset=utf-8",
    "Application/JSON;charset=UTF-8",
  ])("lets a %s body through", (type) => {
    expect(statusOf(post({ "content-type": type }))).toBe(200);
  });

  // Every type a browser may send cross-origin without a preflight, plus
  // look-alikes that are not plain JSON.
  it.each([
    "text/plain",
    "text/plain;charset=UTF-8",
    "application/x-www-form-urlencoded",
    "multipart/form-data; boundary=----x",
    "application/jsonp",
    "application/json-patch+json",
  ])("refuses a %s body with 415", (type) => {
    expect(statusOf(post({ "content-type": type }))).toBe(415);
  });

  it("refuses a body with no declared type", () => {
    // A string body would make Request add text/plain itself.
    expect(statusOf(new Request(BOOKINGS_URL, { method: "POST" }))).toBe(415);
  });

  it.each(["same-origin", "same-site", "none"])(
    "lets Sec-Fetch-Site: %s through",
    (site) => {
      expect(
        statusOf(
          post({ "content-type": "application/json", "sec-fetch-site": site })
        )
      ).toBe(200);
    }
  );

  it("refuses a cross-site request with 403, whatever its body type", () => {
    for (const type of ["application/json", "text/plain"]) {
      expect(
        statusOf(post({ "content-type": type, "sec-fetch-site": "cross-site" }))
      ).toBe(403);
    }
  });
});

describe("withErrorHandling around a refused request", () => {
  const handler = withErrorHandling(async (request: Request) => {
    assertSameSiteJson(request);
    return ok({ reached: true });
  });

  it("answers 415 in the standard error envelope", async () => {
    const response = await handler(post({ "content-type": "text/plain" }));
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      success: false,
      error: { code: "UNSUPPORTED_MEDIA_TYPE", message: expect.any(String) },
    });
  });

  it("answers 403 for a cross-site request", async () => {
    const response = await handler(
      post({
        "content-type": "application/json",
        "sec-fetch-site": "cross-site",
      })
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
  });

  it("reaches the handler for a same-origin JSON request", async () => {
    const response = await handler(
      post({
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { reached: true },
    });
  });
});
