"use client";

import { useEffect } from "react";
import { Landing } from "@/ui/landing/Landing";
import { useForkStore } from "@/ui/store/useForkStore";
import { AppHeader } from "./AppHeader";
import { MockBanner } from "./MockBanner";
import { usePreferences } from "./usePreferences";
import { Workspace } from "./Workspace";

/**
 * Renders Landing | Reveal | Workspace from store.phase. Saved state is read in an
 * effect, so the server and the first client render match; a quiet boot screen
 * covers the gap. Screens fill the whole viewport and the header floats on top.
 */
export function ForkApp() {
  const hydrated = useForkStore((s) => s.hydrated);
  const phase = useForkStore((s) => s.phase);
  const hydrate = useForkStore((s) => s.actions.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);
  usePreferences();

  return (
    <div className="relative z-10 h-dvh overflow-hidden">
      <MockBanner />
      <AppHeader />
      {!hydrated ? (
        <main className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-ink/55">Loading</p>
        </main>
      ) : phase === "landing" ? (
        <Landing />
      ) : (
        <Workspace />
      )}
    </div>
  );
}
