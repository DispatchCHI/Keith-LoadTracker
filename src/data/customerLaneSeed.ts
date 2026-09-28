/** Starting Trash/MSW customer-lane rates. Contract periods are dated so a
 * later 5-year renewal is a new row, not an overwrite of history. */

export type SeedLane = {
  customer: string;
  destination: string;
  commodity: string;
  effectiveDate: string;
  tiers: [number, number, number, number, number] | null;
};

const MSW = "Trash (MSW)";
/** Unknown start of the current 5-year book — old enough that today’s loads hit it. */
export const CURRENT_CONTRACT_START = "2021-01-01";

function trash(
  customer: string,
  destination: string,
  tiers: [number, number, number, number, number],
): SeedLane {
  return {
    customer,
    destination,
    commodity: MSW,
    effectiveDate: CURRENT_CONTRACT_START,
    tiers,
  };
}

function stub(customer: string): SeedLane {
  return {
    customer,
    destination: "",
    commodity: MSW,
    effectiveDate: CURRENT_CONTRACT_START,
    tiers: null,
  };
}

/** Known transfer-station routes (matches stations.ts). Null tiers = rates TBD. */
function catalogRoute(
  customer: string,
  destination: string,
  commodity: string = MSW,
): SeedLane {
  return {
    customer,
    destination,
    commodity,
    effectiveDate: CURRENT_CONTRACT_START,
    tiers: null,
  };
}

export const CUSTOMER_LANE_SEED: readonly SeedLane[] = [
  trash("Melrose", "DeKalb", [114.57, 116.55, 118.52, 120.5, 126.41]),
  trash("Melrose", "Rockford", [129.02, 131.23, 133.45, 135.67, 142.36]),
  trash("Batavia", "Rockford", [113.7, 115.97, 117.63, 119.59, 125.46]),
  trash("Batavia", "DeKalb", [80.77, 82.17, 83.56, 84.94, 89.12]),
  trash("Roscoe", "Rockford", [64.73, 65.85, 66.97, 68.06, 71.43]),
  trash("Elgin", "DeKalb", [83.97, 85.44, 86.87, 88.32, 92.66]),
  trash("Elgin", "Rockford", [92.69, 94.3, 95.89, 97.48, 102.28]),
  trash("Evanston", "Rockford", [131.33, 133.59, 135.86, 138.12, 144.91]),
  trash("Evanston", "Zion", [92.58, 94.16, 95.77, 97.36, 102.16]),
  trash("Tri-State", "Liberty", [136.36, 138.71, 141.06, 143.41, 150.46]),
  trash("Tri-State", "Prairie View", [94.28, 95.9, 97.53, 99.16, 104.03]),
  stub("LRS"),
  stub("Schererville"),
  // Medill must be a real lane customer so Log Load shows the chip after
  // lane-strict pickup filtering. Destinations match stations.ts / live hauls
  // (Newton County, Pontiac) — not invented catalog leftovers.
  catalogRoute("Medill", "Pontiac"),
  catalogRoute("Medill", "Newton County"),
  catalogRoute("Medill", "Organix", "Yard Waste"),
  catalogRoute("Medill", "Willow Ranch", "Yard Waste"),
  stub("Chicago Heights"),
  stub("Apollo"),
  stub("Calumet"),
  stub("Northlake"),
  // Arc must be a real lane customer so Log Load shows the chip after
  // lane-strict pickup filtering. Destinations match stations.ts.
  catalogRoute("Arc", "Winnebago"),
  catalogRoute("Arc", "Pontiac"),
  catalogRoute("Arc", "Organix", "Yard Waste"),
  catalogRoute("Arc", "Thelens", "Yard Waste"),
  catalogRoute("Arc", "Hodgkins", "Recycle"),
  catalogRoute("Arc", "Resource MGT", "Recycle"),
  stub("Hooker Street"),
  stub("Wheeling"),
  stub("CitiWaste"),
  stub("Dekalb Reload"),
  stub("Rockdale"),
  stub("Ford"),
];
