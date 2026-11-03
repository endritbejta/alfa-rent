"use client";

import { Drawer } from "@base-ui/react/drawer";
import { X } from "lucide-react";
import { useI18n } from "@/components/shared/locale-provider";
import { useMediaQuery } from "@/lib/use-media-query";

/**
 * Right-side drawer used by every summary widget: clicking an item opens
 * detail here instead of navigating away, so staff keep their place.
 *
 * A bottom sheet on phones and a panel on the right edge from `sm` up, built
 * on Base UI's Drawer, which brings what the hand-rolled version could not:
 *
 * - Swipe to dismiss — down on a phone, right on a tablet — following the
 *   finger, and only from the top of the scrolled content, so reading a long
 *   reservation never closes it by accident. Esc, the close button and a
 *   press outside still work, and on Android the system back gesture closes
 *   it too (Base UI's CloseWatcher).
 * - Transitions instead of keyframes. A keyframe always restarts from its
 *   first frame, so closing a drawer that was still opening snapped it open
 *   first; a transition reverses from wherever the panel is.
 * - Focus trapped inside and handed back to the row that opened it.
 *
 * One axis per breakpoint: `sm:` resets the vertical offset explicitly, or
 * both translations would survive and the panel would arrive diagonally.
 */
export function DetailDrawer({
  open,
  onClose,
  onClosed,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** After the exit animation, when the panel is gone from the screen. */
  onClosed?: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const wide = useMediaQuery("(min-width: 40rem)");

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      swipeDirection={wide ? "right" : "down"}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onClosed?.();
      }}
    >
      <Drawer.Portal>
        <Drawer.Backdrop
          data-drawer-overlay
          className="bg-overlay-modal fixed inset-0 z-50 opacity-[calc(1-var(--drawer-swipe-progress,0))] backdrop-blur-[1px] transition-opacity duration-[var(--motion-panel)] ease-[var(--ease-standard)] data-ending-style:opacity-0 data-ending-style:duration-[var(--motion-panel-exit)] data-starting-style:opacity-0 data-swiping:duration-0"
        />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-end">
          {/* L5 glass: the drawer floats over work you'll return to, and the
              blur is what says that work is still there. 32rem, not 26 — a
              workspace needs room (design doc C+, §3). */}
          <Drawer.Popup
            data-drawer
            className="glass-l5 flex max-h-[92dvh] w-full [transform:translate(var(--drawer-swipe-movement-x,0px),var(--drawer-swipe-movement-y,0px))] flex-col shadow-lg transition-[translate,transform] duration-[var(--motion-panel)] ease-[var(--ease-drawer)] outline-none data-ending-style:translate-y-full data-ending-style:duration-[var(--motion-panel-exit)] data-ending-style:ease-[var(--ease-exit)] data-starting-style:translate-y-full data-swiping:duration-0 data-swiping:select-none sm:h-full sm:max-h-none sm:w-[32rem] sm:pr-[env(safe-area-inset-right)] sm:data-ending-style:translate-x-full sm:data-ending-style:translate-y-0 sm:data-starting-style:translate-x-full sm:data-starting-style:translate-y-0"
          >
            {/* The grab handle says "this moves" before anyone tries it. */}
            <div
              aria-hidden="true"
              className="bg-muted-foreground/30 mx-auto mt-2.5 h-1 w-10 shrink-0 sm:hidden"
            />
            <header className="flex items-start justify-between gap-3 border-b p-5 pt-3 sm:pt-[max(1.25rem,env(safe-area-inset-top))]">
              <div className="min-w-0">
                <Drawer.Title className="font-display truncate text-lg font-bold">
                  {title}
                </Drawer.Title>
                {subtitle && (
                  <Drawer.Description className="text-muted-foreground truncate text-xs">
                    {subtitle}
                  </Drawer.Description>
                )}
              </div>
              <Drawer.Close
                aria-label={t("common.close")}
                className="text-muted-foreground hover:text-foreground hover:bg-surface-hover hit-area relative -m-2 flex size-9 shrink-0 cursor-pointer items-center justify-center transition-colors"
              >
                <X className="h-5 w-5" />
              </Drawer.Close>
            </header>
            {/* The scroll body keeps clear of the home indicator. */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {children}
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
