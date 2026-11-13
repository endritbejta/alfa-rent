import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const consumeRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  consumeRateLimit: (...args: unknown[]) => consumeRateLimit(...args),
  clientIp: () => "203.0.113.7",
}));

const { POST } = await import("./route");
const { MAX_REPORT_BYTES, parseCspReport, redactUrl } =
  await import("@/lib/csp-report");

const ORIGIN = "https://alfa.example";

function post(
  body: string,
  type: string,
  headers: Record<string, string> = {}
) {
  return POST(
    new NextRequest(`${ORIGIN}/api/csp-report`, {
      method: "POST",
      body,
      headers: { "content-type": type, ...headers },
    })
  );
}

const legacy = {
  "csp-report": {
    "document-uri": `${ORIGIN}/admin/customers?q=jane%40example.com#x`,
    "violated-directive": "script-src-elem",
    "effective-directive": "script-src-elem",
    "blocked-uri": "https://evil.example/x.js?token=abc",
    "source-file": `${ORIGIN}/_next/static/chunks/a.js?v=1`,
    "line-number": 12,
    "column-number": 4,
    disposition: "report",
    "script-sample": "alert(document.cookie)",
  },
};

const reportingApi = [
  {
    type: "csp-violation",
    url: `${ORIGIN}/booking?ref=AR-123`,
    body: {
      documentURL: `${ORIGIN}/booking?ref=AR-123`,
      effectiveDirective: "style-src-elem",
      blockedURL: "inline",
      disposition: "report",
      lineNumber: 1,
      sample: "body{}",
    },
  },
  { type: "deprecation", body: { id: "x" } },
];

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consumeRateLimit.mockReset();
  consumeRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 1,
    retryAfter: 0,
  });
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

function logged(): Record<string, unknown>[] {
  return warn.mock.calls.map((call: unknown[]) =>
    JSON.parse(call[0] as string)
  );
}

describe("POST /api/csp-report", () => {
  it("accepts the report-uri format and logs one redacted line", async () => {
    const res = await post(JSON.stringify(legacy), "application/csp-report");
    expect(res.status).toBe(204);
    expect(logged()).toEqual([
      expect.objectContaining({
        scope: "csp-violation",
        directive: "script-src-elem",
        blocked: "https://evil.example/x.js",
        page: "/admin/customers",
        source: "/_next/static/chunks/a.js",
        line: 12,
        column: 4,
        disposition: "report",
      }),
    ]);
    const line = warn.mock.calls[0]![0] as string;
    expect(line).not.toContain("jane");
    expect(line).not.toContain("token=");
    expect(line).not.toContain("alert(");
  });

  it("accepts the Reporting API format, ignoring other report types", async () => {
    const res = await post(
      JSON.stringify(reportingApi),
      "application/reports+json"
    );
    expect(res.status).toBe(204);
    expect(logged()).toEqual([
      expect.objectContaining({
        directive: "style-src-elem",
        blocked: "inline",
        page: "/booking",
      }),
    ]);
    expect(warn.mock.calls[0]![0]).not.toContain("AR-123");
  });

  it("refuses an oversize body by its declared length, before touching the limiter", async () => {
    const res = await post("{}", "application/csp-report", {
      "content-length": String(MAX_REPORT_BYTES + 1),
    });
    expect(res.status).toBe(413);
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });

  it("refuses an oversize body that under-declares its length", async () => {
    const huge = JSON.stringify({
      "csp-report": { pad: "x".repeat(MAX_REPORT_BYTES) },
    });
    const res = await post(huge, "application/csp-report");
    expect(res.status).toBe(413);
    expect(warn).not.toHaveBeenCalled();
  });

  it("rate-limits per IP and logs nothing once over", async () => {
    consumeRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfter: 42,
    });
    const res = await post(JSON.stringify(legacy), "application/csp-report");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
    expect(consumeRateLimit).toHaveBeenCalledWith(
      "csp-report:203.0.113.7",
      30,
      60
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("refuses other content types and malformed JSON", async () => {
    expect((await post("{}", "text/plain")).status).toBe(415);
    expect((await post("{nope", "application/csp-report")).status).toBe(400);
  });

  it("accepts junk-shaped JSON without logging it", async () => {
    const res = await post(
      JSON.stringify({ hello: "world" }),
      "application/json"
    );
    expect(res.status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("parseCspReport", () => {
  it("drops directive names that are not directive-shaped", () => {
    const [v] = parseCspReport({
      "csp-report": { "effective-directive": 'x\n{"level":"error"}' },
    });
    expect(v!.directive).toBe("unknown");
  });

  it("caps how many violations one request can log", () => {
    const many = Array.from({ length: 100 }, () => reportingApi[0]);
    expect(parseCspReport(many)).toHaveLength(20);
  });
});

describe("redactUrl", () => {
  it.each([
    ["inline", "inline"],
    ["eval", "eval"],
    ["data:image/png;base64,AAAA", "data"],
    ["blob:https://alfa.example/uuid", "blob"],
    [`${ORIGIN}/car/x?y=1#z`, "/car/x"],
    ["https://other.example/p?q=1", "https://other.example/p"],
    ["not a url?secret", "not a url"],
  ])("%s → %s", (input, expected) => {
    expect(redactUrl(input, ORIGIN)).toBe(expected);
  });
});
