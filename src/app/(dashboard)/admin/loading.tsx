/**
 * Streamed while an admin page waits on the database. Every admin page is
 * force-dynamic, so without this the browser holds a blank screen for the
 * length of the slowest query.
 */
export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <div className="bg-secondary h-8 w-48 animate-pulse rounded-lg" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-secondary h-24 animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="bg-secondary h-64 animate-pulse rounded-xl" />
    </div>
  );
}
