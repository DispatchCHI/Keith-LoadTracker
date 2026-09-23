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
