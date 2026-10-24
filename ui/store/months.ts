/** The timeline is 60 months. One definition, used by the store and the timeline. */
export const MONTH_MAX = 60;

export const clampMonth = (m: number): number =>
  Number.isFinite(m) ? Math.min(MONTH_MAX, Math.max(0, Math.round(m))) : 0;
