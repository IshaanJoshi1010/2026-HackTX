const small: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const scales: Record<string, number> = { thousand: 1000, million: 1000000, billion: 1000000000 };
export function extractNumbers(text: string): number[] {
  const digits = [...text.matchAll(/[-+−]?\d+(?:,\d{3})*(?:\.\d+)?(?:e[-+]?\d+)?(?:\s*[kmb]\b)?/gi)].map(match => {
    const token = match[0].trim().toLowerCase().replaceAll(",", "").replace("−", "-");
    const suffix = token.at(-1)!;
    return Number(token.replace(/[kmb]$/, "")) * ({ k: 1000, m: 1000000, b: 1000000000 }[suffix] ?? 1);
  }).filter(Number.isFinite);
  const words = text.toLowerCase().replaceAll("-", " ").match(/[a-z]+/g) ?? [];
  let current = 0, total = 0, active = false, sign = 1;
  const flush = () => { if (active) digits.push(sign * (total + current)); current = 0; total = 0; active = false; sign = 1; };
  for (const word of words) {
    if (word === "minus" || word === "negative") { flush(); sign = -1; }
    else if (Object.hasOwn(small, word)) { current += small[word]; active = true; }
    else if (word === "hundred") { current = (current || 1) * 100; active = true; }
    else if (Object.hasOwn(scales, word)) { total += (current || 1) * scales[word]; current = 0; active = true; }
    else if (word === "and" && active) continue;
    else { flush(); if (word === "half") digits.push(0.5); else if (word === "quarter") digits.push(0.25);
      else {
        const special: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, twice: 2, thrice: 3, dozen: 12 };
        if (Object.hasOwn(special, word)) digits.push(special[word]);
      } }
  }
  flush();
  return digits;
}
function inputNumbers(value: unknown): number[] {
  if (typeof value === "number") return Number.isFinite(value) ? [value] : [];
  if (typeof value === "string") return extractNumbers(value);
  if (Array.isArray(value)) return value.flatMap(inputNumbers);
  if (value && typeof value === "object") return Object.values(value).flatMap(inputNumbers);
  return [];
}
export function numberCheck(text: string, input: unknown): { ok: boolean; invented: number[] } {
  const allowed = new Set(inputNumbers(input));
  // Reject compound word fractions/decimals conservatively rather than misreading them as separate allowed values.
  if (/\b(?:and a half|and a quarter|one third|two thirds)\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten) point (?:zero|one|two|three|four|five|six|seven|eight|nine)\b/i.test(text)) return { ok: false, invented: [] };
  // A consecutive list index is formatting, not a new result. Other numerals remain checked.
  let listIndex = 0;
  const prose = text.split("\n").map(line => line.replace(/^\s*(\d+)[.)]\s+/, (full, number) => Number(number) === listIndex + 1 ? (listIndex++, "") : full)).join("\n");
  const invented = [...new Set(extractNumbers(prose).filter(number => !allowed.has(number)))];
  return { ok: invented.length === 0, invented };
}
