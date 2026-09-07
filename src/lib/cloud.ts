import type { Load } from "../types";

export type LoadRow = {
  id: string;
  date: string;
  truck: string;
  pickup: string;
  commodity: string;
  destination: string;
  station_id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  display_name: string | null;
};

export function rowToLoad(row: LoadRow): Load {
  return {
    id: row.id,
    truck: row.truck,
    pickup: row.pickup,
    commodity: row.commodity,
    destination: row.destination,
    stationId: row.station_id,
    date: row.date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? undefined,
    displayName: row.display_name ?? undefined,
  };
}

export function loadToRow(
  load: Load,
  userId: string | null,
): Omit<LoadRow, "created_at" | "updated_at"> & {
  created_at: string;
  updated_at: string;
} {
  return {
    id: load.id,
    date: load.date,
    truck: load.truck,
    pickup: load.pickup,
    commodity: load.commodity,
    destination: load.destination,
    station_id: load.stationId,
    created_at: load.createdAt,
    updated_at: load.updatedAt,
    created_by: load.createdBy ?? userId,
    display_name: load.displayName ?? null,
  };
}
