/** Fuel cost = miles / mpg * price. Zero miles or a non-positive mpg costs nothing (simulate warns on bad mpg). */
export function fuelCost(miles: number, mpg: number, pricePerGal: number): number {
  if (miles <= 0 || mpg <= 0) return 0;
  return miles / mpg * pricePerGal;
}
