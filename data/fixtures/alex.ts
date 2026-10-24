import type { DriverProfile } from "../../contracts";

// Fictional demo persona. Fuel price is a synthetic placeholder, not a verified local average.
export const alexProfile: DriverProfile = {
  location: "Austin, TX", annualMiles: 12000, householdSize: 2, children: 0, carSeats: 0,
  cargoNeed: "low", fuelPricePerGal: 3, financeType: "loan",
  priorities: { cost: 0.2, family: 0.2, longevity: 0.2, fuel: 0.2, comfort: 0.2 },
  provenance: {
    location: "synthetic", annualMiles: "synthetic", householdSize: "synthetic", children: "synthetic",
    carSeats: "synthetic", cargoNeed: "synthetic", fuelPricePerGal: "synthetic", financeType: "synthetic", priorities: "synthetic",
  },
};
