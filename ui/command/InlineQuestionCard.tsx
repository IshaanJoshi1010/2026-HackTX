"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useForkStore } from "@/ui/store/useForkStore";

export interface InlineQuestionCardProps {
  className?: string;
}

const chip =
  "h-8 rounded px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/**
 * At most one follow-up question, and only when the answer changes a number you can see.
 * One row: the question and its answers together. "I'm not sure" is always there.
 * Why it matters is in the tooltip, so the card stays small.
 */
export function InlineQuestionCard({ className }: InlineQuestionCardProps) {
  const question = useForkStore((s) => s.question);
  const answerQuestion = useForkStore((s) => s.actions.answerQuestion);
  const [numValue, setNumValue] = useState<string>("");

  if (!question) return null;

  const isUnsure = (opt: string) => /not sure|unsure/i.test(opt);

  const handleChipClick = (opt: string) => {
    if (isUnsure(opt)) answerQuestion(question.field, "unsure");
    else answerQuestion(question.field, opt.toLowerCase());
  };

  const handleNumberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(numValue);
    if (!Number.isFinite(val) || numValue === "") return;
    answerQuestion(question.field, val);
    setNumValue("");
  };

  return (
    <div
      data-testid="inline-question-card"
      title={question.impactNote}
      className={cn("fork-glass fork-rise flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl px-4 py-2.5 text-left", className)}
    >
      <p className="text-sm font-medium text-ink">{question.text}</p>

      {question.kind === "chips" && question.options && (
        <div className="flex flex-wrap gap-2">
          {question.options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => handleChipClick(opt)}
              className={cn(chip, isUnsure(opt) ? "border border-dashed border-line text-ink/60 hover:text-ink" : "bg-ink/10 text-ink hover:bg-ink/20")}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {question.kind === "number" && (
        <form onSubmit={handleNumberSubmit} className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0}
            value={numValue}
            onChange={(e) => setNumValue(e.target.value)}
            placeholder="Enter a number"
            aria-label={question.text}
            className="h-8 w-32 rounded bg-ink/10 px-3 text-sm text-ink placeholder:text-ink/50 focus:bg-ink/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
          <button type="submit" disabled={numValue === ""} className={cn(chip, "bg-ink text-canvas hover:bg-ink/85 disabled:opacity-40")}>
            Save
          </button>
          <button
            type="button"
            onClick={() => answerQuestion(question.field, "unsure")}
            className={cn(chip, "border border-dashed border-line text-ink/60 hover:text-ink")}
          >
            I&apos;m not sure
          </button>
        </form>
      )}
    </div>
  );
}
