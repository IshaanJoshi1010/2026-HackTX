# Future view: interactive timeline (Ishaan's spec, verbatim)

Implement a redesign of Fork's existing Future view. Work directly in the current application and connect the finished interface to our real scenario data and calculations.

The goal: a visually striking, interactive timeline that lets someone explore their car's future without reading a screen full of text. The timeline should drive the experience, with the vehicle, costs, explanation, and chat all staying synchronized.

First inspect the existing Future components, simulation output, shared state, chat updates, and vehicle selection. Reuse the existing architecture and calculation logic. Then implement and verify the changes.

## 1. Make the timeline the main experience

Keep our black background, restrained typography, and winding-road concept.

Give the timeline most of the usable screen width. Use a centered content area around 1100-1280px on desktop, with responsive padding.

The initial screen should contain:
- A compact heading and recommendation.
- One large interactive branching timeline.
- Five-year costs beside each branch's destination.
- A time scrubber with play/pause.
- One compact explanation for the currently selected moment.
- Our existing chat composer and Car/Future navigation.

Move the large comparison section, long recommendation paragraph, and detailed explanations out of the default view. Preserve that information behind clearly labeled interactions.

Avoid repeated cards, excessive pills, decorative gradients, continuous glowing animations, and oversized empty spaces. Use thin paths, intentional spacing, readable labels, and one restrained accent for the active selection.

## 2. Make the timeline genuinely interactive

**Scrub time.** Dragging the scrubber or directly along the road changes the selected month. A marker follows the selected route. Update the displayed date, vehicle context, relevant milestones, and contextual explanation together. Keep the underlying time scale consistent. Position events by their actual modeled dates. The road's vertical bends are visual styling and must not imply a cost scale.

**Select an event.** Clicking or tapping an event moves the time marker to that event and selects it. Show its short name, date, and one useful impact sentence beneath the timeline. Keep the explanation area stable so selecting events does not push the page around.

**Select a future.** Clicking a branch or its destination selects that future. Emphasize the selected path and quiet the alternatives. Keep the selected month unchanged. Split the paths at the actual modeled replacement date. If replacement occurs in year one, the split must occur in year one. Shared life events must retain the same dates across both futures.

**Play the future.** Add play/pause that advances along the selected route, briefly pauses at important milestones, and stops at the end. Manual interaction should pause playback. Nothing should autoplay.

## 3. Make every view use the same scenario state

Use the existing shared store or introduce a small shared controller if necessary. Keep a single authoritative source for: current scenario and assumptions; selected future; selected month; selected event; simulation result and its revision/loading state.

Derive the timeline, displayed vehicle, financial figures, and explanations from that state.

The vehicle shown at a given month must match the selected future. Before a planned replacement, show the current vehicle; afterward, show the replacement vehicle. Preserve the user's actual owned vehicle and VIN separately from hypothetical selections.

Exploring a branch does not change the model's recommendation. A "Close call" result should remain a close call unless the assumptions or calculations change.

When chat changes an assumption: update the relevant scenario inputs; run the existing calculation flow; update events, dates, branches, costs, and explanations together; briefly highlight the affected elements; preserve the current selection when it remains valid.

Prevent stale calculation responses from overwriting newer results. During recalculation, clearly indicate that affected results are updating.

## 4. Reveal explanations progressively

Default event content should be short: event name; date; one sentence explaining its modeled impact; an "Explain this" action.

"Explain this" opens a compact drawer containing the full reasoning, relevant assumptions, source text when available, and any inferred date.

Rewrite technical parsing language into normal user language. For example: "June is assumed because you provided only the year."

Do not suggest that an event has no real-world effect simply because the model does not quantify it. Distinguish "No direct vehicle-cost change modeled" from "No effect."

If the model provides effects on space, fuel use, suitability, or vehicle life, show the relevant effects. Do not invent metrics or explanations.

## 5. Keep costs clear and consistent

Show each future's modeled five-year net cost beside its destination, plus one concise difference statement.

Five-year totals should not change merely because the user scrubs to another month. If we show cost through the selected month, label that separately and use actual monthly model output.

Add "Compare costs" to open the existing breakdown and available cost history in a drawer. Preserve the detailed data without rendering another road timeline below the main one.

Make the recommendation clickable. Its explanation should show the actual tradeoffs and priorities behind the result. If one car is cheaper but the overall result is close, explain the other factors using existing model output.

Keep illustrative-data labeling visible and consistent without repeating it under every number.

## 6. Make the motion feel precise

Use brief, coordinated transitions around 200-350ms: the marker moves to the selected point; path emphasis changes when switching futures; changed event positions transition when assumptions update; related values update as one coherent result.

Scrubbing must respond immediately. Respect reduced-motion preferences. Use the project's existing animation tools where possible.

## 7. Preserve usability

Keep the core explorer visible on a typical laptop at normal browser zoom. Allow natural scrolling on shorter screens.

Ensure: labels never overlap paths, controls, or each other; text is readable without zooming; mobile rearranges the layout instead of shrinking the desktop canvas; important actions work with keyboard and touch; details are available without hover; the chat composer never covers the timeline or explanations; existing Car/Future navigation continues working.

## 8. Implement and verify the actual behavior

Check: scrubbing updates the same month everywhere; event selection moves to the correct date; branch selection preserves the selected time; vehicle changes happen at the modeled replacement month; shared events remain aligned across futures; chat changes propagate through the interface; rapid updates cannot display stale results; five-year totals remain stable while scrubbing; drawers open, close, and show the correct context; playback pauses on manual interaction and stops at the end; desktop and mobile layouts remain readable.

Use the existing checks and browser tooling available in the project. Inspect the rendered result and fix layout issues before finishing.

Make reasonable implementation choices and complete the work. Finish with a concise summary of what changed, what was verified, and any remaining limitations.

---

## How this repo splits it (written by the integrator)

State lives in `ui/store/useForkStore.ts` (one clock): `activeMonth`, `selectedEventId`, `activeScenarioId` + `comparison` (keep/switch), `revision`, `lastChange`, `ui.playing`, `ui.drawer`, `ui.busy`; actions `setActiveMonth`, `selectEvent`, `selectFuture`, `play/pause/advanceMonth`, `openDrawer/closeDrawer`. `ui/journey/types.ts` is the shared contract (`Journey`), `ui/journey/fixtures.ts` has hand built Journeys to build against. `vehicleAtMonth` (store) says which car is in a future at a month.
