"use client";

import { Box, Grid3x3, Play, RotateCcw, ScatterChart, SkipForward } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useForkStore, type ViewMode } from "@/ui/store/useForkStore";
import { IconButton } from "./IconButton";

const MODES: Array<{ mode: ViewMode; label: string; icon: LucideIcon }> = [
  { mode: "solid", label: "Solid view", icon: Box },
  { mode: "wireframe", label: "Wireframe view", icon: Grid3x3 },
  { mode: "points", label: "Points view", icon: ScatterChart },
];

/**
 * Drives CarStage props. While the reveal or morph runs there is only Skip.
 * Afterwards a quiet column of round buttons sits on the right edge.
 */
export function StageControls() {
  const stagePhase = useForkStore((s) => s.stage.phase);
  const viewMode = useForkStore((s) => s.stage.viewMode);
  const { setViewMode, resetCamera, replayReveal, skip } = useForkStore((s) => s.actions);

  if (stagePhase !== "interactive") {
    return (
      <button
        type="button"
        onClick={skip}
        className="absolute bottom-12 left-1/2 z-10 flex h-10 -translate-x-1/2 items-center gap-2 rounded bg-ink/10 px-6 text-sm font-medium text-ink backdrop-blur-md transition-colors hover:bg-ink/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Skip <SkipForward className="size-4" />
      </button>
    );
  }

  return (
    <div
      role="toolbar"
      aria-label="Stage controls"
      aria-orientation="vertical"
      className="absolute right-6 top-20 z-10 flex flex-col gap-2 opacity-60 transition-opacity duration-300 focus-within:opacity-100 hover:opacity-100"
    >
      {MODES.map(({ mode, label, icon: Icon }) => (
        <IconButton key={mode} label={label} aria-pressed={viewMode === mode} active={viewMode === mode} onClick={() => setViewMode(mode)}>
          <Icon />
        </IconButton>
      ))}
      <IconButton label="Reset view" onClick={resetCamera}>
        <RotateCcw />
      </IconButton>
      <IconButton label="Replay reveal" onClick={replayReveal}>
        <Play />
      </IconButton>
    </div>
  );
}
