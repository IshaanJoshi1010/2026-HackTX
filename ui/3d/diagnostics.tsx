"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";

/** Isolated harness listens in development only; no production UI or props added. */
export function RendererDiagnostics() {
  const renderer = useThree((state) => state.gl);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      const timer = setTimeout(() => window.dispatchEvent(new CustomEvent("fork:3d-renderer", { detail: renderer })), 0);
      return () => clearTimeout(timer);
    }
  }, [renderer]);
  return null;
}
