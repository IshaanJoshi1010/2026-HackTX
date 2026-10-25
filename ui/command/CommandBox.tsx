"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { customerText } from "@/ui/profile/customerText";
import { useForkStore, type DumpOutcome } from "@/ui/store/useForkStore";
import { ConfirmProposalCard } from "./ConfirmProposalCard";
import { InlineQuestionCard } from "./InlineQuestionCard";
import { ManualEventForm } from "./ManualEventForm";
import { StarterChips } from "./StarterChips";
import { VoiceButton } from "./VoiceButton";

const NOTHING_FOUND =
  "I couldn't find a life change or a question I can answer in that. Try naming a place, a yearly mileage, or a family change, or ask about a RAV4.";

export interface CommandBoxProps {
  className?: string;
}

/**
 * The one place you tell Fork what is changing. A single pill. Everything it
 * produces is a proposal first: a card you confirm, then the timeline branches.
 */
export function CommandBox({ className }: CommandBoxProps) {
  const [text, setText] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = useForkStore((s) => s.ui.busy);
  const drafts = useForkStore((s) => s.explore.draftChanges);
  const question = useForkStore((s) => s.question);
  const futures = useForkStore((s) => s.explore.scenarios.length);
  const lastDump = useForkStore((s) => s.lastDump);
  const { submitDump, retryDump, setView } = useForkStore((s) => s.actions);

  const isInterpreting = busy === "interpreting";
  const hasDrafts = drafts.length > 0;

  /** The text that was kept because the AI was not available. It goes once the drafts it staged are dealt with. */
  const kept = useRef<string | null>(null);

  const applyOutcome = (outcome: DumpOutcome, prompt: string) => {
    // An answer to an older question, session or future was dropped by the store. Do nothing.
    if (outcome.kind === "stale") return;
    if (outcome.kind === "nothing") {
      kept.current = null;
      // Offline, the reader's own note is shown with the retry and manual options below.
      if (!outcome.offline) setNotice(outcome.message ?? NOTHING_FOUND);
      return; // keep the text so it can be fixed
    }
    // A question the plain rules fully answered leaves nothing to retry, so the box clears for the next one.
    if (outcome.offline && outcome.kind !== "compared" && outcome.kind !== "break_even") {
      kept.current = prompt; // keep what was typed, so it can be retried with the AI or entered by hand
      return;
    }
    kept.current = null;
    setText("");
  };

  const handleProcess = async (raw: string) => {
    const prompt = raw.trim();
    if (!prompt || isInterpreting) return;
    setNotice(null);
    // With no AI the store reads it with plain rules that only extract what you wrote.
    // A question answers itself on the Future page; a change waits here for a confirm.
    applyOutcome(await submitDump(prompt), prompt);
  };

  // Only ever on the person's request. Nothing here retries by itself.
  const handleRetry = async () => {
    if (isInterpreting || !lastDump) return;
    setNotice(null);
    applyOutcome(await retryDump(), lastDump.text);
  };

  // Once the staged drafts are confirmed or discarded there is nothing left to retry, so clear what was kept.
  useEffect(() => {
    if (lastDump || busy !== "idle" || kept.current === null) return;
    const gone = kept.current;
    kept.current = null;
    setText((t) => (t.trim() === gone ? "" : t));
  }, [lastDump, busy]);

  const offlineNotice = lastDump !== null && text.trim() === lastDump.text;

  const handleSeed = (prompt: string) => {
    setText(prompt);
    setNotice(null);
    inputRef.current?.focus();
  };

  return (
    <div data-testid="command-box" className={cn("mx-auto flex w-full max-w-2xl flex-col gap-3", className)}>
      {hasDrafts && <ConfirmProposalCard onConfirmed={() => setView("future")} />}
      {question && !hasDrafts && <InlineQuestionCard />}

      {showManual && (
        <div className="fork-glass rounded-xl p-4">
          <ManualEventForm onAdded={() => setShowManual(false)} />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleProcess(text);
        }}
        className="flex items-center gap-1 rounded-full bg-ink/10 py-2 pl-2 pr-2 backdrop-blur-xl focus-within:bg-ink/15"
      >
        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          aria-label={showManual ? "Close manual entry" : "Add a change manually"}
          aria-expanded={showManual}
          title={showManual ? "Close manual entry" : "Add a change manually"}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink/60 transition-colors hover:bg-ink/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
        >
          {showManual ? <X className="size-[18px]" /> : <Plus className="size-[18px]" />}
        </button>

        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            kept.current = null;
            if (notice) setNotice(null);
          }}
          placeholder="Tell Fork what's changing in your life"
          aria-label="What's changing in your life"
          disabled={isInterpreting}
          className="h-9 min-w-0 flex-1 bg-transparent px-2 text-[15px] text-ink placeholder:text-ink/40 focus:outline-none"
        />

        <VoiceButton onTranscript={(t) => setText((prev) => (prev ? `${prev} ${t}` : t))} disabled={isInterpreting} />

        <button
          type="submit"
          disabled={!text.trim() || isInterpreting}
          aria-label="Submit changes"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
            text.trim() && !isInterpreting ? "bg-ink text-canvas hover:bg-ink/85" : "bg-ink/10 text-ink/30",
          )}
        >
          {isInterpreting ? <Loader2 className="size-[18px] animate-spin" /> : <ArrowUp className="size-[18px]" />}
        </button>
      </form>

      {offlineNotice ? (
        <div role="status" data-testid="offline-notice" className="flex flex-col items-center gap-1.5 text-center text-sm text-ink/60">
          <p>The AI isn&apos;t available right now, so I read that with plain rules.</p>
          {lastDump.note && <p data-testid="offline-note">{customerText(lastDump.note)}</p>}
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => void handleRetry()}
              disabled={isInterpreting}
              className="border-b border-ink/40 pb-0.5 text-ink transition-colors hover:border-ink disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
            >
              Try the AI again
            </button>
            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="border-b border-ink/40 pb-0.5 text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
            >
              Enter it yourself
            </button>
          </div>
        </div>
      ) : notice ? (
        <p role="status" className="text-center text-sm text-ink/60">
          {notice}
        </p>
      ) : (
        futures <= 1 && !hasDrafts && !text && <StarterChips onSelect={handleSeed} disabled={isInterpreting} />
      )}
    </div>
  );
}
