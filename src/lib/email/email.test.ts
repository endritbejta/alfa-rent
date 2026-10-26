import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseRecipients, sendEmail } from "./index";

const message = {
  to: ["staff@example.test"],
  subject: "Subject",
  html: "<p>Hi</p>",
  text: "Hi",
  replyTo: "customer@example.test",
};

describe("parseRecipients", () => {
  it("splits on commas and semicolons and drops blanks", () => {
    expect(parseRecipients(" a@x.test, b@x.test ;; nope ,")).toEqual([
      "a@x.test",
      "b@x.test",
    ]);
    expect(parseRecipients(undefined)).toEqual([]);
  });
});

/**
 * Email is a side effect of work that already succeeded. Whatever the
 * provider does, sendEmail must report it and return, never throw.
 */
describe("sendEmail", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "Alfa Rent <bookings@example.test>");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  it("does nothing until it is configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await sendEmail(message)).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing without recipients", async () => {
    expect(await sendEmail({ ...message, to: [] })).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the message to Resend", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await sendEmail(message)).toBe("sent");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
    expect(JSON.parse(init.body)).toEqual({
      from: "Alfa Rent <bookings@example.test>",
      to: ["staff@example.test"],
      subject: "Subject",
      html: "<p>Hi</p>",
      text: "Hi",
      reply_to: "customer@example.test",
    });
  });

  it("reports a rejected send instead of throwing", async () => {
    fetchMock.mockResolvedValue(
      new Response('{"message":"domain not verified"}', { status: 403 })
    );
    expect(await sendEmail(message)).toBe("failed");
    expect(console.error).toHaveBeenCalledOnce();
  });

  it("reports a network failure or timeout instead of throwing", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    expect(await sendEmail(message)).toBe("failed");
  });
});
