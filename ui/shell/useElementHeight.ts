"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Tracks an element's pixel height. Returns a callback ref, so it works even when the
 * element mounts later than the component using it (the bottom bar only exists after
 * the reveal). Falls back to a fixed height where there is no layout (tests, server).
 */
export function useElementHeight<T extends HTMLElement>(fallback = 150) {
  const [node, setNode] = useState<T | null>(null);
  const [height, setHeight] = useState(fallback);
  const ref = useCallback((el: T | null) => setNode(el), []);

  useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const h = Math.round(node.getBoundingClientRect().height);
      if (h > 0) setHeight(h);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [ref, height] as const;
}
