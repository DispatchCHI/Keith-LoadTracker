export type StationId = string;

export type Load = {
  id: string;
  truck: string;
  pickup: string;
  commodity: string;
  destination: string;
  /** Station id from master list, or `"custom"`. */
  stationId: StationId;
  /** Calendar date in America/Chicago, `YYYY-MM-DD`. */
  date: string;
  createdAt: string;
  updatedAt: string;
  seeded?: boolean;
  createdBy?: string;
  displayName?: string;
  /**
   * Display name of the dispatcher who last saved an edit.
   * Omitted when the cloud row has no column yet. Null means never edited.
   */
  editedBy?: string | null;
  /**
   * Full Roster driver name snapshotted at log / truck-edit time.
   * `string` = name frozen on this load; `null` = logged with no assignee;
   * omitted = pre-feature / unknown (do not invent from live roster).
   */
  driverName?: string | null;
};

export type TabId =
  | "today"
  | "trucks"
  | "customers"
  | "analytics"
  | "driver"
  | "vacation"
  | "calloffs"
  | "dispatch";
