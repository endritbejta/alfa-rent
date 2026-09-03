/**
 * Refuses to run the database-backed tests against anything but a local
 * database.
 *
 * These tests insert and delete real rows, and one of them deliberately trips
 * the reservations_no_overlap constraint. `npm run db:seed` is gated behind an
 * explicit destructive acknowledgement and two strong passwords; this was not
 * gated at all, so a stale `DATABASE_URL` pointing at Supabase was one command
 * away from writing to production.
 */
const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Run `npm run db:setup` to start a local database."
  );
}

let host: string;
try {
  host = new URL(url).hostname;
} catch {
  throw new Error(`DATABASE_URL is not a valid URL: ${url}`);
}

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "host.docker.internal",
  // The service name CI's postgres container is reached by.
  "postgres",
]);

const acknowledged =
  process.env.ALLOW_REMOTE_INTEGRATION_DB === "I_KNOW_THIS_IS_DISPOSABLE";

if (!LOCAL_HOSTS.has(host) && !acknowledged) {
  throw new Error(
    `Refusing to run integration tests against "${host}". These tests write ` +
      `and delete rows. Point DATABASE_URL at a local database ` +
      `(npm run db:setup), or set ` +
      `ALLOW_REMOTE_INTEGRATION_DB=I_KNOW_THIS_IS_DISPOSABLE if you are ` +
      `certain that database is disposable.`
  );
}
