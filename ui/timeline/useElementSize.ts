"use client";

import { useCallback, useEffect, useState } from "react";

export interface Size {
  width: number;
  height: number;
}

/**
 * Tracks an element's pixel size. Returns a callback ref (so it works whenever the
 * element mounts), the size, and the element itself. Falls back to a fixed size where
 * there is no layout (tests, server).
 */
export function useElementSize<T extends HTMLElement>(fallback: Size = { width: 960, height: 360 }) {
  const [node, setNode] = useState<T | null>(null);
  const [size, setSize] = useState<Size>(fallback);
  const ref = useCallback((el: T | null) => setNode(el), []);

  useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const r = node.getBoundingClientRect();
      const width = Math.round(r.width);
      const height = Math.round(r.height);
      if (width <= 0 || height <= 0) return;
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [ref, size, node] as const;
}
