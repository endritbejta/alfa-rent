const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Midnight UTC of a rental date's calendar day.
 *
 * Rental dates are naive calendar values (`T10:00:00Z` is 10:00 at the
 * branch), so the UTC day is the branch day — see withTimeOfDay below.
 */
export function rentalDayStart(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

/**
 * Midnight UTC of the day after a rental date's day: the exclusive end of
 * the days a booking occupies. The car is the renter's for the whole return
 * day, so nothing else may start on it.
 */
export function rentalDayEnd(date: Date): Date {
  return new Date(rentalDayStart(date).getTime() + MS_PER_DAY);
}

/**
 * The days a rental is billed for and occupies: pickup day and return day
 * both count. 25 → 26 Nov is two days; returning on the pickup day is one.
 *
 * The one place this is computed. The only other copy is the revenue SQL in
 * analytics.service, which cannot call TypeScript and says so.
 */
export function rentalDays(pickupDate: Date, returnDate: Date): number {
  const days =
    Math.round(
      (rentalDayStart(returnDate).getTime() -
        rentalDayStart(pickupDate).getTime()) /
        MS_PER_DAY
    ) + 1;
  if (days < 1) {
    throw new RangeError("returnDate must not be before pickupDate");
  }
  return days;
}

const fromDayKey = (day: string) => new Date(`${day}T00:00:00.000Z`);

/** `rentalDays` for calendar-day strings (`yyyy-MM-dd`), as forms hold them. */
export function rentalDaysBetween(
  pickupDay: string,
  returnDay: string
): number {
  return rentalDays(fromDayKey(pickupDay), fromDayKey(returnDay));
}

/**
 * The return day that makes a rental `days` long: the inverse of
 * rentalDaysBetween. One day returns on the pickup day; a week, six days on.
 */
export function returnDayFor(pickupDay: string, days: number): string {
  if (!Number.isInteger(days) || days < 1) {
    throw new RangeError("days must be a positive integer");
  }
  return new Date(fromDayKey(pickupDay).getTime() + (days - 1) * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

/**
 * Moves a rental date to a different calendar day, keeping its time of day.
 *
 * Deliberately all-UTC. Prisma DateTime maps to `timestamp without time
 * zone` and pickups are written as T10:00:00Z, so using local getters would
 * shift a return by the server's offset — two hours in Kosovo, none on
 * Vercel. The same date would then mean different instants in dev and prod.
 */
export function withTimeOfDay(source: Date, target: Date): Date {
  return new Date(
    Date.UTC(
      target.getUTCFullYear(),
      target.getUTCMonth(),
      target.getUTCDate(),
      source.getUTCHours(),
      source.getUTCMinutes(),
      source.getUTCSeconds(),
      source.getUTCMilliseconds()
    )
  );
}

/**
 * The latest return before `nextPickup`, keeping the rental's time of day.
 *
 * Both the return day and the next booking's pickup day are whole rental
 * days, so they may not be the same day: the latest return is the day before
 * the next pickup. The exclusion constraint compares inclusive day ranges and
 * would refuse anything later.
 */
export function latestReturnBefore(returnDate: Date, nextPickup: Date): Date {
  const sameDay = withTimeOfDay(returnDate, nextPickup);
  return new Date(sameDay.getTime() - MS_PER_DAY);
}
