"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useForkStore } from "@/ui/store/useForkStore";

/** Under this width the drawer is a sheet that comes up from the bottom. */
const MOBILE_QUERY = "(max-width: 639px)";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
/** The slide takes this long. The content stays mounted for it so it does not vanish mid slide. */
const SLIDE_MS = 250;

/** A CSS media query as a boolean. False on the server and before the browser can answer. */
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false,
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** What Tab can reach inside the panel, in order. Anything inside a hidden section is skipped. */
function tabbable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest("[hidden], [inert]"));
}

export interface DrawerProps {
  open: boolean;
  /** Names the dialog and heads the panel. */
  title: string;
  onClose(): void;
  children: ReactNode;
  /** Which edge it slides from on a wide screen. A narrow screen always gets a bottom sheet. Defaults to the right. */
  side?: "right" | "left";
}

/**
 * A modal panel over the page. Wide screens get a panel on one side, narrow ones a bottom sheet. It lives inside the
 * nearest relative parent (like the assumptions sheet) and dims what is behind it.
 *
 * Opening moves focus to the close button and closing puts it back where it was. Tab stays inside while it is open.
 * Escape closes it and is swallowed, so a page behind it never also reacts to the same key press. Closed, it is inert,
 * and its content is not mounted at all.
 */
export function Drawer({ open, title, onClose, children, side = "right" }: DrawerProps) {
  const sheet = useMediaQuery(MOBILE_QUERY);
  const prefersStill = useMediaQuery(REDUCED_QUERY);
  const storeStill = useForkStore((s) => s.ui.reducedMotion);
  const still = prefersStill || storeStill;

  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // The last thing pressed while the drawer was shut: Safari does not focus a button on click, so focus alone cannot say.
  const pressedRef = useRef<{ el: HTMLElement; at: number } | null>(null);

  // Content stays mounted while the panel slides away, then goes.
  const [wasOpen, setWasOpen] = useState(open);
  const [leaving, setLeaving] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    setLeaving(!open && !still);
  }
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setLeaving(false), SLIDE_MS + 30);
    return () => window.clearTimeout(t);
  }, [leaving]);

  useEffect(() => {
    const note = (e: Event) => {
      if (!(e.target instanceof Element)) return;
      const el = e.target.closest<HTMLElement>("button, a[href], [role='button'], [tabindex]");
      pressedRef.current = el ? { el, at: Date.now() } : null;
    };
    document.addEventListener("click", note, true);
    return () => document.removeEventListener("click", note, true);
  }, []);

  // Focus goes in when it opens and back to whatever opened it when it closes.
  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    const pressed = pressedRef.current && Date.now() - pressedRef.current.at < 1000 ? pressedRef.current.el : null;
    const opener = active instanceof HTMLElement && active !== document.body ? active : pressed;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  // Swapping what the drawer shows can remove the thing that had focus. Put it on the close button, not on the page behind.
  useEffect(() => {
    const panel = panelRef.current;
    if (open && panel && !panel.contains(document.activeElement)) closeRef.current?.focus({ preventScroll: true });
  }, [open, title]);

  // Escape and Tab are taken in the capture phase, before anything else on the page can see them.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = tabbable(panel);
      if (items.length === 0) return void e.preventDefault();
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  const motion = still ? "transition-none" : "transition-[transform,opacity] duration-[250ms] ease-out motion-reduce:transition-none";
  const placement = sheet
    ? cn("inset-x-0 bottom-0 max-h-[85dvh] w-full rounded-t-2xl", open ? "translate-y-0 opacity-100" : "translate-y-full opacity-0")
    : cn(
        "inset-y-0 w-[min(520px,100vw)]",
        side === "left" ? "left-0" : "right-0",
        open ? "translate-x-0 opacity-100" : cn(side === "left" ? "-translate-x-full" : "translate-x-full", "opacity-0"),
      );

  return (
    <>
      <div
        aria-hidden="true"
        data-testid="drawer-dim"
        onClick={onClose}
        className={cn("absolute inset-0 z-30 bg-black/60", motion, open ? "opacity-100" : "pointer-events-none opacity-0")}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-hidden={open ? undefined : true}
        inert={!open}
        data-open={open}
        data-placement={sheet ? "bottom" : side}
        data-motion={still ? "none" : "slide"}
        className={cn("fork-glass absolute z-40 flex flex-col overflow-hidden", motion, placement)}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <h2 className="min-w-0 text-xl font-medium text-ink">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink/10 text-ink transition-colors hover:bg-ink/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <div data-testid="drawer-body" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-5 text-base sm:px-6">
          {(open || leaving) && children}
        </div>
      </div>
    </>
  );
}
