import { describe, expect, it } from "vitest";
import {
  buildCustomerEmail,
  customerLocale,
  type CustomerEmailData,
  type CustomerEmailKind,
} from "./customer-notification.service";

const PHOTO =
  "https://res.cloudinary.com/demo/image/upload/v1/alfa-rent-a-car/vehicles/v1/car.jpg";

const booking: CustomerEmailData = {
  reference: "cmh0reservation01",
  firstName: "Ilir",
  vehicle: { brand: "Dacia", model: "Sandero", imageUrl: PHOTO },
  // Stored as UTC calendar values at the branch's 10:00 handover.
  pickupDate: new Date("2026-12-01T10:00:00.000Z"),
  returnDate: new Date("2026-12-04T10:00:00.000Z"),
  totalPrice: 160,
  contactPhone: "+383 44 123 456",
  carsUrl: "https://alfa.example.test/car",
};

const KINDS: CustomerEmailKind[] = [
  "received",
  "confirmed",
  "cancelled",
  "expired",
];

describe("customer emails", () => {
  it.each([
    ["received", "en", "We received your booking request — Dacia Sandero"],
    ["received", "sq", "E morëm kërkesën tuaj për rezervim — Dacia Sandero"],
    ["confirmed", "en", "Your booking is confirmed — Dacia Sandero"],
    ["confirmed", "sq", "Rezervimi juaj u konfirmua — Dacia Sandero"],
    ["cancelled", "en", "Your booking has been cancelled — Dacia Sandero"],
    ["cancelled", "sq", "Rezervimi juaj u anulua — Dacia Sandero"],
    ["expired", "en", "Your booking request has lapsed — Dacia Sandero"],
    ["expired", "sq", "Kërkesa juaj për rezervim ka skaduar — Dacia Sandero"],
  ] as const)("%s in %s has its subject", (kind, locale, subject) => {
    expect(buildCustomerEmail(kind, booking, locale).subject).toBe(subject);
  });

  it("says a received request is not confirmed yet, with what comes next", () => {
    const { text, html } = buildCustomerEmail("received", booking, "en");
    expect(text).toContain("Not confirmed yet");
    expect(text).toContain("Your booking is not confirmed yet.");
    expect(text).toContain("What happens next");
    expect(text).toContain("Reference: cmh0reservation01");
    expect(html).toContain("cmh0reservation01");
    expect(html).toContain('lang="en"');
  });

  it("counts both the pickup and the return day, and formats the total", () => {
    const en = buildCustomerEmail("received", booking, "en").text;
    expect(en).toContain("Pickup: Tue, 01 Dec 2026");
    expect(en).toContain("Return: Fri, 04 Dec 2026");
    expect(en).toContain("Total (4 days): 160.00 EUR");

    const sq = buildCustomerEmail("received", booking, "sq").text;
    expect(sq).toContain("Totali (4 ditë): 160,00 EUR");
    expect(sq).toMatch(/Marrja: mar, 01 dhj 2026/i);
  });

  it("calls a same-day rental one day", () => {
    const { text } = buildCustomerEmail(
      "confirmed",
      { ...booking, returnDate: booking.pickupDate, totalPrice: 40 },
      "en"
    );
    expect(text).toContain("Total (1 day): 40.00 EUR");
  });

  it("formats the calendar day, not the instant, so midnight never shifts it", () => {
    const { text } = buildCustomerEmail(
      "confirmed",
      {
        ...booking,
        pickupDate: new Date("2026-12-01T00:00:00.000Z"),
        returnDate: new Date("2026-12-01T23:30:00.000Z"),
      },
      "en"
    );
    expect(text).toContain("Pickup: Tue, 01 Dec 2026");
    expect(text).toContain("Return: Tue, 01 Dec 2026");
  });

  it("escapes everything it interpolates into HTML", () => {
    const hostile: CustomerEmailData = {
      ...booking,
      firstName: `<script>alert("x")</script>`,
      vehicle: {
        brand: `Bad"><img src=x onerror=alert(1)>`,
        model: "&Co",
        imageUrl: null,
      },
      contactPhone: `+383 <b>44</b>`,
    };
    for (const kind of KINDS) {
      const { html } = buildCustomerEmail(kind, hostile, "en");
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<img src=x");
      expect(html).not.toContain("<b>44</b>");
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&amp;Co");
    }
  });

  it("makes the branch phone one tap away, or asks for the reference without one", () => {
    const { html, text } = buildCustomerEmail("received", booking, "en");
    expect(html).toContain('href="tel:+38344123456"');
    expect(text).toContain("Call us on +383 44 123 456");

    const none = buildCustomerEmail(
      "received",
      { ...booking, contactPhone: null },
      "en"
    );
    expect(none.html).not.toContain("tel:");
    expect(none.text).toContain("Quote your reference");
  });

  it("shows the car photo only for a booking that is going ahead", () => {
    expect(buildCustomerEmail("received", booking, "en").html).toContain(
      "res.cloudinary.com"
    );
    expect(buildCustomerEmail("confirmed", booking, "en").html).toContain(
      "res.cloudinary.com"
    );
    expect(buildCustomerEmail("cancelled", booking, "en").html).not.toContain(
      "res.cloudinary.com"
    );
  });

  it("offers other cars after a cancellation or a lapse", () => {
    for (const kind of ["cancelled", "expired"] as const) {
      const { text, html } = buildCustomerEmail(kind, booking, "en");
      expect(text).toContain(
        "See available cars: https://alfa.example.test/car"
      );
      expect(html).toContain('href="https://alfa.example.test/car"');
    }
    expect(buildCustomerEmail("received", booking, "en").text).not.toContain(
      "See available cars"
    );
  });

  it("is written in Albanian throughout when the booking was", () => {
    const { text, html } = buildCustomerEmail("cancelled", booking, "sq");
    expect(text).toContain("Rezervimi juaj u anulua, Ilir.");
    expect(text).toContain("Referenca: cmh0reservation01");
    expect(text).toContain("Na telefononi në +383 44 123 456");
    expect(html).toContain('lang="sq"');
    expect(text).not.toMatch(/\b(Pickup|Return|Reference|cancelled)\b/);
  });
});

describe("customerLocale", () => {
  it("keeps a known language and falls back to Albanian otherwise", () => {
    expect(customerLocale("en")).toBe("en");
    expect(customerLocale("sq")).toBe("sq");
    expect(customerLocale(null)).toBe("sq");
    expect(customerLocale("de")).toBe("sq");
  });
});
