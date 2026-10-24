"use client";

import { useState } from "react";
import { car } from "@/ui/mocks";
import { selectActiveVehicle } from "@/ui/store/selectors";
import { useForkStore } from "@/ui/store/useForkStore";
import { BottomDock } from "./BottomDock";
import { Hud } from "./Hud";
import { Identity } from "./Identity";
import { PANEL_INSET } from "./Panel";
import { PanelLeft } from "./PanelLeft";
import { PanelRight } from "./PanelRight";
import { StageBackdrop } from "./StageBackdrop";
import { StageControls } from "./StageControls";

/**
 * Reveal and workspace share this tree on purpose: CarStage stays mounted from
 * the first particle to the last panel, so the 3D scene is never rebuilt.
 *
 * The car fills the screen. Everything else is layered on top and arrives in
 * order: name, timeline, hint, then the edge buttons for the side panels.
 * (The 3D canvas should have a transparent background so the floor shows.)
 */
export function Workspace() {
  const phase = useForkStore((s) => s.phase);
  const vehicle = useForkStore(selectActiveVehicle);
  const stage = useForkStore((s) => s.stage);
  const quality = useForkStore((s) => (s.ui.lowPerformance ? "low" : "high"));
  const reducedMotion = useForkStore((s) => s.ui.reducedMotion);
  const leftOpen = useForkStore((s) => s.ui.leftOpen);
  const rightOpen = useForkStore((s) => s.ui.rightOpen);
  const { onRevealStage, onTransitionComplete, onModelStatus } = useForkStore((s) => s.actions);
  // Height of the timeline dock. Panels and controls stop above it.
  const [dockHeight, setDockHeight] = useState(136);

  if (!vehicle) return null;
  const { CarStage } = car;
  const revealing = phase === "reveal";

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ "--dock-h": `${dockHeight}px` } as React.CSSProperties}>
      {/* The stage ends where the timeline begins, so the car re-frames above it as it grows. */}
      <div className="absolute inset-x-0 top-0" style={{ bottom: dockHeight }}>
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

      <Identity />
      <StageControls />

      {!revealing && (
        <>
          <PanelLeft />
          <PanelRight />
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col">
            {/* The HUD keeps clear of open panels and re-flows its numbers in the space left. */}
            <div
              className="@container transition-[padding] duration-500 ease-out"
              style={{ paddingLeft: leftOpen ? PANEL_INSET : 0, paddingRight: rightOpen ? PANEL_INSET : 0 }}
            >
              <Hud />
            </div>
            {/* The command box lands here in B4. Not a control yet, so nothing is drawn. */}
            <div data-slot="command-box" className="mx-auto w-[min(720px,90%)]" />
            <BottomDock onHeight={setDockHeight} />
          </div>
        </>
      )}
    </div>
  );
}
