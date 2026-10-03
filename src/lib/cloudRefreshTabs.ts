import type { TabId } from "../types";
import { isActiveTabOneOf } from "./activeTab";

/** Today UI + always-needed crew surfaces (poll while those tabs are open). */
export const TODAY_HOT_TABS = ["today"] as const satisfies readonly TabId[];

/** Drivers availability also feeds Analytics day picker counts. */
export const DRIVERS_POLL_TABS = ["today", "analytics", "driver"] as const satisfies readonly TabId[];

/** Call-off log feeds Today DriversCard and its own tab / Driver screen. */
export const CALL_OFF_POLL_TABS = ["today", "calloffs", "driver"] as const satisfies readonly TabId[];

/** Specialty board lives on Today. */
export const SPECIALTY_POLL_TABS = ["today"] as const satisfies readonly TabId[];

/** Customer lanes: Customers tab + Specialty chips on Today + Driver. */
export const CUSTOMER_LANES_POLL_TABS = [
  "customers",
  "today",
  "driver",
] as const satisfies readonly TabId[];

export const DRIVER_ROSTER_POLL_TABS = ["driver"] as const satisfies readonly TabId[];

export const VACATION_POLL_TABS = ["vacation", "driver"] as const satisfies readonly TabId[];

export const DRIVER_GONE_POLL_TABS = ["driver"] as const satisfies readonly TabId[];

export const DISPATCH_POLL_TABS = ["dispatch"] as const satisfies readonly TabId[];

export function pollWhenTabs(tabs: readonly TabId[]): () => boolean {
  return () => isActiveTabOneOf(tabs);
}
