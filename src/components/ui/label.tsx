"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The shared label. Callers associate it with a control through `htmlFor`,
 * which arrives in the spread — so the lint rule cannot see it from here and
 * has to be told. Every call site is checked; only this generic wrapper is
 * opaque to static analysis.
 */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Label };
