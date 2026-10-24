"use client";

import { useRef, useState } from "react";
import { ArrowUp, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useForkStore } from "@/ui/store/useForkStore";
import { ConfirmProposalCard } from "./ConfirmProposalCard";
import { extractEvents } from "./extract";
import { InlineQuestionCard } from "./InlineQuestionCard";
import { ManualEventForm } from "./ManualEventForm";
import { StarterChips } from "./StarterChips";
import { VoiceButton } from "./VoiceButton";

const NOTHING_FOUND =
  "I couldn't find a life change in that. Try naming a place, a yearly mileage, or a family change.";

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
  const { submitDump, addDraft, setView } = useForkStore((s) => s.actions);

  const isInterpreting = busy === "interpreting";
  const hasDrafts = drafts.length > 0;

  const handleProcess = async (raw: string) => {
    const prompt = raw.trim();
    if (!prompt || isInterpreting) return;
    setNotice(null);

    await submitDump(prompt);

    // With no AI, fall back to plain rules. They only ever extract what you wrote.
    const state = useForkStore.getState();
    if (!state.ui.aiAvailable && state.explore.draftChanges.length === 0) {
      const found = extractEvents(prompt, new Date().getFullYear());
      found.forEach((event) => addDraft(event));
      if (found.length === 0) {
        setNotice(NOTHING_FOUND);
        return; // keep the text so it can be fixed
      }
    }
    setText("");
  };

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

      {notice ? (
        <p role="status" className="text-center text-sm text-ink/60">
          {notice}
        </p>
      ) : (
        futures <= 1 && !hasDrafts && !text && <StarterChips onSelect={handleSeed} disabled={isInterpreting} />
      )}
    </div>
  );
}
