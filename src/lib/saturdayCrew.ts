import { addDays, formatShortDate, parseISODate, weekdayOfISO } from "./chicagoDate";

export type DispatchPerson = "tim" | "keith" | "mike";
export type SaturdayDuty = DispatchPerson | "everyone" | "open";

export type SaturdayRow = {
  date: string;
  duty: SaturdayDuty;
  note: string;
  /** The other person on a recorded switch. */
  with: DispatchPerson | null;
};

export type VacationUse = {
  id: string;
  person: DispatchPerson;
  start: string;
  end: string;
};

export type DispatchLogEntry = {
  id: string;
  text: string;
};

export type DispatchBoard = {
  year: number;
  saturdays: SaturdayRow[];
  vacations: VacationUse[];
  log: DispatchLogEntry[];
  updatedAt: string;
};

export type DispatchStore = {
  version: 1;
  years: Record<string, DispatchBoard>;
};

export const DISPATCH_CREW: {
  id: DispatchPerson;
  name: string;
  weeks: number;
  days: number;
}[] = [
  { id: "tim", name: "Tim", weeks: 3, days: 15 },
  { id: "keith", name: "Keith", weeks: 3, days: 15 },
  { id: "mike", name: "Mike", weeks: 2, days: 10 },
];

const DUTY_LABEL: Record<SaturdayDuty, string> = {
  mike: "Mike",
  tim: "Tim",
  keith: "Keith",
  everyone: "Everyone",
  open: "Not set",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Seed = [string, SaturdayDuty, string, DispatchPerson | null];

/** 2026 Saturday Dispatch sheet. Holiday weeks are Everyone. Jul 4 was left blank. */
const SHEET_2026: Seed[] = [
  ["2026-01-03", "everyone", "New Years Day", null],
  ["2026-01-10", "mike", "", null],
  ["2026-01-17", "tim", "", null],
  ["2026-01-24", "keith", "", null],
  ["2026-01-31", "mike", "", null],
  ["2026-02-07", "tim", "", null],
  ["2026-02-14", "keith", "", null],
  ["2026-02-21", "mike", "", null],
  ["2026-02-28", "tim", "", null],
  ["2026-03-07", "keith", "", null],
  ["2026-03-14", "mike", "", null],
  ["2026-03-21", "tim", "", null],
  ["2026-03-28", "keith", "", null],
  ["2026-04-04", "mike", "", null],
  ["2026-04-11", "tim", "", null],
  ["2026-04-18", "keith", "", null],
  ["2026-04-25", "mike", "", null],
  ["2026-05-02", "tim", "", null],
  ["2026-05-09", "keith", "", null],
  ["2026-05-16", "mike", "", null],
  ["2026-05-23", "tim", "", null],
  ["2026-05-30", "everyone", "Memorial Day", null],
  ["2026-06-06", "keith", "", null],
  ["2026-06-13", "mike", "", null],
  ["2026-06-20", "tim", "", null],
  ["2026-06-27", "keith", "", null],
  ["2026-07-04", "open", "4th of July", null],
  ["2026-07-11", "mike", "", "tim"],
  ["2026-07-18", "tim", "", "mike"],
  ["2026-07-25", "keith", "", null],
  ["2026-08-01", "mike", "", null],
  ["2026-08-08", "tim", "", null],
  ["2026-08-15", "keith", "", "mike"],
  ["2026-08-22", "mike", "", "keith"],
  ["2026-08-29", "tim", "", null],
  ["2026-09-05", "keith", "", null],
  ["2026-09-12", "everyone", "Labor Day", null],
  ["2026-09-19", "mike", "", null],
  ["2026-09-26", "tim", "", null],
  ["2026-10-03", "keith", "", null],
  ["2026-10-10", "mike", "", null],
  ["2026-10-17", "tim", "", null],
  ["2026-10-24", "keith", "", null],
  ["2026-10-31", "mike", "", null],
  ["2026-11-07", "tim", "", null],
  ["2026-11-14", "keith", "", null],
  ["2026-11-21", "mike", "", null],
  ["2026-11-28", "everyone", "Thanksgiving", null],
  ["2026-12-05", "tim", "", null],
  ["2026-12-12", "keith", "", null],
  ["2026-12-19", "mike", "", null],
  ["2026-12-26", "everyone", "Christmas", null],
];

const SHEET_2026_LOG: DispatchLogEntry[] = [
  { id: "sheet-jul-11", text: "Jul 11 Mike with Tim" },
  { id: "sheet-jul-18", text: "Jul 18 Tim with Mike" },
  { id: "sheet-aug-15", text: "Aug 15 Keith with Mike" },
  { id: "sheet-aug-22", text: "Aug 22 Mike with Keith" },
];

export function dutyLabel(duty: SaturdayDuty): string {
  return DUTY_LABEL[duty];
}

export function personName(person: DispatchPerson): string {
  return DUTY_LABEL[person];
}

export function monthNames(): readonly string[] {
  return MONTHS;
}

export function saturdaysOfYear(year: number): string[] {
  const jan1 = `${year}-01-01`;
  const first = addDays(jan1, (6 - weekdayOfISO(jan1) + 7) % 7);
  const dates: string[] = [];
  let cursor = first;
  while (parseISODate(cursor).y === year) {
    dates.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return dates;
}

export function saturdayOnOrAfter(iso: string): string {
  const add = (6 - weekdayOfISO(iso) + 7) % 7;
  return addDays(iso, add);
}

function rowFromSeed(date: string, seed: Seed | undefined): SaturdayRow {
  if (!seed) return { date, duty: "open", note: "", with: null };
  return { date, duty: seed[1], note: seed[2], with: seed[3] };
}

export function seedBoard(year: number, updatedAt = "1970-01-01T00:00:00.000Z"): DispatchBoard {
  const known = new Map(year === 2026 ? SHEET_2026.map((row) => [row[0], row] as const) : []);
  return {
    year,
    saturdays: saturdaysOfYear(year).map((date) => rowFromSeed(date, known.get(date))),
    vacations: [],
    log: year === 2026 ? SHEET_2026_LOG.map((entry) => ({ ...entry })) : [],
    updatedAt,
  };
}

export function boardForYear(store: DispatchStore, year: number): DispatchBoard {
  return store.years[String(year)] ?? seedBoard(year);
}

function eachDay(start: string, end: string): string[] {
  const from = start <= end ? start : end;
  const to = start <= end ? end : start;
  const days: string[] = [];
  let cursor = from;
  while (cursor <= to && days.length < 400) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

export function vacationDates(vacations: VacationUse[], person: DispatchPerson): string[] {
  const seen = new Set<string>();
  for (const use of vacations) {
    if (use.person !== person) continue;
    for (const date of eachDay(use.start, use.end)) seen.add(date);
  }
  return [...seen].sort();
}

export function daysUsed(vacations: VacationUse[], person: DispatchPerson): number {
  return vacationDates(vacations, person).length;
}

export function daysLeft(vacations: VacationUse[], person: DispatchPerson): number {
  const bank = DISPATCH_CREW.find((crew) => crew.id === person)?.days ?? 0;
  return Math.max(0, bank - daysUsed(vacations, person));
}

export function usedPercent(vacations: VacationUse[], person: DispatchPerson): number {
  const bank = DISPATCH_CREW.find((crew) => crew.id === person)?.days ?? 1;
  return Math.min(100, Math.round((daysUsed(vacations, person) / bank) * 100));
}

export function vacationChipLabel(use: VacationUse): string {
  if (use.start === use.end) return formatShortDate(use.start);
  const start = parseISODate(use.start);
  const end = parseISODate(use.end);
  if (start.m === end.m && start.y === end.y) {
    return `${formatShortDate(use.start)}-${end.d}`;
  }
  return `${formatShortDate(use.start)}-${formatShortDate(use.end)}`;
}

function touches(use: VacationUse, date: string): boolean {
  const start = use.start <= use.end ? use.start : use.end;
  const end = use.start <= use.end ? use.end : use.start;
  return date >= start && date <= end;
}

export function addVacationDay(
  board: DispatchBoard,
  person: DispatchPerson,
  date: string,
  id = `vac-${person}-${date}`,
): DispatchBoard {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return board;
  if (parseISODate(date).y !== board.year) return board;
  if (board.vacations.some((use) => use.person === person && touches(use, date))) return board;
  return {
    ...board,
    vacations: [...board.vacations, { id, person, start: date, end: date }],
  };
}

export function removeVacation(board: DispatchBoard, id: string): DispatchBoard {
  if (!board.vacations.some((use) => use.id === id)) return board;
  return { ...board, vacations: board.vacations.filter((use) => use.id !== id) };
}

function replaceSaturday(
  board: DispatchBoard,
  date: string,
  patch: (row: SaturdayRow) => SaturdayRow,
  logText: string | null,
  logId: string,
): DispatchBoard {
  const index = board.saturdays.findIndex((row) => row.date === date);
  if (index < 0) return board;
  const nextRow = patch(board.saturdays[index]);
  if (
    nextRow.duty === board.saturdays[index].duty &&
    nextRow.note === board.saturdays[index].note &&
    nextRow.with === board.saturdays[index].with
  ) {
    return board;
  }
  const saturdays = board.saturdays.slice();
  saturdays[index] = nextRow;
  const log = logText ? [...board.log, { id: logId, text: logText }] : board.log;
  return { ...board, saturdays, log };
}

export function setSaturdayDuty(
  board: DispatchBoard,
  date: string,
  duty: SaturdayDuty,
  logId = `log-${date}-${duty}`,
): DispatchBoard {
  const current = board.saturdays.find((row) => row.date === date);
  if (!current || current.duty === duty) return board;
  return replaceSaturday(
    board,
    date,
    (row) => ({ ...row, duty, with: null }),
    `${formatShortDate(date)} set to ${dutyLabel(duty)}`,
    logId,
  );
}

export function setSaturdayNote(
  board: DispatchBoard,
  date: string,
  note: string,
  logId = `log-${date}-note`,
): DispatchBoard {
  const trimmed = note.trim();
  const current = board.saturdays.find((row) => row.date === date);
  if (!current || current.note === trimmed) return board;
  const text = trimmed
    ? `${formatShortDate(date)} note: ${trimmed}`
    : `${formatShortDate(date)} note cleared`;
  return replaceSaturday(board, date, (row) => ({ ...row, note: trimmed }), text, logId);
}

export function isDispatchPerson(value: string): value is DispatchPerson {
  return value === "tim" || value === "keith" || value === "mike";
}

export function isSaturdayDuty(value: string): value is SaturdayDuty {
  return isDispatchPerson(value) || value === "everyone" || value === "open";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function normalizeBoard(value: unknown, year: number): DispatchBoard | null {
  const record = asRecord(value);
  if (!record || record.year !== year) return null;
  if (!Array.isArray(record.saturdays)) return null;
  const byDate = new Map<string, SaturdayRow>();
  for (const item of record.saturdays) {
    const row = asRecord(item);
    if (!row || typeof row.date !== "string") continue;
    if (typeof row.duty !== "string" || !isSaturdayDuty(row.duty)) continue;
    const withPerson = typeof row.with === "string" && isDispatchPerson(row.with) ? row.with : null;
    byDate.set(row.date, {
      date: row.date,
      duty: row.duty,
      note: typeof row.note === "string" ? row.note : "",
      with: withPerson,
    });
  }
  const saturdays = saturdaysOfYear(year).map(
    (date) => byDate.get(date) ?? { date, duty: "open" as const, note: "", with: null },
  );
  const vacations: VacationUse[] = [];
  if (Array.isArray(record.vacations)) {
    for (const item of record.vacations) {
      const use = asRecord(item);
      if (!use || typeof use.id !== "string") continue;
      if (typeof use.person !== "string" || !isDispatchPerson(use.person)) continue;
      if (typeof use.start !== "string" || typeof use.end !== "string") continue;
      vacations.push({ id: use.id, person: use.person, start: use.start, end: use.end });
    }
  }
  const log: DispatchLogEntry[] = [];
  if (Array.isArray(record.log)) {
    for (const item of record.log) {
      const entry = asRecord(item);
      if (!entry || typeof entry.id !== "string" || typeof entry.text !== "string") continue;
      log.push({ id: entry.id, text: entry.text });
    }
  }
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : "";
  return { year, saturdays, vacations, log, updatedAt };
}
