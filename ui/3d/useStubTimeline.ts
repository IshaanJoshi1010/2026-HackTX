"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CarStageProps } from "./types";

const revealStages = ["converge", "pointcloud", "wireframe", "solid", "done"] as const;
const revealTimes = [0, 2000, 2500, 3000, 4000];

/** Stub only: callbacks and cancellation follow the production stage contract. */
export function useStubTimeline(props: CarStageProps) {
  const transitionId = props.transitionTo?.id;
  const callbacks = useRef(props);
  useLayoutEffect(() => { callbacks.current = props; });
  const [transitionFinished, setTransitionFinished] = useState(false);
  const finish = useRef<(() => void) | null>(null);
  const previousSkip = useRef(props.skipSignal);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;
    let completed = false;
    let nextStage = 0;
    const clearTimers = () => timers.forEach(clearTimeout);
    const schedule = (fn: () => void, delay: number) => {
      timers.push(setTimeout(() => { if (!cancelled) fn(); }, delay));
    };
    const emitThrough = (last: number) => {
      while (!cancelled && nextStage <= last) {
        callbacks.current.onRevealStage(revealStages[nextStage++]);
      }
    };
    const complete = () => {
      if (cancelled || completed) return;
      completed = true;
      clearTimers();
      if (props.phase === "reveal") emitThrough(revealStages.length - 1);
      if (props.phase === "transition" && transitionId) {
        setTransitionFinished(true);
        callbacks.current.onTransitionComplete();
      }
    };
    finish.current = complete;
    schedule(() => setTransitionFinished(false), 0);

    if (props.phase === "reveal") {
      if (props.reducedMotion) schedule(complete, 0);
      else revealTimes.forEach((time, index) => schedule(() => {
        emitThrough(index);
        if (index === revealStages.length - 1) completed = true;
      }, time));
    } else if (props.phase === "transition" && transitionId) {
      schedule(complete, props.reducedMotion ? 0 : 1800);
    }

    return () => {
      cancelled = true;
      clearTimers();
      finish.current = null;
    };
  }, [props.phase, props.vehicle.id, transitionId, props.replaySignal, props.reducedMotion]);

  useEffect(() => {
    if (props.skipSignal > previousSkip.current) finish.current?.();
    previousSkip.current = props.skipSignal;
  }, [props.skipSignal]);

  useEffect(() => {
    callbacks.current.onModelStatus({ vehicleId: props.vehicle.id, ready: true });
    if (props.phase === "transition") {
      if (transitionId) callbacks.current.onModelStatus({ vehicleId: transitionId, ready: true });
      else callbacks.current.onModelStatus({
        vehicleId: props.vehicle.id, ready: false, error: "transitionTo is required for a transition.",
      });
    }
  }, [props.vehicle.id, props.phase, transitionId]);

  return props.phase === "transition" && transitionFinished && props.transitionTo
    ? props.transitionTo : props.vehicle;
}
