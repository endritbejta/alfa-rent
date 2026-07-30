/**
 * Public contact channels must be explicit deployment configuration. Empty
 * values are omitted from the UI so placeholder details can never look real.
 */
const configuredPhone = process.env.NEXT_PUBLIC_CONTACT_PHONE?.trim() || null;
const configuredEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null;

const phone =
  configuredPhone && !/0{3}\s*0{3}$/.test(configuredPhone)
    ? configuredPhone
    : null;
const email =
  configuredEmail?.toLowerCase() === "info@alfarent.com"
    ? null
    : configuredEmail;

export const publicContact = {
  address:
    process.env.NEXT_PUBLIC_CONTACT_ADDRESS?.trim() || "Prishtina, Kosovo",
  phone,
  email,
  mapUrl: process.env.NEXT_PUBLIC_CONTACT_MAP_URL?.trim() || null,
};
