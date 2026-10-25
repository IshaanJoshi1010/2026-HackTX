"use client";
import { useEffect, useState } from "react";
import manifest from "@/public/models/manifest.json";

export type Quality = "high" | "low";
const cache = new Map<string, Promise<Float32Array>>();
export function pointsUrl(vehicleId: string, quality: Quality): string | undefined {
  const url = manifest.find(entry => entry.vehicleId === vehicleId)?.points;
  return url ? quality === "low" ? url.replace(/\.bin$/, "-low.bin") : url : undefined;
}
export function loadPointsFile(url: string, quality: Quality): Promise<Float32Array> {
  const key = `${quality}:${url}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const task = (async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Point file unavailable (${response.status}).`);
    const buffer = await response.arrayBuffer();
    const count = quality === "high" ? 32768 : 8192;
    if (buffer.byteLength !== count * 12) throw new Error("Unexpected point count.");
    const view = new DataView(buffer), points = new Float32Array(count * 3);
    for (let i = 0; i < points.length; i++) {
      points[i] = view.getFloat32(i * 4, true);
      if (!Number.isFinite(points[i])) throw new Error("Invalid point coordinate.");
    }
    return points;
  })();
  cache.set(key, task);
  void task.catch(() => { if (cache.get(key) === task) cache.delete(key); });
  if (cache.size > 4) cache.delete(cache.keys().next().value!);
  return task;
}
export function usePointsFile(vehicleId: string, quality: Quality) {
  const url = pointsUrl(vehicleId, quality);
  const [state, setState] = useState<{ url?: string; points?: Float32Array; error?: string }>({});
  useEffect(() => {
    let alive = true;
    if (url) void loadPointsFile(url, quality).then(points => { if (alive) setState({ url, points }); }, error => { if (alive) setState({ url, error: String(error) }); });
    return () => { alive = false; };
  }, [url, quality]);
  return state.url === url ? state : {};
}
