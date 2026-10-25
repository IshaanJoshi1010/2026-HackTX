"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group } from "three";
import { VehicleController } from "./VehicleController";
import type { CarStageProps } from "./types";

export function VehicleModel({ props, onReady, onBusy }: { props: CarStageProps; onReady: () => void; onBusy: (busy: boolean) => void }) {
  const { gl, camera, scene } = useThree();
  const mount = useRef<Group>(null);
  const controller = useRef<VehicleController | null>(null);
  const callbacks = useRef({ props, onReady });
  useLayoutEffect(() => { callbacks.current = { props, onReady }; });
  const vehicle = props.phase === "transition" && props.transitionTo ? props.transitionTo : props.vehicle;
  const previousSkip = useRef(props.skipSignal);
  const completedSelection = useRef<string | null>(null);
  useEffect(() => {
    const instance = new VehicleController(undefined, undefined, async root => { await gl.compileAsync(root, camera, scene); });
    controller.current = instance;
    mount.current?.add(instance.group);
    return () => { instance.dispose(); controller.current = null; completedSelection.current = null; };
  }, [gl, camera, scene]);

  useEffect(() => {
    const active = callbacks.current.props;
    const selected = active.phase === "transition" && active.transitionTo ? active.transitionTo : active.vehicle;
    const key = JSON.stringify([selected.id, selected.modelAsset, selected.paint, active.quality, active.reducedMotion, active.replaySignal]);
    // The parent adopts transitionTo after completion. Keep the already rendered clone.
    if (active.phase === "interactive" && completedSelection.current === key) return;
    completedSelection.current = null;
    void controller.current?.select(selected,
      active.reducedMotion ? 0.3 : active.phase === "transition" ? 1.8 : 0.45,
      (status) => callbacks.current.props.onModelStatus(status),
      () => callbacks.current.onReady(),
      () => { if (callbacks.current.props.phase === "transition") { completedSelection.current = key; callbacks.current.props.onTransitionComplete(); } },
      { quality: active.quality, reveal: active.phase === "reveal", transition: active.phase === "transition", reducedMotion: active.reducedMotion, onStage: stage => callbacks.current.props.onRevealStage(stage) });
  }, [vehicle.id, vehicle.modelAsset, vehicle.paint, props.phase, props.replaySignal, props.reducedMotion, props.quality]);

  useEffect(() => {
    if (props.skipSignal > previousSkip.current) controller.current?.skip();
    previousSkip.current = props.skipSignal;
  }, [props.skipSignal]);
  const wasBusy = useRef(false);
  useFrame((state, delta) => {
    controller.current?.update(delta, props.viewMode, state.gl.getPixelRatio());
    const busy = controller.current?.isMorphing ?? false;
    if (busy !== wasBusy.current) { wasBusy.current = busy; onBusy(busy); }
  });
  return <group ref={mount} dispose={null} />;
}
