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

export type CrewMember = {
  id: DispatchPerson;
  /** First day on the job, `YYYY-MM-DD`, or null until it is entered. */
  startDate: string | null;
  /** Vacation weeks granted for this vacation bank year. A week is 5 days. */
  weeks: number;
};

export type DispatchBoard = {
  year: number;
  saturdays: SaturdayRow[];
  vacations: VacationUse[];
  log: DispatchLogEntry[];
  crew: CrewMember[];
  updatedAt: string;
};

export type DispatchStore = {
  version: 1;
  years: Record<string, DispatchBoard>;
};

export const DAYS_PER_WEEK = 5;
export const MAX_VACATION_WEEKS = 8;

/** Hire / start dates from the Dispatch Vacations sheet (one-time import). */
export const DISPATCH_HIRE_DATES: Record<DispatchPerson, string> = {
  tim: "2005-05-01",
  mike: "2022-02-22",
  keith: "2017-05-12",
};

/**
 * Sheet vacation bank still open for each person (anniversary-style label, not
 * plain calendar year). Tim & Keith have not started their 2026 bank yet; Mike has.
 */
export const DISPATCH_ACTIVE_VACATION_YEAR: Record<DispatchPerson, number> = {
  tim: 2025,
  keith: 2025,
  mike: 2026,
};

/**
 * One-time used-day import from the Dispatch Vacations sheet.
 * Board year = sheet bank label; dates may fall in the next calendar year.
 */
export const DISPATCH_VACATION_SEED: Record<
  number,
  Partial<Record<DispatchPerson, readonly string[]>>
> = {
  2025: {
    tim: [
      "2025-10-31",
      "2025-11-26",
      "2025-11-28",
      "2026-01-19",
      "2026-03-26",
      "2026-03-27",
      "2026-03-30",
      "2026-06-12",
      "2026-06-26",
      "2026-07-17",
      "2026-08-21",
      "2026-09-25",
    ],
    mike: [
      "2025-04-11",
      "2025-05-23",
      "2025-07-18",
      "2025-09-24",
      "2025-10-17",
      "2026-01-02",
      "2026-02-06",
      "2026-02-20",
    ],
    keith: [
      "2026-04-13",
      "2026-04-22",
      "2026-06-15",
      "2026-07-03",
      "2026-07-30",
      "2026-07-31",
      "2026-08-24",
    ],
  },
  2026: {
    mike: [
      "2026-04-17",
      "2026-05-22",
      "2026-05-26",
      "2026-06-04",
      "2026-06-05",
    ],
  },
};

/**
 * Tenure → weeks: first year 1 week; after 5 years 2 weeks; after 9 years 3 weeks.
 */
export function vacationWeeksFromTenure(years: number): number {
  if (!Number.isFinite(years) || years < 0) return 1;
  if (years >= 9) return 3;
  if (years >= 5) return 2;
  return 1;
}

