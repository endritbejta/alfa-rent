import { VehicleCategory } from "@prisma/client";

/**
 * Availability-first search (design doc, section 8): plain GET form to
 * /car — zero client JS, works before hydration. The fleet page reads
 * the params and filters out vehicles with blocking reservations.
 */
export function HeroSearch() {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      action="/car"
      method="GET"
      className="mt-10 grid max-w-3xl gap-3 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 backdrop-blur-sm sm:grid-cols-[1fr_1fr_1fr_auto]"
    >
      <label className="block">
        <span className="text-band-muted mb-1.5 block text-xs font-semibold tracking-wide uppercase">
          Pickup
        </span>
        <input
          type="date"
          name="from"
          min={today}
          defaultValue={today}
          className="focus:ring-brand h-11 w-full rounded-lg border-0 bg-white/10 px-3 text-sm text-white [color-scheme:dark] ring-1 ring-white/15 outline-none focus:ring-2"
        />
      </label>
      <label className="block">
        <span className="text-band-muted mb-1.5 block text-xs font-semibold tracking-wide uppercase">
          Return
        </span>
        <input
          type="date"
          name="to"
          min={today}
          className="focus:ring-brand h-11 w-full rounded-lg border-0 bg-white/10 px-3 text-sm text-white [color-scheme:dark] ring-1 ring-white/15 outline-none focus:ring-2"
        />
      </label>
      <label className="block">
        <span className="text-band-muted mb-1.5 block text-xs font-semibold tracking-wide uppercase">
          Category
        </span>
        <select
          name="category"
          defaultValue=""
          className="focus:ring-brand h-11 w-full rounded-lg border-0 bg-white/10 px-3 text-sm text-white ring-1 ring-white/15 outline-none focus:ring-2 [&>option]:text-neutral-900"
        >
          <option value="">Any category</option>
          {Object.values(VehicleCategory).map((c) => (
            <option key={c} value={c}>
              {c.charAt(0) + c.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="bg-brand h-11 self-end rounded-full px-7 text-sm font-semibold text-white transition-colors hover:bg-[#B8161F]"
      >
        Search
      </button>
    </form>
  );
}
