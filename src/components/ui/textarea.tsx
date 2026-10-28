import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input bg-control placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:border-border disabled:bg-skeleton disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 flex field-sizing-content min-h-24 w-full rounded-none border px-4 py-3 text-base transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-100 aria-invalid:ring-3 md:text-base",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
