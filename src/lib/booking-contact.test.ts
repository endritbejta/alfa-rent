import { describe, expect, it } from "vitest";
import {
  contactDifference,
  contactSnapshot,
  reservationContactDifference,
  submittedContactAsCustomerInput,
} from "./booking-contact";

const onFile = {
  firstName: "Drita",
  lastName: "Krasniqi",
  email: "drita@example.test",
  phone: "+383 44 123 456",
};

describe("contactDifference", () => {
  it("treats different formats of one phone as the same number", () => {
    for (const phone of [
      "044 123 456",
      "+383 44 123 456",
      "00383 44 123 456",
      "+383 (0)44-123-456",
      "44123456",
    ]) {
      expect(contactDifference({ ...onFile, phone }, onFile)).toBeNull();
    }
  });

  it("ignores case and surrounding spaces in names and email", () => {
    expect(
      contactDifference(
        {
          firstName: " DRITA",
          lastName: "krasniqi ",
          email: "Drita@Example.test",
          phone: onFile.phone,
        },
        onFile
      )
    ).toBeNull();
  });

  it("flags a different phone, and only the phone", () => {
    expect(
      contactDifference({ ...onFile, phone: "049 555 666" }, onFile)
    ).toEqual({
      submitted: { ...onFile, phone: "049 555 666" },
      onFile,
      name: false,
      email: false,
      phone: true,
    });
  });

  it("flags a different first or last name", () => {
    expect(
      contactDifference({ ...onFile, lastName: "Berisha" }, onFile)?.name
    ).toBe(true);
    expect(
      contactDifference({ ...onFile, firstName: "Dritë" }, onFile)?.name
    ).toBe(true);
  });

  it("never matches a placeholder phone with a real one", () => {
    expect(contactDifference(onFile, { ...onFile, phone: "-" })?.phone).toBe(
      true
    );
  });

  it("is null without a snapshot", () => {
    expect(contactDifference(null, onFile)).toBeNull();
  });

  it("carries only the four contact fields from a full customer row", () => {
    const difference = contactDifference({ ...onFile, phone: "049 555 666" }, {
      ...onFile,
      id: "c1",
      notes: "VIP",
    } as typeof onFile);
    expect(Object.keys(difference!.onFile).sort()).toEqual([
      "email",
      "firstName",
      "lastName",
      "phone",
    ]);
  });
});

describe("contactSnapshot", () => {
  it("is null for a reservation with no snapshot, or half of one", () => {
    const none = {
      contactFirstName: null,
      contactLastName: null,
      contactEmail: null,
      contactPhone: null,
    };
    expect(contactSnapshot(none)).toBeNull();
    expect(contactSnapshot({ ...none, contactPhone: "044" })).toBeNull();
    expect(
      reservationContactDifference({ ...none, customer: onFile })
    ).toBeNull();
  });
});

describe("submittedContactAsCustomerInput", () => {
  it("copies the submitted details and keeps the customer's notes", () => {
    const difference = contactDifference(
      { ...onFile, phone: "049 555 666" },
      onFile
    )!;
    expect(submittedContactAsCustomerInput(difference, "VIP")).toEqual({
      ...onFile,
      phone: "049 555 666",
      notes: "VIP",
    });
  });
});
