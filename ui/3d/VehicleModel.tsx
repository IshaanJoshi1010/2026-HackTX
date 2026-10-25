"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";
import { VehicleController } from "./VehicleController";
import type { CarStageProps } from "./types";

export function VehicleModel({ props, onReady }: { props: CarStageProps; onReady: () => void }) {
  const mount = useRef<Group>(null);
  const controller = useRef<VehicleController | null>(null);
  const callbacks = useRef({ props, onReady });
  useLayoutEffect(() => { callbacks.current = { props, onReady }; });
  const vehicle = props.phase === "transition" && props.transitionTo ? props.transitionTo : props.vehicle;
  const previousSkip = useRef(props.skipSignal);
  useEffect(() => {
    const instance = new VehicleController();
    controller.current = instance;
    mount.current?.add(instance.group);
    return () => { instance.dispose(); controller.current = null; };
  }, []);

  useEffect(() => {
    const active = callbacks.current.props;
    const selected = active.phase === "transition" && active.transitionTo ? active.transitionTo : active.vehicle;
    void controller.current?.select(selected,
      active.reducedMotion ? 0.3 : active.phase === "transition" ? 1.8 : 0.45,
      (status) => callbacks.current.props.onModelStatus(status),
      () => callbacks.current.onReady(),
      () => { if (callbacks.current.props.phase === "transition") callbacks.current.props.onTransitionComplete(); },
      { quality: active.quality, reveal: active.phase === "reveal", reducedMotion: active.reducedMotion, onStage: stage => callbacks.current.props.onRevealStage(stage) });
  }, [vehicle.id, vehicle.modelAsset, vehicle.paint, props.phase, props.replaySignal, props.reducedMotion, props.quality]);

  useEffect(() => {
    if (props.skipSignal > previousSkip.current) controller.current?.skip();
    previousSkip.current = props.skipSignal;
  }, [props.skipSignal]);
  useFrame((state, delta) => controller.current?.update(delta, props.viewMode, state.gl.getPixelRatio()));
  return <group ref={mount} dispose={null} />;
}
