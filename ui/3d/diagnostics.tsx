"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";

/** Isolated harness listens in development only; no production UI or props added. */
export function RendererDiagnostics() {
  const renderer = useThree((state) => state.gl);
  const sample = useRef({ elapsed: 0, frames: 0, worst: 0 });
  useFrame((_, delta) => {
    if (process.env.NODE_ENV === "production") return;
    const current = sample.current;
    current.elapsed += delta; current.frames++; current.worst = Math.max(current.worst, delta);
    if (current.elapsed >= 1) {
      window.dispatchEvent(new CustomEvent("fork:3d-performance", { detail: { fps: current.frames / current.elapsed, worstFrameMs: current.worst * 1000, width: renderer.domElement.width, height: renderer.domElement.height } }));
      current.elapsed = 0; current.frames = 0; current.worst = 0;
    }
  });
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      const timer = setTimeout(() => window.dispatchEvent(new CustomEvent("fork:3d-renderer", { detail: renderer })), 0);
      return () => clearTimeout(timer);
    }
  }, [renderer]);
  return null;
}
