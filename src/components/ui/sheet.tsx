"use client";

import * as React from "react";
import { Drawer as SheetPrimitive } from "@base-ui/react/drawer";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";
import { useI18n } from "@/components/shared/locale-provider";

type Side = "top" | "right" | "bottom" | "left";

/** A sheet is dismissed by pushing it back the way it came. */
const SWIPE_DIRECTION = {
  top: "up",
  right: "right",
  bottom: "down",
  left: "left",
} as const satisfies Record<Side, SheetPrimitive.Root.Props["swipeDirection"]>;

const SheetSideContext = React.createContext<Side>("right");

/**
 * shadcn's Sheet API on Base UI's Drawer rather than its Dialog.
 *
 * Same parts and props as before, so the call sites barely change, but the
 * panel now follows a finger and is dismissed by swiping it back toward its
 * edge — only from the top of scrolled content, so reading a long filter
 * list never closes it. Esc, the close button and an outside press still
 * work, focus is still trapped, and on Android the system back gesture
 * closes the sheet instead of leaving the page (Base UI's CloseWatcher).
 *
 * `side` moved to the root because the swipe direction is a root concern;
 * the content reads it from context.
 */
function Sheet({
  side = "right",
  ...props
}: SheetPrimitive.Root.Props & { side?: Side }) {
  return (
    <SheetSideContext.Provider value={side}>
      <SheetPrimitive.Root swipeDirection={SWIPE_DIRECTION[side]} {...props} />
    </SheetSideContext.Provider>
  );
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        // Fades with the swipe, so the page underneath comes back as the
        // sheet goes rather than all at once at the end.
        "bg-overlay-soft fixed inset-0 z-50 opacity-[calc(1-var(--drawer-swipe-progress,0))] transition-opacity duration-[var(--motion-hover)] ease-[var(--ease-standard)] data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  showCloseButton?: boolean;
}) {
  const { t } = useI18n();
  const side = React.useContext(SheetSideContext);
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Viewport className="fixed inset-0 z-50">
        <SheetPrimitive.Popup
          data-slot="sheet-content"
          data-side={side}
          className={cn(
            // `translate` places the sheet on its way in and out; `transform`
            // carries the live swipe offset. Separate properties, so they add.
            "bg-popover text-popover-foreground fixed z-50 flex [transform:translate(var(--drawer-swipe-movement-x,0px),var(--drawer-swipe-movement-y,0px))] flex-col gap-4 bg-clip-padding text-sm shadow-lg transition-[opacity,translate,transform] duration-[var(--motion-panel)] ease-[var(--ease-drawer)] data-ending-style:duration-[var(--motion-panel-exit)] data-ending-style:ease-[var(--ease-exit)] data-swiping:duration-0 data-swiping:select-none",
            // Placement, the edge it slides from, and the safe-area insets of
            // every screen edge it touches.
            "data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:pr-[env(safe-area-inset-right)] data-[side=bottom]:pl-[env(safe-area-inset-left)] data-[side=bottom]:data-ending-style:translate-y-full data-[side=bottom]:data-starting-style:translate-y-full",
            "data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:pt-[env(safe-area-inset-top)] data-[side=left]:pb-[env(safe-area-inset-bottom)] data-[side=left]:pl-[env(safe-area-inset-left)] data-[side=left]:data-ending-style:-translate-x-full data-[side=left]:data-starting-style:-translate-x-full",
            "data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:pt-[env(safe-area-inset-top)] data-[side=right]:pr-[env(safe-area-inset-right)] data-[side=right]:pb-[env(safe-area-inset-bottom)] data-[side=right]:data-ending-style:translate-x-full data-[side=right]:data-starting-style:translate-x-full",
            "data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:pt-[env(safe-area-inset-top)] data-[side=top]:data-ending-style:-translate-y-full data-[side=top]:data-starting-style:-translate-y-full",
            "data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
            className
          )}
          {...props}
        >
          {/* The grab handle says "this moves" before anyone tries it. */}
          {side === "bottom" && (
            <div
              aria-hidden="true"
              className="bg-muted-foreground/30 mx-auto mt-2.5 -mb-2 h-1 w-10 shrink-0"
            />
          )}
          {children}
          {showCloseButton && (
            <SheetPrimitive.Close
              data-slot="sheet-close"
              render={
                <Button
                  variant="ghost"
                  className="hit-area absolute top-3 right-3"
                  size="icon-sm"
                />
              }
            >
              <XIcon />
              <span className="sr-only">{t("common.close")}</span>
            </SheetPrimitive.Close>
          )}
        </SheetPrimitive.Popup>
      </SheetPrimitive.Viewport>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      // The last thing in a bottom sheet, so it is what has to clear the
      // home indicator.
      className={cn(
        "mt-auto flex flex-col gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
        className
      )}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-foreground text-base font-medium",
        className
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
