import type { MaintenanceMilestone } from "../contracts";

/** How many times a task has come due at or below this odometer reading. */
export function occurrencesUpTo(task: MaintenanceMilestone, odometer: number): number {
  if (odometer < task.atMiles) return 0;
  if (!task.repeatEveryMiles) return 1;
  return Math.floor((odometer - task.atMiles) / task.repeatEveryMiles) + 1;
}

export interface DueTask { task: MaintenanceMilestone; atMiles: number }

/** Every task occurrence in (fromMiles, toMiles], in schedule order then mileage order. */
export function dueBetween(tasks: readonly MaintenanceMilestone[], fromMiles: number, toMiles: number): DueTask[] {
  const due: DueTask[] = [];
  for (const task of tasks) {
    const first = occurrencesUpTo(task, fromMiles) + 1, last = occurrencesUpTo(task, toMiles);
    for (let k = first; k <= last; k++) due.push({ task, atMiles: task.atMiles + (k - 1) * (task.repeatEveryMiles ?? 0) });
  }
  return due;
}
