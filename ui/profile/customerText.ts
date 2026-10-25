/**
 * Wording for the person using the app, not for the people building it. Text that comes from other modules (a history
 * line, a disclaimer, an error) can carry build-time words like "demo" or "data". This is the one place that turns them
 * into plain words before they reach the screen, so nothing from anywhere can show them. Our own text is written plainly
 * to begin with; this is the net underneath.
 */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function customerText(text: string): string {
  return (
    text
      // whole phrases first
      .replace(/\bdemo data\b/gi, "illustrative figures")
      .replace(/\bdatasets?\b/gi, "source")
      // "Demo" opening a sentence is dropped and the next word takes the capital
      .replace(/(^|[.!?]\s+)demo\s+(\w)/gi, (_m, start: string, next: string) => `${start}${next.toUpperCase()}`)
      // anywhere else it is dropped: "current demo odometer" is "current odometer"
      .replace(/\bdemo\s+/gi, "")
      .replace(/\bdemo\b/gi, "sample")
      .replace(/\bdata\b/gi, (m) => (m[0] === "D" ? cap("information") : "information"))
  );
}
