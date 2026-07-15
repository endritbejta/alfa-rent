import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="bg-band text-band-muted border-band-border border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-band-foreground text-lg font-bold">
            ALFA <span className="text-brand">RENT</span>
          </p>
          <p className="mt-3 max-w-xs text-sm">
            Premium car rental in Kosovo. Part of the Alfa Globe family.
          </p>
        </div>
        <div>
          <p className="text-band-foreground mb-3 text-sm font-semibold">
            Explore
          </p>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/car" className="hover:text-band-foreground">
                Our fleet
              </Link>
            </li>
            <li>
              <Link href="/booking" className="hover:text-band-foreground">
                Book a vehicle
              </Link>
            </li>
            <li>
              <Link href="/contact" className="hover:text-band-foreground">
                Contact
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-band-foreground mb-3 text-sm font-semibold">
            Contact
          </p>
          <ul className="space-y-2 text-sm">
            <li>Prishtina, Kosovo</li>
            <li>+383 44 000 000</li>
            <li>info@alfarent.com</li>
          </ul>
        </div>
        <div>
          <p className="text-band-foreground mb-3 text-sm font-semibold">
            Hours
          </p>
          <ul className="space-y-2 text-sm">
            <li>Mon - Sat: 08:00 - 20:00</li>
            <li>Sunday: 09:00 - 17:00</li>
            <li>Airport pickup: 24/7 on request</li>
          </ul>
        </div>
      </div>
      <div className="border-band-border border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-5 text-xs">
          <span>
            {new Date().getFullYear()} Alfa Rent a Car. All rights reserved.
          </span>
          <Link href="/login" className="hover:text-band-foreground">
            Staff login
          </Link>
        </div>
      </div>
    </footer>
  );
}
