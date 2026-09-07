import type { Load } from "../types";
import { addDays, chicagoToday } from "./chicagoDate";
import { newLoadId } from "./storage";

function stamp(isoDate: string, hour: number, minute: number, seq: number): string {
  const created = new Date(`${isoDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-05:00`);
  created.setSeconds(seq);
  return created.toISOString();
}

export function buildSeedLoads(today = chicagoToday()): Load[] {
  const yesterday = addDays(today, -1);

  const rows: Omit<Load, "id" | "createdAt" | "updatedAt" | "seeded">[] = [
    {
      truck: "418",
      pickup: "Melrose",
      commodity: "Trash (MSW)",
      destination: "Covanta",
      stationId: "melrose",
      date: today,
    },
    {
      truck: "207",
      pickup: "Northlake",
      commodity: "Yard Waste",
      destination: "Organix",
      stationId: "northlake",
      date: today,
    },
    {
      truck: "55",
      pickup: "Apollo",
      commodity: "Recycle",
      destination: "Hodgkins",
      stationId: "apollo",
      date: today,
    },
    {
      truck: "312",
      pickup: "Landfill",
      commodity: "Leachate (tanker)",
      destination: "CID",
      stationId: "custom",
      date: today,
    },
    {
      truck: "418",
      pickup: "Melrose",
      commodity: "Wood",
      destination: "RSI",
      stationId: "melrose",
      date: today,
    },
    {
      truck: "91",
      pickup: "Calumet",
      commodity: "Trash (MSW)",
      destination: "Pontiac",
      stationId: "calumet",
      date: today,
    },
    {
      truck: "55",
      pickup: "Apollo",
      commodity: "Trash (MSW)",
      destination: "Newton County",
      stationId: "apollo",
      date: today,
    },
    {
      truck: "418",
      pickup: "Melrose",
      commodity: "Wood",
      destination: "Prairie Hill",
      stationId: "melrose",
      date: yesterday,
    },
    {
      truck: "207",
      pickup: "Northlake",
      commodity: "Recycle",
      destination: "Hodgkins",
      stationId: "northlake",
      date: yesterday,
    },
    {
      truck: "118",
      pickup: "LRS",
      commodity: "C&D",
      destination: "Pontiac",
      stationId: "lrs",
      date: yesterday,
    },
    {
      truck: "418",
      pickup: "Northlake",
      commodity: "Recycle",
      destination: "Hodgkins",
      stationId: "northlake",
      date: yesterday,
    },
  ];

  const templates = [
    { truck: "418", pickup: "Melrose", commodity: "Trash (MSW)", destination: "Covanta", stationId: "melrose" },
    { truck: "207", pickup: "Northlake", commodity: "Yard Waste", destination: "Organix", stationId: "northlake" },
    { truck: "55", pickup: "Apollo", commodity: "Recycle", destination: "Hodgkins", stationId: "apollo" },
    { truck: "91", pickup: "Calumet", commodity: "Trash (MSW)", destination: "Pontiac", stationId: "calumet" },
    { truck: "118", pickup: "LRS", commodity: "C&D", destination: "Pontiac", stationId: "lrs" },
    { truck: "312", pickup: "Landfill", commodity: "Leachate (tanker)", destination: "CID", stationId: "custom" },
  ] as const;

  const historyOffsets = [3, 5, 7, 10, 12, 14, 18];
  for (const offset of historyOffsets) {
    const date = addDays(today, -offset);
    const take = 3 + (offset % 3);
    for (let i = 0; i < take; i++) {
      const t = templates[(offset + i) % templates.length];
      rows.push({ ...t, date });
    }
  }

  return rows.map((row, index) => {
    const hour = 6 + (index % 8);
    const minute = (index * 7) % 60;
    const ts = stamp(row.date, hour, minute, index);
    return {
      ...row,
      id: newLoadId(),
      createdAt: ts,
      updatedAt: ts,
      seeded: true,
    };
  });
}
