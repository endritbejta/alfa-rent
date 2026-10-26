import { publicContact } from "@/lib/site-config";
import { absoluteUrl } from "@/lib/site-url";

/**
 * schema.org structured data describing the business, so search engines can
 * show it as a local car-rental company. Only contact details that are
 * actually configured are published; never a placeholder.
 */
export function BusinessJsonLd({ description }: { description: string }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "AutoRental",
    name: "Alfa Rent a Car",
    url: absoluteUrl("/"),
    description,
    logo: absoluteUrl("/brand/alfa-logo-red.png"),
    image: absoluteUrl("/opengraph-image"),
    address: publicContact.address,
    areaServed: "Kosovo",
    currenciesAccepted: "EUR",
    ...(publicContact.phone && { telephone: publicContact.phone }),
    ...(publicContact.email && { email: publicContact.email }),
    ...(publicContact.mapUrl && { hasMap: publicContact.mapUrl }),
  };
  return (
    <script
      type="application/ld+json"
      // Escaping "<" keeps a value from closing the script tag early.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
