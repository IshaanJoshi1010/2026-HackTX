"use client";

import { cn } from "@/lib/utils";
import { CommandBox } from "@/ui/command/CommandBox";
import { car } from "@/ui/mocks";
import { RevealOverlay } from "@/ui/reveal/RevealOverlay";
import { selectActiveVehicle } from "@/ui/store/selectors";
import { useForkStore } from "@/ui/store/useForkStore";
import { CarView } from "./CarView";
import { DetailsSheet } from "./DetailsSheet";
import { ErrorNotice } from "./ErrorNotice";
import { FutureView } from "./FutureView";
import { Identity } from "./Identity";
import { StageBackdrop } from "./StageBackdrop";
import { useElementHeight } from "./useElementHeight";
import { ViewSwitch } from "./ViewSwitch";

/** Room under the car for the command bar and the page switch, so the car sits above them. */
const STAGE_BOTTOM = 176;

/**
 * Two pages share one stage. The CarStage stays mounted the whole time (the 3D
 * scene is never rebuilt); on the Future page it simply fades out behind the
 * timeline. The command bar and the page switch float on both pages.
 * (The 3D canvas should have a transparent background so the floor shows.)
 */
export function Workspace() {
  const phase = useForkStore((s) => s.phase);
  const view = useForkStore((s) => s.ui.view);
  const vehicle = useForkStore(selectActiveVehicle);
  const stage = useForkStore((s) => s.stage);
  const quality = useForkStore((s) => (s.ui.lowPerformance ? "low" : "high"));
  const reducedMotion = useForkStore((s) => s.ui.reducedMotion);
  const { onRevealStage, onTransitionComplete, onModelStatus } = useForkStore((s) => s.actions);
  // The bottom bar grows when a proposal or a question appears. The future page ends above it.
  const [barRef, barHeight] = useElementHeight<HTMLDivElement>(150);

  if (!vehicle) return null;
  const { CarStage } = car;
  const revealing = phase === "reveal";
  const carVisible = revealing || view === "car";

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        data-testid="stage-wrap"
        data-visible={carVisible}
        aria-hidden={!carVisible}
        style={{ bottom: STAGE_BOTTOM }}
        className={cn(
          "absolute inset-x-0 top-0 transition-opacity duration-500",
          // The canvas is opaque for now, so soften its lower edge instead of ending in a hard line. The fade is
          // only 16px, below the stage's own toolbar (18px up from the edge), so those buttons are never faded out.
          "[mask-image:linear-gradient(to_bottom,black_calc(100%_-_16px),transparent)]",
          carVisible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <StageBackdrop />
        <div className="absolute inset-0 z-[1]" data-testid="stage">
          <CarStage
            vehicle={vehicle}
            phase={stage.phase}
            transitionTo={stage.transitionTo ?? undefined}
            viewMode={stage.viewMode}
            quality={quality}
            reducedMotion={reducedMotion}
            resetCameraSignal={stage.resetCameraSignal}
            skipSignal={stage.skipSignal}
            replaySignal={stage.replaySignal}
            onRevealStage={onRevealStage}
            onTransitionComplete={onTransitionComplete}
            onModelStatus={onModelStatus}
          />
        </div>
      </div>

      {revealing ? (
        <>
          <Identity />
          <RevealOverlay />
        </>
      ) : (
        <>
          {view === "car" ? <CarView /> : <FutureView bottomInset={barHeight} />}
          <div ref={barRef} className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-4 px-4 pb-5">
            <ErrorNotice />
            <CommandBox />
            <ViewSwitch />
          </div>
          <DetailsSheet />
        </>
      )}
    </div>
  );
}
