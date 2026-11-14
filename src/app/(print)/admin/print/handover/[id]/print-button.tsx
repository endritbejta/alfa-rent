"use client";

/**
 * Opens the browser's print dialog. The only client code on the sheet:
 * everything else is server-rendered, so the page prints the same whether or
 * not this has loaded, through the browser's own menu.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="bg-foreground text-background focus-visible:ring-ring h-9 px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      {label}
    </button>
  );
}
