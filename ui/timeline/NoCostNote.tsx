import type { NoCostMessage } from "./effects";

/** Says a decision changes no dollar, then what it did change. All of it comes from the two simulation runs. */
export function NoCostNote({ message, className }: { message: NoCostMessage; className?: string }) {
  return (
    <div data-testid="no-cost-note" className={className ?? "mt-1.5 text-sm"}>
      <p className="text-ink/80">{message.headline}</p>
      <ul className="mt-0.5 text-ink/50">
        {message.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
