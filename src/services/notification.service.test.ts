import { describe, expect, it } from "vitest";
import {
  buildStaffBookingEmail,
  type BookingRequestEmailData,
} from "./notification.service";

const booking: BookingRequestEmailData = {
  reservationId: "res_1",
  vehicle: { brand: "Dacia", model: "Sandero", plate: "03-572-ZK", year: 2022 },
  customer: {
    firstName: "Ilir",
    lastName: "Rexhepi",
    email: "ilir@example.test",
    phone: "+383 47 150 374",
  },
  // Stored as UTC calendar values at the branch's 10:00 handover.
  pickupDate: new Date("2026-12-01T10:00:00.000Z"),
  returnDate: new Date("2026-12-04T10:00:00.000Z"),
  totalPrice: 75,
  notes: null,
  adminUrl: "https://alfa.example.test/admin/reservations?reservation=res_1",
};

describe("staff booking email", () => {
  it("carries everything staff need to call the customer back", () => {
    const { subject, text } = buildStaffBookingEmail(booking, "en");
    expect(subject).toBe(
      "New booking request: Dacia Sandero · 03-572-ZK for Ilir Rexhepi"
    );
    expect(text).toContain("Pickup: Tue, 01 Dec 2026");
    expect(text).toContain("Return: Fri, 04 Dec 2026");
    expect(text).toContain("Total: 75.00 EUR");
    expect(text).toContain("Phone: +383 47 150 374");
    expect(text).toContain("Email: ilir@example.test");
    expect(text).toContain(
      "Open in admin: https://alfa.example.test/admin/reservations?reservation=res_1"
    );
    expect(text).not.toContain("Notes:");
  });

  it("is written in Albanian by default", () => {
    const { subject, text } = buildStaffBookingEmail(booking);
    expect(subject).toMatch(/^Kërkesë e re për rezervim:/);
    expect(text).toContain("Telefoni: +383 47 150 374");
  });

  it("never lets customer-typed text become markup", () => {
    const { html, text } = buildStaffBookingEmail(
      {
        ...booking,
        customer: { ...booking.customer, firstName: '<img src=x onerror="x">' },
        notes: "Child seat <b>please</b> & early pickup",
      },
      "en"
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;img src=x onerror=&quot;x&quot;&gt;");
    expect(html).toContain("Child seat &lt;b&gt;please&lt;/b&gt; &amp; early");
    // Plain text is not HTML, so it keeps what the customer wrote.
    expect(text).toContain("Notes: Child seat <b>please</b> & early pickup");
  });

  it("drops the admin button when the app URL is unknown", () => {
    const { html, text } = buildStaffBookingEmail(
      { ...booking, adminUrl: null },
      "en"
    );
    expect(html).not.toContain("<a ");
    expect(text).not.toContain("Open in admin");
  });
});
