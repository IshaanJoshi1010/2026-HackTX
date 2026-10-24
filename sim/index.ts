export { simulate, simulateDetailed } from "./simulate";
export type { SimAssumption, DetailedSimulation } from "./simulate";
export { applyEvents } from "./events";
export { fuelCost } from "./fuel";
export { loanPayment, impliedApr, amortizeStep } from "./financing";
export { retainedFraction, mileageFactor, vehicleValue } from "./depreciation";
export { dueBetween, occurrencesUpTo } from "./maintenance";
export { HORIZON_MONTHS } from "./config";
