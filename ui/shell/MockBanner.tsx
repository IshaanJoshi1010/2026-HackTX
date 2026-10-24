import { mockedModules } from "@/ui/mocks";

/** Visible whenever any USE_MOCKS flag is true. Gone when every module is real. */
export function MockBanner() {
  const mocked = mockedModules();
  if (mocked.length === 0) return null;
  return (
    <div
      role="status"
      data-testid="mock-banner"
      className="absolute left-1/2 top-3.5 z-30 flex max-w-[min(94vw,760px)] -translate-x-1/2 items-center gap-2 rounded-full bg-ink/10 px-3.5 py-1 text-xs whitespace-nowrap text-ink/70 backdrop-blur-md"
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full border border-ink" />
      <span className="truncate">
        Mock mode: {mocked.join(", ")} {mocked.length === 1 ? "is a placeholder" : "are placeholders"}. Numbers are not real results.
      </span>
    </div>
  );
}
