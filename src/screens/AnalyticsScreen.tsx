import { useMemo, useState } from "react";
import { BrandMark } from "../components/BrandMark";
import {
  SAME_WEEK_LAST_YEAR_DAYS,
  chicagoYearLabel,
  dailyCounts,
  formatPercentChange,
  formatSignedCount,
  loadsYearToDate,
  sumDailyCounts,
} from "../lib/analytics";
import {
  addDays,
  chicagoToday,
  dayNumber,
  formatHeaderDate,
  formatShortDate,
  startOfYear,
  weekdayOfISO,
  weekStartingSunday,
} from "../lib/chicagoDate";
import { rankCommodities, rankDestinations, rankPickups } from "../lib/totals";
import { useLoads } from "../store/LoadsContext";
import type { Load } from "../types";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKS_TO_SHOW = 6;
const RANK_LIMIT = 5;

function loadsBetween(loads: Load[], start: string, end: string): Load[] {
  return loads.filter((load) => load.date >= start && load.date <= end);
}

function tone(value: number): string {
  if (value > 0) return "an-up";
  if (value < 0) return "an-down";
  return "an-flat";
}

function Delta({ value }: { value: number }) {
  return <span className={tone(value)}>{formatSignedCount(value)}</span>;
}

export function AnalyticsScreen() {
  const today = chicagoToday();
  const { loads } = useLoads();
  const currentWeek = useMemo(() => weekStartingSunday(today), [today]);
  const [selectedStart, setSelectedStart] = useState(currentWeek[0]);

  const weeks = useMemo(
    () =>
      Array.from({ length: WEEKS_TO_SHOW }, (_, index) =>
        weekStartingSunday(addDays(currentWeek[0], -7 * index)),
      ),
    [currentWeek],
  );

  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const load of loads) map.set(load.date, (map.get(load.date) ?? 0) + 1);
    return map;
  }, [loads]);
  const countOn = (iso: string) => countByDate.get(iso) ?? 0;
  const sumDates = (dates: string[]) => sumDailyCounts(dailyCounts(loads, dates));

  const ytd = loadsYearToDate(loads, today).length;
  const lastYearSameDate = addDays(today, -SAME_WEEK_LAST_YEAR_DAYS);
  const ytdLastYear = loadsBetween(loads, startOfYear(lastYearSameDate), lastYearSameDate).length;
  const ytdDelta = ytd - ytdLastYear;
  const ytdPct = formatPercentChange(ytd, ytdLastYear);

  const elapsed = currentWeek.filter((day) => day <= today);
  const priorElapsed = elapsed.map((day) => addDays(day, -7));
  const thisWeekSoFar = sumDates(elapsed);
  const priorSameDays = sumDates(priorElapsed);
  const weekDelta = thisWeekSoFar - priorSameDays;
  const weekPct = formatPercentChange(thisWeekSoFar, priorSameDays);

  const selectedWeek = weeks.find((week) => week[0] === selectedStart) ?? currentWeek;
  const selectedIsCurrent = selectedWeek[0] === currentWeek[0];
  const selectedLoads = useMemo(() => {
    const end = addDays(selectedStart, 6);
    return loadsBetween(loads, selectedStart, end < today ? end : today);
  }, [loads, selectedStart, today]);
  const byPickup = useMemo(() => rankPickups(selectedLoads).slice(0, RANK_LIMIT), [selectedLoads]);
  const byDestination = useMemo(
    () => rankDestinations(selectedLoads).slice(0, RANK_LIMIT),
    [selectedLoads],
  );
  const byCommodity = useMemo(
    () => rankCommodities(selectedLoads).slice(0, RANK_LIMIT),
    [selectedLoads],
  );

  const year = chicagoYearLabel(today);
  const through = formatHeaderDate(today);
  const elapsedSpan =
    elapsed.length > 1
      ? `${WEEKDAY[weekdayOfISO(elapsed[0])]}–${WEEKDAY[weekdayOfISO(elapsed[elapsed.length - 1])]}`
      : WEEKDAY[weekdayOfISO(today)];
  const rankWhen = selectedIsCurrent ? "this week" : formatShortDate(selectedWeek[0]);

  return (
    <div className="screen an-screen">
      <header className="page-header">
        <div className="page-header-brand">
          <BrandMark />
          <div>
            <p className="eyebrow">Analytics</p>
            <h1 className="page-title">{year} year to date</h1>
          </div>
        </div>
        <p className="an-through">Through {through} · click a week for each day</p>
      </header>

      <div className="an-tiles">
        <article className="an-tile">
          <p className="an-k">Year to date</p>
          <p className="an-v">{ytd.toLocaleString("en-US")}</p>
          <p className="an-d">
            {formatShortDate(startOfYear(today))} – {formatShortDate(today)}
          </p>
        </article>
        <article className="an-tile">
          <p className="an-k">Last year, this date</p>
          <p className="an-v">{ytdLastYear.toLocaleString("en-US")}</p>
          <p className="an-d">
            <Delta value={ytdDelta} />
            {ytdPct ? <span className={tone(ytdDelta)}> · {ytdPct}</span> : null}{" "}
            vs {yearOf(lastYearSameDate)}
          </p>
        </article>
        <article className="an-tile">
          <p className="an-k">This week so far</p>
          <p className="an-v">{thisWeekSoFar.toLocaleString("en-US")}</p>
          <p className="an-d">
            {elapsedSpan} · {formatShortDate(elapsed[0])} – {formatShortDate(elapsed[elapsed.length - 1])}
          </p>
        </article>
        <article className="an-tile">
          <p className="an-k">Prior week, same days</p>
          <p className="an-v">{priorSameDays.toLocaleString("en-US")}</p>
          <p className="an-d">
            <Delta value={weekDelta} />
            {weekPct ? <span className={tone(weekDelta)}> · {weekPct}</span> : null}{" "}
            {elapsedSpan}
          </p>
        </article>
      </div>

      {loads.length === 0 ? (
        <div className="empty compact">
          <h2>No loads to chart</h2>
          <p>Day and year totals fill from the loads already on this desk.</p>
        </div>
      ) : (
        <>
          <section className="an-weeks">
            <div className="an-week-row an-week-head">
              <span>Week</span>
              <span>Loads</span>
              <span>Vs prior week</span>
              <span>Vs last year</span>
            </div>
            {weeks.map((week) => {
              const isCurrent = week[0] === currentWeek[0];
              const open = week[0] === selectedWeek[0];
              const comparable = isCurrent ? week.filter((day) => day <= today) : week;
              const total = sumDates(comparable);
              const prior = sumDates(comparable.map((day) => addDays(day, -7)));
              const lastYear = sumDates(
                comparable.map((day) => addDays(day, -SAME_WEEK_LAST_YEAR_DAYS)),
              );
              return (
                <div key={week[0]}>
                  <button
                    type="button"
                    className={open ? "an-week-row an-week-on" : "an-week-row"}
                    aria-expanded={open}
                    onClick={() => setSelectedStart(week[0])}
                  >
                    <span>
                      {formatShortDate(week[0])} – {formatShortDate(week[6])}
                      {isCurrent ? " · this week" : ""}
                    </span>
                    <span className="an-num">{total.toLocaleString("en-US")}</span>
                    <span>
                      <Delta value={total - prior} />
                    </span>
                    <span>
                      <Delta value={total - lastYear} />
                    </span>
                  </button>
                  {open ? (
                    <div className="an-days">
                      {week.map((iso) => {
                        const future = iso > today;
                        const isToday = iso === today;
                        return (
                          <article
                            key={iso}
                            className={isToday ? "an-day an-day-today" : "an-day"}
                          >
                            <span className="an-day-wd">
                              {isToday
                                ? formatHeaderDate(iso)
                                : `${WEEKDAY[weekdayOfISO(iso)]} ${dayNumber(iso)}`}
                            </span>
                            <span className="an-day-n">{future ? "—" : countOn(iso)}</span>
                            <span className="an-day-meta">
                              {future
                                ? "still ahead"
                                : `prior ${countOn(addDays(iso, -7))} · last yr ${countOn(addDays(iso, -SAME_WEEK_LAST_YEAR_DAYS))}`}
                            </span>
                          </article>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>

          <div className="an-ranks">
            <RankList title="Transfer station" when={rankWhen} rows={byPickup} />
            <RankList title="Landfill" when={rankWhen} rows={byDestination} />
            <RankList title="Commodity" when={rankWhen} rows={byCommodity} />
          </div>
        </>
      )}
    </div>
  );
}

function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

function RankList({
  title,
  when,
  rows,
}: {
  title: string;
  when: string;
  rows: { key: string; label: string; count: number }[];
}) {
  return (
    <article className="an-rank">
      <h2>
        {title}
        {title === "Commodity" ? ` · ${when}` : ""}
      </h2>
      {rows.length === 0 ? (
        <p className="an-day-meta">No loads {when}.</p>
      ) : (
        rows.map((row) => (
          <div className="an-line" key={row.key}>
            <span>{row.label}</span>
            <b>{row.count.toLocaleString("en-US")}</b>
          </div>
        ))
      )}
    </article>
  );
}
