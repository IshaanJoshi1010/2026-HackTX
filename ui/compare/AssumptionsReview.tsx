"use client";

import { useId, useState } from "react";
import type { Source } from "@/contracts";
import { cn } from "@/lib/utils";
import type { ScenarioTermsResult } from "@/ui/mocks";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { checkAgainstPrice, describeApplied, formatTerm, parseEntered, type CurrentTerm, type TermField } from "./termsMath";

export interface AssumptionsReviewProps {
  fields: readonly TermField[];
  /** What the sim is using now for each field, with the label it reported. */
  current: Record<string, CurrentTerm | undefined>;
  /** The terms already in effect (scenario assumption keys), if any. */
  applied: Record<string, number>;
  /** Dev 3's validator and converter. Only fields that were filled in are passed. */
  prepare(input: Record<string, number>): ScenarioTermsResult;
  onConfirm(assumptions: Record<string, number>): void;
  onReset(): void;
}

const inputClass =
  "h-9 w-full rounded border border-line bg-ink/5 px-2.5 text-sm tabular-nums text-ink placeholder:text-ink/50 focus:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

function Now({ field, unit, term }: { field: string; unit: string; term: CurrentTerm | undefined }) {
  if (!term) return <p className="text-xs text-ink/55">Not used until you compare with a car.</p>;
  return (
    <p className="flex items-center gap-2 text-xs text-ink/50">
      <span>Now {formatTerm(field, unit, term.value)}</span>
      <SourceBadge compact source={term.source satisfies Source} />
    </p>
  );
}

/**
 * Review and confirm the purchase and insurance terms. Nothing changes until the last step.
 * Skipped boxes keep the estimates already in use, shown with the labels the sim gave them.
 * The terms apply to every future, so keep and replace stay comparable. Your profile is never edited.
 */
export function AssumptionsReview({ fields, current, applied, prepare, onConfirm, onReset }: AssumptionsReviewProps) {
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [draft, setDraft] = useState<Extract<ScenarioTermsResult, { ok: true }> | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const inEffect = describeApplied(applied, fields);
  const anyEntered = fields.some((f) => (values[f.field] ?? "").trim() !== "");

  const review = () => {
    const { entered, bad } = parseEntered(values);
    if (bad.length > 0) {
      const names = fields.filter((f) => bad.includes(f.field)).map((f) => f.label.toLowerCase());
      return setProblem(`Check ${names.join(" and ")}: that isn't a number.`);
    }
    const tooBig = checkAgainstPrice(entered, current.replacementPrice?.value);
    if (tooBig) return setProblem(tooBig);
    const result = prepare(entered);
    if (!result.ok) return setProblem(result.error);
    setProblem(null);
    setDraft(result);
    setStep("review");
  };

  const confirm = () => {
    if (!draft) return;
    onConfirm(draft.assumptions);
    setValues({});
    setDraft(null);
    setStep("edit");
  };

  const enteredFields = fields.filter((f) => (values[f.field] ?? "").trim() !== "");
  const skippedFields = fields.filter((f) => (values[f.field] ?? "").trim() === "");

  return (
    <section aria-label="Purchase and insurance terms" data-testid="terms-review" className="mx-auto w-full max-w-3xl">
      <p className="mb-1 text-sm text-ink/50">Your purchase and insurance terms</p>
      <p className="text-base text-ink/70">
        Enter only what you know. Anything you skip keeps the estimate shown. These apply to every future, so the comparison stays fair.
      </p>

      {inEffect.length > 0 && (
        <div data-testid="terms-in-effect" className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-ink/70">
          <span className="text-ink/50">In effect:</span>
          {inEffect.map((t) => (
            <span key={t.field} className="flex items-center gap-1.5">
              {t.label} {t.text}
              <SourceBadge compact source="user" />
            </span>
          ))}
          <button
            type="button"
            onClick={onReset}
            className="border-b border-ink/40 pb-0.5 text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Back to estimates
          </button>
        </div>
      )}

      {step === "edit" ? (
        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            review();
          }}
        >
          <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
            {fields.map(({ field, label, unit }) => (
              <div key={field} className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-${field}`} className="text-xs text-ink/60">
                  {label} <span className="text-ink/55">({unit === "USD/month" ? "$ a month" : unit === "USD" ? "$" : unit === "percent" ? "%" : unit})</span>
                </label>
                <input
                  id={`${id}-${field}`}
                  type="text"
                  inputMode="decimal"
                  value={values[field] ?? ""}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [field]: e.target.value }));
                    setProblem(null);
                  }}
                  placeholder="Skip to keep the estimate"
                  className={inputClass}
                />
                <Now field={field} unit={unit} term={current[field]} />
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between gap-4">
            <p role="status" data-testid="terms-problem" className={cn("text-sm", problem ? "text-ink" : "text-ink/55")}>
              {problem ?? (anyEntered ? "You will see what changes before it does." : "Nothing entered yet.")}
            </p>
            <button
              type="submit"
              disabled={!anyEntered}
              className="h-9 shrink-0 rounded-full bg-ink px-5 text-sm font-medium text-canvas transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Review
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-5" data-testid="terms-review-step">
          <h3 className="text-lg font-medium text-ink">Review before anything changes</h3>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {enteredFields.map(({ field, label, unit }) => {
              const now = current[field];
              const entered = parseEntered({ [field]: values[field] }).entered[field];
              return (
                <li key={field} data-testid="terms-changed" className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
                  <span className="text-base text-ink">{label}</span>
                  <span className="flex items-center gap-2 text-base font-medium text-ink">
                    {formatTerm(field, unit, entered)}
                    <SourceBadge compact source="user" />
                  </span>
                  <span className="text-sm text-ink/50">{now ? `was ${formatTerm(field, unit, now.value)}` : "no estimate before"}</span>
                </li>
              );
            })}
          </ul>
          {skippedFields.length > 0 && (
            <div data-testid="terms-unchanged" className="mt-4">
              <p className="mb-1 text-sm text-ink/50">Not changing (the estimates stay)</p>
              <ul className="space-y-1 text-sm text-ink/60">
                {skippedFields.map(({ field, label, unit }) => (
                  <li key={field} className="flex items-center gap-2">
                    <span>{label}:</span>
                    {current[field] ? (
                      <>
                        <span>{formatTerm(field, unit, current[field]!.value)}</span>
                        <SourceBadge compact source={current[field]!.source} />
                      </>
                    ) : (
                      <span className="text-ink/55">not used yet</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-5 flex items-center justify-end gap-6">
            <button
              type="button"
              onClick={() => setStep("edit")}
              className="border-b border-ink/40 pb-0.5 text-sm text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={confirm}
              className="h-9 rounded-full bg-ink px-5 text-sm font-medium text-canvas transition-colors hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Confirm
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
