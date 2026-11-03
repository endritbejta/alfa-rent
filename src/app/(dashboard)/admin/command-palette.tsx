"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  CalendarDays,
  Car,
  ChartNoAxesColumn,
  ClipboardList,
  CornerDownLeft,
  Hourglass,
  Languages,
  LayoutDashboard,
  Moon,
  Plus,
  Search,
  Sun,
  Users,
} from "lucide-react";
import { searchAdminAction } from "./search-actions";
import { useDetailDrawer } from "@/components/dashboard/detail-drawer-context";
import type { SearchHit } from "@/services/search.service";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/shared/locale-provider";
import { PendingStatus } from "@/components/shared/pending-status";
import { setLocaleAction } from "@/lib/i18n/locale-actions";
import type { Locale } from "@/lib/i18n/config";
import type { TranslationKey } from "@/lib/i18n/translations";

type Row =
  | { type: "hit"; hit: SearchHit }
  | {
      type: "route";
      label: string;
      href: string;
      icon: React.ElementType;
      badge?: number;
    }
  | {
      type: "action";
      label: string;
      icon: React.ElementType;
      perform: () => void;
    };

type Group = {
  key: string;
  heading: string;
  rows: { row: Row; index: number }[];
};

const ROUTE_DEFS: {
  labelKey: TranslationKey;
  href: string;
  icon: React.ElementType;
}[] = [
  {
    labelKey: "admin.dashboard",
    href: "/admin/dashboard",
    icon: LayoutDashboard,
  },
  { labelKey: "admin.vehicles", href: "/admin/vehicles", icon: Car },
  {
    labelKey: "admin.reservations",
    href: "/admin/reservations",
    icon: ClipboardList,
  },
  {
    labelKey: "admin.pendingRequests",
    href: "/admin/reservations?status=PENDING",
    icon: Hourglass,
  },
  { labelKey: "admin.customers", href: "/admin/customers", icon: Users },
  { labelKey: "admin.calendar", href: "/admin/calendar", icon: CalendarDays },
  {
    labelKey: "admin.analytics",
    href: "/admin/analytics",
    icon: ChartNoAxesColumn,
  },
  {
    labelKey: "admin.addVehicle",
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
  reservation: "admin.reservations",
  vehicle: "admin.vehicles",
  customer: "admin.customers",
} satisfies Record<SearchHit["kind"], TranslationKey>;

/** A language is offered in its own name, whichever one is on screen now. */
const ENDONYM: Record<Locale, string> = { sq: "Shqip", en: "English" };

/**
 * ⌘K — jump to any vehicle, reservation or customer without navigating.
 *
 * A hit opens the same detail drawer a table row opens, rather than routing
 * to a page: the point is to answer a question mid-call and carry on, not to
 * end up somewhere else. Typing nothing lists every place in the sidebar and
 * the two settings worth a shortcut; typing filters those too, above the
 * records.
 *
 * Open state lives in the shell, so the search button in the sidebar and the
 * phone's top bar open it as well — ⌘K alone left it unreachable on touch.
 *
 * The only surface in the admin where glass is honest — it floats over the
 * page you were reading, and blurring it is what says that page is still
 * there and still yours.
 */
export function CommandPalette({
  open,
  onOpenChange,
  pendingCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingCount: number;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { openReservation, openVehicle, openCustomer } = useDetailDrawer();
  const listboxId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [, startLocale] = useTransition();

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Tab must not walk out into the page the palette floats over, and closing
  // returns focus wherever ⌘K was pressed from.
  useFocusTrap(panelRef, open);

  const dark = resolvedTheme === "dark";
  const nextLocale: Locale = locale === "sq" ? "en" : "sq";
  const commands: Row[] = [
    ...ROUTE_DEFS.map((route): Row => ({
      type: "route",
      label: t(route.labelKey),
      href: route.href,
      icon: route.icon,
      badge:
        route.href.startsWith("/admin/reservations") && pendingCount > 0
          ? pendingCount
          : undefined,
    })),
    {
      type: "action",
      label: dark ? t("theme.toLight") : t("theme.toDark"),
      icon: dark ? Sun : Moon,
      perform: () => setTheme(dark ? "light" : "dark"),
    },
    {
      type: "action",
      label: ENDONYM[nextLocale],
      icon: Languages,
      perform: () =>
        startLocale(async () => {
          await setLocaleAction(nextLocale);
          document.documentElement.lang = nextLocale;
          router.refresh();
        }),
    },
  ];

  const q = query.trim();
  const searching = q.length >= 2;
  // Places and settings filter as you type, so "cal" still finds the
  // calendar while the record search runs underneath.
  const matching = searching
    ? commands.filter(
        (row) =>
          row.type !== "hit" &&
          row.label
            .toLocaleLowerCase(locale)
            .includes(q.toLocaleLowerCase(locale))
      )
    : commands;
  const rows: Row[] = searching
    ? [...matching, ...hits.map((hit) => ({ type: "hit" as const, hit }))]
    : commands;
  const groups = groupRows(rows, (key) =>
    key === "route"
      ? t("admin.goTo")
      : key === "action"
        ? t("admin.actions")
        : t(KIND_LABEL[key])
  );
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  // ⌘K / Ctrl+K anywhere, including from inside an input — that's the point
  // of the shortcut.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

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
    // Clearing the timer only cancels a search that has not started yet. Once
    // the action is in flight nothing can stop it, so a slow response for an
    // abandoned query would otherwise land last and overwrite the results for
    // the query the operator has moved on to — and reset their selection with
    // it. Same guard the availability widget uses.
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (q.length < 2) {
        setHits([]);
        setSearchError(null);
        setLoading(false);
        setActive(0);
        return;
      }
      setLoading(true);
      setSearchError(null);
      const result = await searchAdminAction(q);
      if (cancelled) return;
      if ("error" in result) {
        // Reporting a failure as "nothing matches" told an operator whose
        // session had expired that their search found nothing.
        setHits([]);
        setSearchError(result.error);
      } else {
        setHits(result.hits);
      }
      setLoading(false);
      setActive(0);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // Arrowing past the bottom of the visible results used to select rows the
  // operator could not see. Not state, just the DOM catching up.
  useEffect(() => {
    if (!open) return;
    document
      .getElementById(`${listboxId}-option-${active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active, listboxId]);

  const close = useCallback(() => {
    onOpenChange(false);
    setQuery("");
    setHits([]);
    setSearchError(null);
    setActive(0);
  }, [onOpenChange]);

  /*
   * Escape belongs to the top layer. The palette can open over the detail
   * drawer, which listens for Escape on the document, so one press used to
   * close both. Caught on the way down instead, before it reaches anything
   * underneath.
   */
  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  }, [open, close]);

  const run = useCallback(
    (row: Row) => {
      close();
      if (row.type === "route") {
        router.push(row.href);
        return;
      }
      if (row.type === "action") {
        row.perform();
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

  const activeRow = rows[active] ? optionId(active) : undefined;

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        aria-label={t("admin.closeSearch")}
        onClick={close}
        className="palette-overlay bg-overlay-modal absolute inset-0 cursor-default backdrop-blur-[2px]"
      />
      {/*
        A dialog is not an interactive role, but it owns the arrow-key
        navigation for the results below it — there is nowhere else for that
        listener to live.
      */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("admin.search")}
        tabIndex={-1}
        // Sits high rather than centred: the results grow downward and the
        // input shouldn't move while you type. L6 — this was the reference
        // glass surface; now it consumes the ladder instead of hand-rolling it.
        className="glass-l6 absolute inset-x-4 top-[max(12vh,env(safe-area-inset-top))] mx-auto max-w-[38rem] overflow-hidden rounded-none shadow-lg outline-none"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="text-muted-foreground h-4 w-4 shrink-0" />
          {/*
            A combobox that owns a listbox: focus never leaves the input, and
            aria-activedescendant tells a screen reader which row the arrows
            are on — they used to move a highlight it could not see.
          */}
          <input
            // The palette is opened by a keystroke in order to type into it;
            // landing anywhere else would be the surprise.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("admin.searchPlaceholder")}
            aria-label={t("admin.search")}
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeRow}
            className="placeholder:text-muted-foreground h-12 flex-1 bg-transparent text-sm outline-none"
          />
          <kbd className="text-muted-foreground border-border hidden rounded-none border px-1.5 py-0.5 text-[10px] font-medium pointer-fine:inline">
            ESC
          </kbd>
        </div>

        <PendingStatus message={loading ? t("admin.searching") : null} />
        <div className="max-h-[52vh] overflow-y-auto overscroll-contain p-2">
          {loading && rows.length === 0 && (
            <p className="text-muted-foreground px-3 py-8 text-center text-sm">
              {t("admin.searching")}
            </p>
          )}

          {!loading && searchError && (
            <p
              role="alert"
              className="text-destructive px-3 py-8 text-center text-sm"
            >
              {searchError}
            </p>
          )}

          {!loading && !searchError && searching && rows.length === 0 && (
            <p className="text-muted-foreground px-3 py-8 text-center text-sm">
              {t("admin.noSearchResults", { query: q })}
            </p>
          )}

          <div id={listboxId} role="listbox" aria-label={t("admin.search")}>
            {groups.map((group) => (
              <div
                key={group.key}
                role="group"
                aria-labelledby={`${listboxId}-${group.key}`}
              >
                <p
                  id={`${listboxId}-${group.key}`}
                  className="text-muted-foreground px-3 pt-3 pb-1.5 text-[10px] font-semibold tracking-[0.08em] uppercase"
                >
                  {group.heading}
                </p>
                {group.rows.map(({ row, index }) => {
                  const Icon =
                    row.type === "hit" ? KIND_ICON[row.hit.kind] : row.icon;
                  const title = row.type === "hit" ? row.hit.title : row.label;
                  const subtitle = row.type === "hit" ? row.hit.subtitle : null;
                  const selected = index === active;

                  return (
                    <button
                      key={
                        row.type === "hit"
                          ? `${row.hit.kind}-${row.hit.id}`
                          : `${row.type}-${row.label}`
                      }
                      id={optionId(index)}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      // Options are pointed at, not focused: the input keeps
                      // focus so typing never stops.
                      tabIndex={-1}
                      onClick={() => run(row)}
                      // Real pointer movement only. mouseenter also fired
                      // when the list scrolled under a still pointer, and
                      // stole the row the arrow keys had just chosen.
                      onMouseMove={(event) => {
                        if (
                          !selected &&
                          (event.movementX !== 0 || event.movementY !== 0)
                        ) {
                          setActive(index);
                        }
                      }}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-none px-3 py-2 text-left transition-colors",
                        selected
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
                      {row.type === "route" && row.badge !== undefined && (
                        <span className="bg-brand rounded-none px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {row.badge}
                        </span>
                      )}
                      {selected && (
                        <CornerDownLeft className="text-muted-foreground h-3 w-3 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Consecutive rows of one kind, under one heading. A plain function rather
 * than bookkeeping inside the render's map — mutating across iterations
 * there is exactly what the compiler can't reason about.
 */
function groupRows(
  rows: Row[],
  heading: (key: "route" | "action" | SearchHit["kind"]) => string
): Group[] {
  const groups: Group[] = [];
  rows.forEach((row, index) => {
    const key = row.type === "hit" ? row.hit.kind : row.type;
    const last = groups.at(-1);
    if (last?.key === key) last.rows.push({ row, index });
    else groups.push({ key, heading: heading(key), rows: [{ row, index }] });
  });
  return groups;
}
