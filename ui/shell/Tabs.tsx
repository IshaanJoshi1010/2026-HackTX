"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

export const tabId = (group: string, id: string) => `${group}-tab-${id}`;
export const panelId = (group: string, id: string) => `${group}-panel-${id}`;

export interface TabsProps<T extends string> {
  /** Names the set, and namespaces the ids that tie each tab to its panel. */
  group: string;
  /** What a screen reader calls the set of tabs. */
  label: string;
  tabs: ReadonlyArray<{ id: T; label: ReactNode }>;
  value: T;
  /** NoInfer, so a state setter (which also takes an updater function) cannot widen T. */
  onChange(id: NoInfer<T>): void;
  className?: string;
  tabClassName(selected: boolean): string;
}

/**
 * Tabs that work by keyboard: arrow keys, Home and End move between them (and open the one you land on), only the
 * selected tab is in the tab order, and each tab names the panel it controls. The consumer renders the panel with
 * role="tabpanel", id={panelId(group, value)} and aria-labelledby={tabId(group, value)}.
 */
export function Tabs<T extends string>({ group, label, tabs, value, onChange, className, tabClassName }: TabsProps<T>) {
  const refs = useRef(new Map<T, HTMLButtonElement>());

  const go = (id: T) => {
    onChange(id);
    refs.current.get(id)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const next =
      e.key === "ArrowRight" ? (index + 1) % tabs.length
      : e.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    go(tabs[next].id);
  };

  return (
    <div role="tablist" aria-label={label} className={className}>
      {tabs.map((tab, i) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) refs.current.set(tab.id, el);
              else refs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            id={tabId(group, tab.id)}
            aria-selected={selected}
            aria-controls={panelId(group, tab.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={tabClassName(selected)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
