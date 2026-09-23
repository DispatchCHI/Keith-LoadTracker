import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchAllPaged, pagedErrorMessage } from "../lib/cloud";
import { attachCloudRefresh } from "../lib/cloudRefresh";
import {
  addRosterEntry,
  applyRosterTombstones,
  cleanAssignedTruck,
  cleanDriverRosterKind,
  cleanDriverRosterYard,
  DRIVER_ROSTER_YARDS,
  cleanDriverTabGroup,
  findAssignedTruckConflict,
  moveRosterEntry,
  collapseDuplicateRosterEntries,
  phonesNeedingUpload,
  preservePhones,
  readDriverRosterPersisted,
  readDriverRosterUi,
  reconcileDriverRosterCloud,
  removeHiredAndMatchingSat,
  removeRosterEntry,
  resetSatRosterFromFull,
  rosterEntryCount,
  rosterStoreIsEmpty,
  seedEmptySatRostersFromFull,
  setSatDateForYard,
  updateRosterEntry,
  writeDriverRosterPersisted,
  writeDriverRosterUi,
  type DriverRosterEntry,
  type DriverRosterInput,
  type DriverRosterKind,
  type DriverRosterPersisted,
  type DriverRosterStore,
  type DriverRosterYard,
  type DriverTabGroup,
} from "../lib/driverRoster";
import { assignedTrucksNeedingUpload, preserveAssignedTrucks, preserveTruckNumbers } from "../lib/rosterAssignedTruck";
import {
  applyKnownHireDates,
  hireDatesNeedingUpload,
  preserveHireDates,
} from "../lib/rosterHireDate";
import { enforceOneYardPerDriver } from "../lib/rosterYardOwnership";
import { getSupabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

type EntryRow = {
  id: string;
  kind: string;
  yard: string;
  truck_number: string | null;
  assigned_truck?: string | null;
  name: string;
  status: string | null;
  hire_date?: string | null;
  phone?: string | null;
  sort_order: number;
  for_date: string | null;
  created_at: string;
  updated_at: string;
};

type DriverRosterContextValue = {
  store: DriverRosterStore;
  kind: DriverRosterKind;
  group: DriverTabGroup;
  yard: DriverRosterYard;
  setKind: (kind: DriverRosterKind) => void;
  setGroup: (group: DriverTabGroup) => void;
  setYard: (yard: DriverRosterYard) => void;
  cloud: boolean;
  refresh: () => Promise<void>;
  addDriver: (
    input: Omit<DriverRosterInput, "kind" | "yard">,
  ) => Promise<{ entry: DriverRosterEntry | null; conflictName?: string }>;
  setDriverStatus: (id: string, status: string | null) => Promise<void>;
  setDriverAssignedTruck: (
    id: string,
    assignedTruck: string | null,
  ) => Promise<{ ok: boolean; conflictName?: string }>;
  setDriverProfile: (
    id: string,
    patch: { hireDate?: string | null; phone?: string | null },
  ) => Promise<void>;
  removeDriver: (id: string) => Promise<void>;
  removeHiredAndSat: (id: string) => Promise<void>;
  moveDriver: (id: string, delta: -1 | 1) => Promise<void>;
  setSatDate: (forDate: string | null) => Promise<void>;
  resetSatToFullRoster: () => Promise<void>;
};

const DriverRosterContext = createContext<DriverRosterContextValue | null>(null);

function rowsToStore(rows: EntryRow[]): DriverRosterStore {
  const store: DriverRosterStore = { entries: {} };
  for (const row of rows) {
    store.entries[row.id] = {
      id: row.id,
      kind: cleanDriverRosterKind(row.kind),
      yard: cleanDriverRosterYard(row.yard),
      truckNumber: row.truck_number,
      assignedTruck:
        cleanDriverRosterKind(row.kind) === "full"
          ? cleanAssignedTruck(row.assigned_truck ?? null)
          : null,
      name: row.name,
      status: row.status,
      hireDate: cleanDriverRosterKind(row.kind) === "full" ? row.hire_date ?? null : null,
      phone: cleanDriverRosterKind(row.kind) === "full" ? row.phone ?? null : null,
      sortOrder: row.sort_order,
      forDate: row.for_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  return store;
}
