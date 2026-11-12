import { normalizePhone } from "@/lib/validations/customer";

/**
 * Contact details as one person typed or stored them. The shape both sides of
 * the comparison share: what a public booking submitted, and the customer on
 * file it was linked to.
 */
export type ContactDetails = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

/** The snapshot columns a reservation carries; all null when it has none. */
export type ContactSnapshotColumns = {
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

/** Select these to read a reservation's snapshot, and nothing more. */
export const CONTACT_SNAPSHOT_SELECT = {
  contactFirstName: true,
  contactLastName: true,
  contactEmail: true,
  contactPhone: true,
} as const;

/**
 * What the booking form submitted, or null for a reservation that has no
 * snapshot — a staff booking, or one made before the columns existed. The
 * public path writes all four or none, so a partial row is treated as none.
 */
export function contactSnapshot(
  row: ContactSnapshotColumns
): ContactDetails | null {
  const { contactFirstName, contactLastName, contactEmail, contactPhone } = row;
  if (
    contactFirstName === null ||
    contactLastName === null ||
    contactEmail === null ||
    contactPhone === null
  ) {
    return null;
  }
  return {
    firstName: contactFirstName,
    lastName: contactLastName,
    email: contactEmail,
    phone: contactPhone,
  };
}

const sameText = (a: string, b: string) =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/**
 * Same number however it was typed: "+383 44 123 456" and "044 123 456" are
 * one phone. Two values with no digits at all (the old walk-in "-") are only
 * equal if they are the same text, so a placeholder never matches a number.
 */
const samePhone = (a: string, b: string) => {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  return left || right ? left === right : sameText(a, b);
};

/** Both sides, and which of them disagree. */
export type ContactDifference = {
  submitted: ContactDetails;
  onFile: ContactDetails;
  name: boolean;
  email: boolean;
  phone: boolean;
};

/**
 * Where a public booking's submitted details differ from the customer on
 * file, or null when they agree or there is no snapshot.
 *
 * A difference in case, surrounding spaces or phone formatting is not one:
 * staff would be asked to "update" a record to what it already says. Email is
 * compared too, although the booking was linked by it — it differs when staff
 * have since edited the customer's address, or merged this reservation onto
 * another record.
 */
export function contactDifference(
  submitted: ContactDetails | null,
  onFile: ContactDetails
): ContactDifference | null {
  if (!submitted) return null;
  const name =
    !sameText(submitted.firstName, onFile.firstName) ||
    !sameText(submitted.lastName, onFile.lastName);
  const email = !sameText(submitted.email, onFile.email);
  const phone = !samePhone(submitted.phone, onFile.phone);
  if (!name && !email && !phone) return null;
  return {
    submitted: pick(submitted),
    onFile: pick(onFile),
    name,
    email,
    phone,
  };
}

/** Exactly the four fields, so a full customer row never rides along. */
function pick({ firstName, lastName, email, phone }: ContactDetails) {
  return { firstName, lastName, email, phone };
}

/**
 * The customer edit that copies the submitted details onto the record, for
 * `updateCustomerAction`. The customer's notes are kept as they are; the
 * booking form has none of its own to offer.
 */
export function submittedContactAsCustomerInput(
  difference: Pick<ContactDifference, "submitted">,
  notes: string | null
) {
  return { ...difference.submitted, notes };
}

/** The snapshot columns for a reservation write. */
export function contactSnapshotData(
  details: ContactDetails
): ContactSnapshotColumns {
  return {
    contactFirstName: details.firstName,
    contactLastName: details.lastName,
    contactEmail: details.email,
    contactPhone: details.phone,
  };
}

/**
 * A reservation row read with CONTACT_SNAPSHOT_SELECT and its customer's four
 * contact fields, compared. What the pending queue and drawer need.
 */
export function reservationContactDifference(
  row: ContactSnapshotColumns & { customer: ContactDetails }
): ContactDifference | null {
  return contactDifference(contactSnapshot(row), row.customer);
}
