# Fork ownership economics

Every number the sim shows comes from this file's rules. Default rates live in `/sim/config.ts` and are labeled `illustrative`.

## The accounting identity

```
netEconomicCost_t = cumulativeCash_t + (loanBalance_t - loanBalance_0) - (vehicleValue_t - vehicleValue_0)
```

- `cumulativeCash_t`: every dollar paid out from month 1 through month t (fuel, maintenance, insurance, loan payments, down payment, tax and fees, loan payoff at a trade-in) minus sale or trade-in proceeds.
- `loanBalance_t`: what is still owed at the end of month t on whichever car is owned then.
- `vehicleValue_t`: modeled market value at the end of month t of whichever car is owned then.
- `_0` values: the starting car and loan at month 0, before anything is simulated.

## Why nothing is counted twice

- **Loan principal nets to zero.** A payment's principal part is cash out, and it lowers the balance by the same amount. Only the interest part raises net cost.
- **Depreciation shows up once.** It only enters through `vehicleValue_t - vehicleValue_0`. We never also subtract resale proceeds as a gain on top of that.
- **A trade-in is neutral at the instant it happens.** Proceeds lower cash by V, but the car worth V leaves the books. Paying off balance B raises cash by B, but the liability B goes away. Net change: zero.
- **Buying is fee-only at the instant of purchase.** Price P, tax and fees F, down payment D, the rest (P - D) financed. Cash goes up by D + F, the loan by P - D, and value by P. Net change: (D + F) + (P - D) - P = F.

So what's left over the horizon is the real cost: fuel, maintenance, insurance, interest, tax and fees, and depreciation.

## Three views, never merged

| View | Fields | Question it answers |
| --- | --- | --- |
| Cash | `cumulativeCash` | How much money left my account? |
| Assets and liabilities | `vehicleValue`, `loanBalance` | What do I own and owe at month t? |
| Net economic cost | `netEconomicCost` | What did owning this car really cost me? |

## Conventions

- Horizon: 60 monthly points, months 1 to 60. Each point is the state at the end of that month. Month 0 is the starting state and is not emitted (net cost there is 0 by definition).
- `fuelSpend` and `maintenanceSpend` on a point are that month's spend, not running totals.
- An event at month m applies from month m onward. A replacement at month m happens at the start of month m, so that month's driving is on the new car.
- Fuel: `monthlyMiles / mpg * fuelPricePerGal`. Check: 12,000 mi at 28 mpg and $3.00/gal is $1,285.71 per year.
- Loan payment: `P * r / (1 - (1 + r)^-n)` with `r = APR / 12`. Check: $20,000 at 6% for 60 months is $386.66 per month.
- Existing loan: `FinanceState` gives balance, monthly payment and remaining term, but no APR. The sim solves for the implied rate deterministically (bisection) and labels it `estimated`.
- Paid off: loan balance 0 and loan payments 0 at every month.
- Negative equity: if the balance is more than the trade-in value, the gap is cash out at the trade-in. The identity still holds.

## Replacement (keep vs replace over the same 60 months)

A `vehicle_replacement` event at month m happens at the start of month m, in this order:

1. **Sell or trade in** the current car at its modeled value (illustrative). Proceeds lower cash.
2. **Pay off** whatever is still owed. Payoff raises cash. If the payoff is more than the proceeds, that's negative equity: it's paid in cash and flagged as a warning. A paid-off car has zero payoff. A lease is ended by paying its remaining payments (flagged).
3. **Buy** the new car. Cash goes up by the down payment plus tax and fees, and the rest of the price is financed.
4. From month m on, fuel, maintenance and value all follow the new car's spec sheet. Insurance uses the same monthly figure.

Purchase inputs, in order of precedence:

| Input | Where it comes from |
| --- | --- |
| Price | event `payload.price`, then `assumptions.replacementPrice`, then the car's modeled market value at purchase (labeled `estimated`) |
| Odometer at purchase | event `payload.mileage`, then 12,000 mi per year of age (illustrative) |
| Sales tax, fees, down payment, APR, term | `assumptions.salesTaxRate`, `purchaseFees`, `downPayment`, `newLoanApr`, `newLoanTermMonths`, then `/sim/config.ts` (6.25%, $450, 10% of price, 6.5%, 60 months, all illustrative) |

The new car's value is anchored to its purchase price: `value_t = price * curve(age_t, odo_t) / curve(age_buy, odo_buy)`. So right at purchase, value equals price, and net cost moves by exactly the tax and fees. Raising the price by dP raises cash by dP x (1 + tax rate) for a cash purchase, and raises net cost by that amount minus the change in the car's value at the horizon.

## Branching

- `fork(parent, month, newEvents, name)` keeps the parent's events before the fork month, drops the parent's own future, and adds the new events at or after the fork month. Any new event dated earlier is moved to the fork month, and a note is added to it.
- `makeReplaceScenario(parent, car, month?)` keeps all of the parent's events and adds a confirmed replacement. The default month is the first relocation or family change, else month 12.
- The sim is causal: month t depends only on months up to t. So a branch's points before its fork month are byte-identical to its parent's, and so are the points before any moved, edited or deleted event.
- A branch can't move, edit or delete an event it inherited (`InheritedEventError`). Use `canEditEvent` to disable those controls.

## Worked examples (each is a test)

| Case | Inputs | Expected |
| --- | --- | --- |
| Fuel, one year | 12,000 mi, 28 mpg, $3.00/gal | $1,285.71 |
| Loan payment | $20,000, 6% APR, 60 months | $386.66 per month |
| Fee-only purchase | Price P, fees F, down D, rest financed | Net cost change at purchase = F |
| Paid-off keep | No loan | Loan terms zero everywhere |
