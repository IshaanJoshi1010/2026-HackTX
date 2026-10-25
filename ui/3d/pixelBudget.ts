/** Keep high-DPI displays from multiplying a full-HD stage's fill cost. */
export function stagePixelRatio(width: number, height: number, deviceRatio: number): number {
  const area = Math.max(1, width * height);
  return Math.max(1, Math.min(2, deviceRatio || 1, Math.sqrt(1920 * 1080 / area)));
}
