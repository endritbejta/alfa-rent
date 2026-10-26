import { describe, expect, it } from "vitest";
import {
  buildStaffBookingEmail,
  emailCarPhotoUrl,
  type BookingRequestEmailData,
} from "./notification.service";

const PHOTO =
  "https://res.cloudinary.com/demo/image/upload/v1/alfa-rent-a-car/vehicles/v1/car.jpg";

const booking: BookingRequestEmailData = {
  reservationId: "res_1",
  vehicle: {
    brand: "Dacia",
    model: "Sandero",
    plate: "03-572-ZK",
    year: 2022,
    imageUrl: PHOTO,
  },
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
    expect(text).toContain("Tue, 01 Dec 2026 → Fri, 04 Dec 2026 (3 days)");
    expect(text).toContain("Total: 75.00 EUR");
    expect(text).toContain("+383 47 150 374");
    expect(text).toContain("ilir@example.test");
    expect(text).toContain(
      "Open the reservation: https://alfa.example.test/admin/reservations?reservation=res_1"
    );
    expect(text).not.toContain("Notes");
  });

  it("makes the phone and email one tap away", () => {
    const { html } = buildStaffBookingEmail(booking, "en");
    expect(html).toContain('href="tel:+38347150374"');
    expect(html).toContain('href="mailto:ilir@example.test"');
  });

  it("is written in Albanian by default", () => {
    const { subject, text } = buildStaffBookingEmail(booking);
    expect(subject).toMatch(/^Kërkesë e re për rezervim:/);
    expect(text).toContain("(3 ditë)");
    expect(text).toContain("Totali: 75,00 EUR");
  });

  it("says 1 day, not 1 days", () => {
    const { text } = buildStaffBookingEmail(
      { ...booking, returnDate: new Date("2026-12-02T10:00:00.000Z") },
      "en"
    );
    expect(text).toContain("(1 day)");
  });

  it("shows the car's photo as an email-safe JPEG", () => {
    const { html } = buildStaffBookingEmail(booking, "en");
    expect(html).toContain(
      'src="https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_1120,h_560,q_auto,f_jpg/v1/alfa-rent-a-car/vehicles/v1/car.jpg"'
    );
    expect(html).toContain('alt="Dacia Sandero"');
  });

  it("falls back to a named block when the car has no photo", () => {
    const { html } = buildStaffBookingEmail(
      { ...booking, vehicle: { ...booking.vehicle, imageUrl: null } },
      "en"
    );
    expect(html).not.toContain("<img");
    expect(html).toContain(">Dacia</td>");
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
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;img src=x onerror=&quot;x&quot;&gt;");
    expect(html).toContain("Child seat &lt;b&gt;please&lt;/b&gt; &amp; early");
    // Plain text is not HTML, so it keeps what the customer wrote.
    expect(text).toContain("Child seat <b>please</b> & early pickup");
  });

  it("drops the button when the app URL is unknown", () => {
    const { html, text } = buildStaffBookingEmail(
      { ...booking, adminUrl: null },
      "en"
    );
    expect(html).not.toContain("Open the reservation");
    expect(text).not.toContain("Open the reservation");
  });
});

describe("emailCarPhotoUrl", () => {
  it("ignores anything that is not a Cloudinary upload", () => {
    expect(emailCarPhotoUrl(null)).toBeNull();
    expect(emailCarPhotoUrl("https://evil.example/x.jpg")).toBeNull();
    expect(emailCarPhotoUrl("/brand/alfa-logo-red.png")).toBeNull();
  });
});
