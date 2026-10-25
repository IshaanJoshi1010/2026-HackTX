# Fork demo script (90 seconds)

Story A: after Alex's brain dump, keeping the Camry vs a RAV4 Hybrid is a **close call**. Fork says so, shows exactly what would make keeping win, and gives one next step. The numbers come from `sim/DEMO.md` and are pinned by tests, so if they differ on screen, something is off (see "If it looks different").

## Before you start

- Build and run: `npm run build && npm start`, then open `http://localhost:3000` in Chrome on a machine with a real GPU, at 1440x900 or bigger.
- No key and no network needed. With no `GEMINI_API_KEY` the app reads your sentence with plain rules that only extract what you wrote. With a key the AI reads it instead. The events are the same.
- Start clean: header icon (top right), "Your details", "Start over". Or use a private window.
- Use the sample car or the sample VIN. Both open the Alex demo. The model picker does not.
- Do not tap the "Who rides with you most?" chips during the reveal. Press Skip. Alex is already "Kids", and a different pick changes the household and the story.
- Do not change priorities. Alex's equal priorities are part of the story.

## The beats

| Time | You do | You say | The screen shows |
| --- | --- | --- | --- |
| 0:00 | The first screen is one VIN field. Type or paste `4T1G11AK1NU900001` (or tap **Use sample VIN**) and press Enter. | "This is Alex's Camry. A VIN gives the model, not the paint or the driver, so we label the 3D model representative." | The car assembles, then "2022 Toyota Camry, SE, Representative 3D model". Press Skip if it drags. |
| 0:15 | Drag to rotate. Tap **Future**. | "Here is the next five years if nothing changes." | "Life takes turns." A winding path with where you start, then a fork: keep the Camry, or a dashed offer to explore the RAV4. The card under it shows the net cost over five years with its source. |
| 0:30 | Back on **Car**, tap the suggestion under the box, press send. | "I just tell it what is changing." | A card: Move to Denver (1 yr), 20,000 miles a year (Now), Second child (2 yr 8 mo). The inferred ones say so. Nothing has changed yet. |
| 0:40 | Tap **Branch timeline**. | "Nothing counts until I confirm it." | The Future page. The path now has a numbered step for each change. Tap them: the miles say what they add to your cost, and the move and the second child say "No change to cost". **Details** opens the month by month cost. |
| 0:50 | Type: `Would switching to a RAV4 Hybrid make more sense?` | "Does a RAV4 Hybrid make more sense?" | **Close call** beside the heading, "Held in 9 of 9 tested cases", both ways on the fork (neither marked recommended), and a next step. The car morphs on the Car page. |
| 1:05 | Type: `What would have to change for keeping the Camry to be the better option?` | "What would make keeping it better?" | "Keeping the Camry wins below 14,434 mi/yr", a bar with the threshold and "You" at 20,000, and two reruns on either side. |
| 1:20 | Point at the next step. | "One concrete step, and it can say keep your car." | "Reevaluate if your driving drops below 14,434 mi/yr". |

## What to say about the numbers

- Fork did not push the new car. It is a close call, so it says so.
- Every number comes from deterministic code. The AI only turns the sentence into events and explains numbers it was handed.
- The break-even is a real search. Below about 14,400 miles a year keeping wins, and the two reruns under the bar let anyone check it.
- "Held in 9 of 9 tested cases" means the close-call verdict survived every depreciation and fuel price combination we tested. It is a count, not a probability.
- All of Alex is synthetic, and prices are illustrative. Each number carries a label that says so.

## The numbers on screen (all illustrative or synthetic)

| What | Value |
| --- | --- |
| Keep the Camry, net cost over 5 years | $31,287 |
| Replace with the RAV4, net cost over 5 years | $35,862 |
| Verdict | Close call, 0.50 vs 0.50 |
| Robustness | Held in 9 of 9 tested cases |
| Break-even (yearly miles) | 14,434 mi/yr, keeping wins below |
| Next step | Reevaluate if your driving drops below 14,434 mi/yr |

## If it looks different

- **Different numbers or a clear RAV4 win:** Alex's cargo need is probably not "low". You may have used the model picker, or answered a question. Use "Start over" and the sample car.
- **No explanation text under "Why":** with no AI it shows the engine's own lines. That is expected.
- **The car area says "Model unavailable":** the app keeps going on its own. The numbers do not need the model.
- **It feels slow:** it is the 3D scene on a weak GPU. Turn on "Low performance mode" in "Your details".
- **Anything stuck:** "Start over" resets it. Nothing is saved except the performance setting and your session.

## Offline check

Stop the network and unset `GEMINI_API_KEY`. The whole script above still runs. The manual form (the plus button) adds the same three changes: Moving to Denver at 1 year, 20,000 miles a year, and 2 children at 2 years 8 months.
