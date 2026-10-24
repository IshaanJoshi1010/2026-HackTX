export type VinValidation =
  | { ok: true; vin: string }
  | { ok: false; reason: "length" | "chars" | "forbidden_letter" | "check_digit" };

// ISO 3779 / North American check digit; optional because not every market requires it.
const transliteration: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4,
  N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function validateVin(vin: string, opts?: { checkDigit?: boolean }): VinValidation {
  if (typeof vin !== "string" || vin.length !== 17) return { ok: false, reason: "length" };
  if (!/^[A-Za-z0-9]+$/.test(vin)) return { ok: false, reason: "chars" };
  const normalized = vin.toUpperCase();
  if (/[IOQ]/.test(normalized)) return { ok: false, reason: "forbidden_letter" };
  if (opts?.checkDigit) {
    const total = [...normalized].reduce((sum, char, i) =>
      sum + (transliteration[char] ?? Number(char)) * weights[i], 0);
    const remainder = total % 11;
    if (normalized[8] !== (remainder === 10 ? "X" : String(remainder))) return { ok: false, reason: "check_digit" };
  }
  return { ok: true, vin: normalized };
}
