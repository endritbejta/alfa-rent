"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Car,
  ClipboardList,
  CornerDownLeft,
  LayoutDashboard,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { searchAdminAction } from "./search-actions";
import { useDetailDrawer } from "./reservation-detail";
import type { SearchHit } from "@/services/search.service";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { cn } from "@/lib/utils";

type Row =
  | { type: "hit"; hit: SearchHit }
  | { type: "route"; label: string; href: string; icon: React.ElementType };

const ROUTES: Extract<Row, { type: "route" }>[] = [
  {
    type: "route",
    label: "Dashboard",
    href: "/admin/dashboard",
    icon: LayoutDashboard,
  },
  { type: "route", label: "Vehicles", href: "/admin/vehicles", icon: Car },
  {
    type: "route",
    label: "Reservations",
    href: "/admin/reservations",
    icon: ClipboardList,
  },
  { type: "route", label: "Customers", href: "/admin/customers", icon: Users },
  {
    type: "route",
    label: "Add vehicle",
    href: "/admin/vehicles/new",
    icon: Plus,
  },
];

const KIND_ICON = {
  vehicle: Car,
  reservation: ClipboardList,
  customer: Users,
} as const;

const KIND_LABEL = {
  reservation: "Reservations",
  vehicle: "Vehicles",
  customer: "Customers",
} as const;

/**
 * ⌘K — jump to any vehicle, reservation or customer without navigating.
 *
 * A hit opens the same detail drawer a table row opens, rather than routing
 * to a page: the point is to answer a question mid-call and carry on, not to
 * end up somewhere else. Typing nothing lists the places you'd otherwise go
 * hunting through the sidebar for.
 *
 * The only surface in the admin where glass is honest — it floats over the
 * page you were reading, and blurring it is what says that page is still
 * there and still yours.
 */
export function CommandPalette({ pendingCount }: { pendingCount: number }) {
  const router = useRouter();
  const { openReservation, openVehicle, openCustomer } = useDetailDrawer();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  // Tab must not walk out into the page the palette floats over, and closing
  // returns focus wherever ⌘K was pressed from.
  useFocusTrap(panelRef, open);

  const rows: Row[] =
    query.trim().length < 2
      ? ROUTES
      : hits.map((hit) => ({ type: "hit" as const, hit }));

  // ⌘K / Ctrl+K anywhere, including from inside an input — that's the point
  // of the shortcut.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * Debounced: a query per keystroke would hammer three tables through a
   * pooler capped at one connection.
   *
   * Every setState sits inside the timer, never in the effect body — the
   * project's ESLint config forbids the latter, and it also means a fast
   * typist never sees "Searching…" flash between keystrokes.
   */
  useEffect(() => {
    const q = query.trim();
    const timer = setTimeout(async () => {
      if (q.length < 2) {
        setHits([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const result = await searchAdminAction(q);
      setHits("error" in result ? [] : result.hits);
      setLoading(false);
      setActive(0);
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHits([]);
    setActive(0);
  }, []);

  const run = useCallback(
    (row: Row) => {
      close();
      if (row.type === "route") {
        router.push(row.href);
        return;
      }
      const { kind, id } = row.hit;
      if (kind === "reservation") openReservation(id);
      else if (kind === "vehicle") openVehicle(id);
      else openCustomer(id);
    },
    [close, router, openReservation, openVehicle, openCustomer]
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") return close();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (rows.length ? (i + 1) % rows.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[active];
      if (row) run(row);
    }
  };

  if (!open) return null;

  /**
   * A heading appears on the first hit of each kind. Derived from the
   * previous row rather than tracked in a variable during the map — mutating
   * across iterations is exactly what the compiler can't reason about.
   */
  const withHeadings = rows.map((row, i) => {
    const prev = rows[i - 1];
    const heading =
      row.type === "hit" &&
      (!prev || prev.type !== "hit" || prev.hit.kind !== row.hit.kind)
        ? KIND_LABEL[row.hit.kind]
        : null;
    return { row, heading };
  });

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        aria-label="Close search"
        onClick={close}
        className="bg-overlay-modal absolute inset-0 cursor-default backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        tabIndex={-1}
        // Sits high rather than centred: the results grow downward and the
        // input shouldn't move while you type. L6 — this was the reference
        // glass surface; now it consumes the ladder instead of hand-rolling it.
        className="glass-l6 absolute inset-x-4 top-[12vh] mx-auto max-w-[38rem] overflow-hidden rounded-2xl shadow-lg outline-none motion-safe:animate-[modal-in_var(--motion-hover)_var(--ease-standard)]"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="text-muted-foreground h-4 w-4 shrink-0" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reservations, vehicles, customers…"
            aria-label="Search"
            className="placeholder:text-muted-foreground h-12 flex-1 bg-transparent text-sm outline-none"
          />
          <kbd className="text-muted-foreground border-border rounded border px-1.5 py-0.5 text-[10px] font-medium">
            ESC
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {loading && rows.length === 0 && (
            <p className="text-muted-foreground px-3 py-8 text-center text-sm">
              Searching…
            </p>
          )}

          {!loading && query.trim().length >= 2 && rows.length === 0 && (
            <p className="text-muted-foreground px-3 py-8 text-center text-sm">
              Nothing matches “{query.trim()}”.
            </p>
          )}

          {withHeadings.map(({ row, heading }, i) => {
            const isHit = row.type === "hit";
            const kind = isHit ? row.hit.kind : "route";

            const Icon = isHit ? KIND_ICON[row.hit.kind] : row.icon;
            const title = isHit ? row.hit.title : row.label;
            const subtitle = isHit ? row.hit.subtitle : null;

            return (
              <div key={isHit ? `${kind}-${row.hit.id}` : row.href}>
                {heading && (
                  <p className="text-muted-foreground px-3 pt-3 pb-1.5 text-[10px] font-semibold tracking-[0.08em] uppercase">
                    {heading}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => run(row)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                    i === active
                      ? "bg-surface-selected"
                      : "hover:bg-surface-hover"
                  )}
                >
                  <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {title}
                    </span>
                    {subtitle && (
                      <span className="text-muted-foreground block truncate text-xs">
                        {subtitle}
                      </span>
                    )}
                  </span>
                  {!isHit &&
                    row.href === "/admin/reservations" &&
                    pendingCount > 0 && (
                      <span className="bg-brand rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {pendingCount}
                      </span>
                    )}
                  {i === active && (
                    <CornerDownLeft className="text-muted-foreground h-3 w-3 shrink-0" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
