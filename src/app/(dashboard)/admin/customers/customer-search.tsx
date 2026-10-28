"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/components/shared/locale-provider";

const DEBOUNCE_MS = 300;

/**
 * Finds a customer while they are still on the phone. The query lives in the
 * URL like every other admin filter, so a search survives a refresh and the
 * drawer param beside it is left alone. Typing resets to page 1 — page 3 of
 * the previous result set means nothing for a new query.
 */
export function CustomerSearch({ initial }: { initial: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = (next: string) => {
    const query = new URLSearchParams(params.toString());
    query.delete("page");
    if (next.trim()) query.set("q", next.trim());
    else query.delete("q");
    const qs = query.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const onChange = (next: string) => {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => apply(next), DEBOUNCE_MS);
  };

  return (
    <div className="relative">
      <Search
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t("admin.searchCustomers")}
        placeholder={t("admin.searchCustomers")}
        className="pr-9 pl-9 sm:pr-9 sm:pl-9"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            if (timer.current) clearTimeout(timer.current);
            setValue("");
            apply("");
          }}
          aria-label={t("admin.clearSearch")}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-none p-1"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