/** Hire anniversary date in a calendar year (opens that labeled vacation bank). */
export function anniversaryInYear(hireDate: string, year: number): string | null {
  if (!isPlausibleHireDate(hireDate) || !Number.isInteger(year) || year < 1900) return null;
  const { m, d } = parseISODate(hireDate);
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Weeks for a vacation bank year = tenure as of that bank's anniversary start
 * (not "as of today"). Keith's 2025 bank opened 2025-05-12 at 8 years → 2 weeks;
 * 3 weeks begin with the 2026 bank on 2026-05-12.
 */
export function vacationWeeksForBank(
  person: DispatchPerson,
  hireDate: string | null,
  bankYear: number,
): number {
  const hire = hireDate && isPlausibleHireDate(hireDate) ? hireDate : DISPATCH_HIRE_DATES[person];
  const bankStart = anniversaryInYear(hire, bankYear);
  if (!bankStart) {
    return DISPATCH_CREW.find((crew) => crew.id === person)?.weeks ?? 1;
  }
  const years = yearsEmployed(hire, bankStart) ?? 0;
  const fromTenure = vacationWeeksFromTenure(years);
  // Sheet header said 1 week for Mike; Keith confirmed 2 weeks (under-5 tenure → formula 1).
  if (person === "mike") return Math.max(fromTenure, 2);
  return fromTenure;
}

/** @deprecated Use vacationWeeksForBank(person, hire, bankYear). */
export function seededVacationWeeks(person: DispatchPerson, bankYear: number): number {
  return vacationWeeksForBank(person, DISPATCH_HIRE_DATES[person], bankYear);
}

export const DISPATCH_CREW: {
  id: DispatchPerson;
  name: string;
  weeks: number;
}[] = [
  { id: "tim", name: "Tim", weeks: 3 },
  { id: "keith", name: "Keith", weeks: 2 },
  { id: "mike", name: "Mike", weeks: 2 },
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

export function defaultCrew(bankYear: number): CrewMember[] {
  return DISPATCH_CREW.map((person) => ({
    id: person.id,
    startDate: DISPATCH_HIRE_DATES[person.id],
    weeks: vacationWeeksForBank(person.id, DISPATCH_HIRE_DATES[person.id], bankYear),
  }));
}

export function seedBoard(year: number, updatedAt = "1970-01-01T00:00:00.000Z"): DispatchBoard {
  const known = new Map(year === 2026 ? SHEET_2026.map((row) => [row[0], row] as const) : []);
  const board: DispatchBoard = {
    year,
    saturdays: saturdaysOfYear(year).map((date) => rowFromSeed(date, known.get(date))),
    vacations: [],
    log: year === 2026 ? SHEET_2026_LOG.map((entry) => ({ ...entry })) : [],
    crew: defaultCrew(year),
    updatedAt,
  };
  return applyDispatchVacationSeed(board);
}

export function crewMember(board: DispatchBoard, person: DispatchPerson): CrewMember {
  return (
    board.crew.find((member) => member.id === person) ?? {
      id: person,
      startDate: DISPATCH_HIRE_DATES[person],
      weeks: vacationWeeksForBank(person, DISPATCH_HIRE_DATES[person], board.year),
    }
  );
}

export function bankDays(weeks: number): number {
  return Math.max(0, Math.round(weeks)) * DAYS_PER_WEEK;
}

/** True when the ISO date is a finished hire date, not a mid-type year like 0002. */
export function isPlausibleHireDate(startDate: string | null | undefined, asOf?: string): boolean {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return false;
  const year = Number(startDate.slice(0, 4));
  if (!Number.isFinite(year) || year < 1900) return false;
  if (asOf) {
    const asOfYear = parseISODate(asOf).y;
    if (Number.isFinite(asOfYear) && year > asOfYear + 1) return false;
  } else if (year > 2100) {
    return false;
  }
  return true;
}

/** Full years from the start date through `asOf`. */
export function yearsEmployed(startDate: string | null, asOf: string): number | null {
  if (!isPlausibleHireDate(startDate, asOf)) return null;
  const start = parseISODate(startDate!);
  const end = parseISODate(asOf);
  if (!start.y || !end.y) return null;
  let years = end.y - start.y;
  if (end.m < start.m || (end.m === start.m && end.d < start.d)) years -= 1;
  return Math.max(0, years);
}

function clampWeeks(weeks: number): number {
  if (!Number.isFinite(weeks)) return 0;
  return Math.min(MAX_VACATION_WEEKS, Math.max(0, Math.round(weeks)));
}

export function setCrewWeeks(board: DispatchBoard, person: DispatchPerson, weeks: number): DispatchBoard {
  const nextWeeks = clampWeeks(weeks);
  const current = crewMember(board, person);
  if (current.weeks === nextWeeks && board.crew.some((member) => member.id === person)) return board;
  const crew = DISPATCH_CREW.map((slot) => {
    const member = crewMember(board, slot.id);
    return slot.id === person ? { ...member, weeks: nextWeeks } : member;
  });
  return { ...board, crew };
}

export function setCrewStart(
  board: DispatchBoard,
  person: DispatchPerson,
  startDate: string | null,
): DispatchBoard {
  // Reject mid-typed years (0002, 0202, …) so they never overwrite a real hire date.
  if (startDate !== null && startDate !== "" && !isPlausibleHireDate(startDate)) return board;
  const nextDate = startDate && isPlausibleHireDate(startDate) ? startDate : null;
  const current = crewMember(board, person);
  const nextWeeks =
    nextDate != null
      ? vacationWeeksForBank(person, nextDate, board.year)
      : current.weeks;
  if (
    current.startDate === nextDate &&
    current.weeks === nextWeeks &&
    board.crew.some((member) => member.id === person)
  ) {
    return board;
  }
  const crew = DISPATCH_CREW.map((slot) => {
    const member = crewMember(board, slot.id);
    return slot.id === person
      ? { ...member, startDate: nextDate, weeks: clampWeeks(nextWeeks) }
      : member;
  });
  return { ...board, crew };
}

function latestStartDate(store: DispatchStore, person: DispatchPerson): string | null {
  const boards = Object.values(store.years).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  for (const board of boards) {
    const start = board.crew?.find((member) => member.id === person)?.startDate;
    if (start) return start;
  }
  return DISPATCH_HIRE_DATES[person] ?? null;
}

/**
 * One-time sheet import into a board: hire dates, tenure weeks, and used days for
 * this bank year. Does not touch Saturday rows. Skips people who already have
 * vacation chips so a live board is never wiped.
 */
export function applyDispatchVacationSeed(board: DispatchBoard): DispatchBoard {
  let next = board;
  for (const slot of DISPATCH_CREW) {
    const hire = DISPATCH_HIRE_DATES[slot.id];
    const member = crewMember(next, slot.id);
    if (!member.startDate) {
      next = setCrewStart(next, slot.id, hire);
    } else if (
      // One-time heal: pre-anniversary-fix boards stored Keith 2025 as 3 weeks
      // (tenure as-of-today). Do not force tenure weeks on every refresh - that
      // wiped manual week edits after they synced from other desks.
      slot.id === "keith" &&
      board.year === 2025 &&
      member.weeks === 3 &&
      vacationWeeksForBank("keith", member.startDate, 2025) === 2
    ) {
      next = setCrewWeeks(next, "keith", 2);
    }
  }

  const seed = DISPATCH_VACATION_SEED[board.year];
  if (!seed) return next;

  for (const person of Object.keys(seed) as DispatchPerson[]) {
    const days = seed[person];
    if (!days?.length) continue;
    const alreadySeeded = days.some((date) =>
      next.vacations.some((use) => use.id === `seed-${person}-${date}`),
    );
    if (alreadySeeded) continue;
    // Someone already logged days on this bank year — leave their chips alone.
    if (daysUsed(next.vacations, person) > 0) continue;
    for (const date of days) {
      next = addVacationDay(next, person, date, `seed-${person}-${date}`);
    }
  }
  return next;
}

/** Ensure 2025/2026 boards carry the one-time vacation import without wiping Saturdays. */
export function ensureDispatchVacationSeed(store: DispatchStore): DispatchStore {
  let years = store.years;
  let changed = false;
  for (const year of [2025, 2026]) {
    const key = String(year);
    const existing = years[key];
    const current = existing ?? seedBoard(year);
    const seeded = existing == null ? current : applyDispatchVacationSeed(current);
    if (seeded === current && existing != null) continue;
    if (!changed) years = { ...years };
    changed = true;
    years[key] = {
      ...seeded,
      updatedAt: new Date().toISOString(),
    };
  }
  return changed ? { version: 1, years } : store;
}

export function boardForYear(store: DispatchStore, year: number): DispatchBoard {
  const board = store.years[String(year)] ?? seedBoard(year);
  const crew = (board.crew?.length ? board.crew : defaultCrew(year)).map((member) => {
    if (member.startDate) return member;
    const shared = latestStartDate(store, member.id);
    return shared ? { ...member, startDate: shared } : member;
  });
  const same = crew.every((member, index) => member.startDate === board.crew?.[index]?.startDate);
  if (same && board.crew?.length) return board;
  return { ...board, crew };
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

export function daysLeft(board: DispatchBoard, person: DispatchPerson): number {
  return Math.max(0, bankDays(crewMember(board, person).weeks) - daysUsed(board.vacations, person));
}

export function usedPercent(board: DispatchBoard, person: DispatchPerson): number {
  const bank = bankDays(crewMember(board, person).weeks);
  if (bank <= 0) return daysUsed(board.vacations, person) > 0 ? 100 : 0;
  return Math.min(100, Math.round((daysUsed(board.vacations, person) / bank) * 100));
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
  // Board year is the vacation bank label (sheet 2024/2025/2026). Dates may
  // fall in the next calendar year before the bank rolls over.
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
  const crew = defaultCrew(year).map((slot) => {
    if (!Array.isArray(record.crew)) return slot;
    const match = record.crew
      .map(asRecord)
      .find((member) => member?.id === slot.id);
    if (!match) return slot;
    const weeks = typeof match.weeks === "number" ? match.weeks : slot.weeks;
    const startDate = typeof match.startDate === "string" ? match.startDate : slot.startDate;
    return {
      id: slot.id,
      weeks: Math.min(MAX_VACATION_WEEKS, Math.max(0, Math.round(weeks))),
      startDate: startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : slot.startDate,
    };
  });
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : "";
  return { year, saturdays, vacations, log, crew, updatedAt };
}
