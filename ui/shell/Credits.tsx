"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { MODEL_CREDITS, honestyLine, type Credit } from "./modelCredits";

const LINK = "underline decoration-ink/30 underline-offset-2 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {children}
    </a>
  );
}

function CreditLine({ credit }: { credit: Credit }) {
  return (
    <li data-testid="model-credit">
      {credit.sourceUrl ? <Link href={credit.sourceUrl}>{credit.title}</Link> : credit.title}
      {credit.author && (
        <>
          {" by "}
          {credit.authorUrl ? <Link href={credit.authorUrl}>{credit.author}</Link> : credit.author}
        </>
      )}
      {", "}
      {credit.license.url ? <Link href={credit.license.url}>{credit.license.label}</Link> : credit.license.label}
      {credit.modified ? `. Modified for Fork: ${credit.modified}.` : "."}
    </li>
  );
}

/**
 * What is real and what is not, and who made the two car models (CC BY 4.0). Pages say it in one quiet line; the credits
 * open from it. On the landing they start open, since there is room.
 */
export function Credits({ defaultOpen = false, compact = false, className }: { defaultOpen?: boolean; compact?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const panel = useId();

  return (
    <footer data-testid="credits" className={cn("relative mx-auto max-w-2xl text-center text-xs leading-5 text-ink/60", className)}>
      {open && (
        <div
          id={panel}
          data-testid="credits-panel"
          className={cn(
            "mb-2 rounded-lg border border-line bg-canvas/95 p-3 text-left backdrop-blur-md",
            // Over the page, so opening it never moves the command bar.
            !defaultOpen && "absolute inset-x-0 bottom-full z-30",
          )}
        >
          <p className="mb-1.5 text-ink/80">3D model credits</p>
          {compact && <p className="mb-2 text-ink/60">{honestyLine()}</p>}
          <ul className="space-y-1.5">
            {MODEL_CREDITS.map((c) => (
              <CreditLine key={c.vehicleId} credit={c} />
            ))}
          </ul>
        </div>
      )}
      <p>
        {!compact && <>{honestyLine()}{" "}</>}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panel : undefined}
          onClick={() => setOpen((v) => !v)}
          className={cn(LINK, "cursor-pointer text-ink/80")}
        >
          {open ? "Hide credits" : compact ? "Credits" : "3D model credits"}
        </button>
      </p>
    </footer>
  );
}
