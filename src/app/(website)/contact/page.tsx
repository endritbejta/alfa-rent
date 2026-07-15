import type { Metadata } from "next";
import { MapPin, Phone, Mail, Clock } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Reach Alfa Rent a Car in Prishtina: phone, email, and opening hours.",
};

const ITEMS = [
  {
    icon: MapPin,
    label: "Address",
    lines: ["Prishtina, Kosovo"],
  },
  {
    icon: Phone,
    label: "Phone",
    lines: ["+383 44 000 000"],
  },
  {
    icon: Mail,
    label: "Email",
    lines: ["info@alfarent.com"],
  },
  {
    icon: Clock,
    label: "Hours",
    lines: ["Mon - Sat: 08:00 - 20:00", "Sun: 09:00 - 17:00"],
  },
];

export default function ContactPage() {
  return (
    <>
      <section className="bg-band text-band-foreground">
        <div className="mx-auto max-w-6xl px-5 pt-14 pb-10">
          <span className="eyebrow text-band-muted">Contact</span>
          <h1 className="font-display mt-4 text-4xl font-bold tracking-tight">
            Talk to a human
          </h1>
          <p className="text-band-muted mt-3 max-w-lg">
            Questions about a booking, long-term rates, or corporate fleets —
            call, write, or drop by.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map(({ icon: Icon, label, lines }) => (
            <div key={label} className="bg-card rounded-xl border p-6">
              <div className="bg-accent text-accent-foreground mb-4 flex h-10 w-10 items-center justify-center rounded-full">
                <Icon className="h-5 w-5" />
              </div>
              <p className="font-display font-bold">{label}</p>
              {lines.map((line) => (
                <p key={line} className="text-muted-foreground mt-1 text-sm">
                  {line}
                </p>
              ))}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
