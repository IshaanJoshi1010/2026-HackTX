import { cn } from "@/lib/utils";

/** A quiet text option. Pressed is underlined. Used for every opt-in on the Future page. */
export function Toggle({ pressed, onClick, children }: { pressed: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "border-b pb-0.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink",
        pressed ? "border-ink text-ink" : "border-transparent text-ink/55 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
