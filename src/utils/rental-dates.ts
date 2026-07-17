const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
 * The latest return that still sits at or under `ceiling` while keeping the
 * rental's time of day.
 *
 * A return inherits 10:00 from the original booking, so a ceiling of
 * midnight on the 1st makes the 31st the last usable day — returning the
 * ceiling's own date would overshoot it by ten hours. Where the ceiling is
 * another booking's pickup this lands exactly on it, which is legal: the
 * exclusion constraint compares half-open ranges, so touching is not
 * overlapping.
 */
export function latestUnder(returnDate: Date, ceiling: Date): Date {
  const candidate = withTimeOfDay(returnDate, ceiling);
  return candidate.getTime() <= ceiling.getTime()
    ? candidate
    : new Date(candidate.getTime() - MS_PER_DAY);
}
