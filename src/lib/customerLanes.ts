/** Customer lanes + 5-year contract rate books. Local persist + Supabase. */

import { CUSTOMER_LANE_SEED } from "../data/customerLaneSeed";
import { isValidISODate } from "./chicagoDate";
import { commodityRankLabel, tallyLabel } from "./commodity";

export const CUSTOMER_LANES_STORE_KEY = "chitrader.load-tracker.customer-lanes.v1";
export const CUSTOMER_LANES_TABLE = "customer_lanes";

export const LANE_COMMODITIES = [
  "Yard Waste",
  "Residual",
  "Recycle",
  "Cardboard",
  "Glass",
  "C&D",
  "Wood",
  "Tires",
  "Leachate (tanker)",
  "Trash (MSW)",
] as const;
export type LaneCommodity = (typeof LANE_COMMODITIES)[number];
