import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BrandMark } from "./components/BrandMark";
import { SessionBar } from "./components/SessionBar";
import { TabBar } from "./components/TabBar";
import { chicagoToday } from "./lib/chicagoDate";
import { useDesktopLayout } from "./lib/layout";
import { setActiveTab } from "./lib/activeTab";
import { replaceRetiredTotalsLocation, replaceTabLocation, tabFromLocation } from "./lib/tabRoute";
import { CallOffsScreen } from "./screens/CallOffsScreen";
import { CustomersScreen } from "./screens/CustomersScreen";
import { DriverScreen } from "./screens/DriverScreen";
import { EditLoadScreen } from "./screens/EditLoadScreen";
import { DayNotesScreen } from "./screens/DayNotesScreen";
import { LogLoadScreen } from "./screens/LogLoadScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { AnalyticsScreen } from "./screens/AnalyticsScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { DispatchScreen } from "./screens/DispatchScreen";
import { TodaySkinToggle } from "./components/TodaySkinToggle";
import { readTodaySkin, writeTodaySkin, type TodaySkin } from "./lib/todaySkin";
import { TodayScreen } from "./screens/TodayScreen";
import { TotalsScreen } from "./screens/TotalsScreen";
import { YardDeskScreen } from "./screens/YardDeskScreen";
import { VacationScreen } from "./screens/VacationScreen";
import { AuthProvider, useAuth } from "./store/AuthContext";
import { CallOffLogProvider } from "./store/CallOffLogContext";
import { CustomerLanesProvider } from "./store/CustomerLanesContext";
import { DailyEodProvider } from "./store/DailyEodContext";
import { DayNotesProvider } from "./store/DayNotesContext";
import { SaturdayCrewProvider } from "./store/SaturdayCrewContext";
import { DispatchTalliesProvider } from "./store/DispatchTalliesContext";
import { DriverGoneProvider } from "./store/DriverGoneContext";
import { DriverNotesProvider } from "./store/DriverNotesContext";
import { DriverRosterProvider } from "./store/DriverRosterContext";
import { DriversProvider } from "./store/DriversContext";
import { SpecialtyProvider } from "./store/SpecialtyContext";
import { VacationProvider } from "./store/VacationContext";
import { LoadsProvider, useLoads } from "./store/LoadsContext";
import type { TabId } from "./types";

type Overlay =
  | { kind: "log"; truck?: string; date?: string }
  | { kind: "edit"; loadId: string }
  | { kind: "day-notes"; date: string }
  | null;

function wrapOverlay(desktop: boolean, child: ReactNode) {
  if (!desktop) return child;
  return createPortal(
    <div className="modal-backdrop">
      <div className="modal-card">{child}</div>
    </div>,
    document.body,
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { configured, loading, session } = useAuth();
  useLayoutEffect(() => {
    document.body.classList.add("app-ready");
  }, []);
  if (configured && loading) {
    return (
      <div className="screen overlay-screen login-screen">
        <BrandMark size="lg" />
        <p className="field-hint">Signing in…</p>
      </div>
    );
  }
  if (configured && !session) return <LoginScreen />;
  return children;
}

function Shell() {
  const desktop = useDesktopLayout();
  const { findById } = useLoads();
  const [tab, setTab] = useState<TabId>(
    () => tabFromLocation(window.location) ?? "today",
  );
  useEffect(() => {
    setActiveTab(tab);
  }, [tab]);
  const [feedDate, setFeedDate] = useState(chicagoToday);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [justEditedId, setJustEditedId] = useState<string | null>(null);
  const [todaySkin, setTodaySkin] = useState<TodaySkin>(() => readTodaySkin());
  const [yardSlot, setYardSlot] = useState<HTMLDivElement | null>(null);
  const yardDesk = tab === "today" && todaySkin === "yard";

  function toggleTodaySkin() {
    setTodaySkin((current) => {
      const next: TodaySkin = current === "yard" ? "classic" : "yard";
      writeTodaySkin(next);
      return next;
    });
  }

  const skinToggle = (
    <TodaySkinToggle skin={todaySkin} onToggle={toggleTodaySkin} />
  );

  const editingLoad =
    overlay?.kind === "edit" ? findById(overlay.loadId) : undefined;
  const view: Overlay =
    overlay?.kind === "edit" && !editingLoad ? null : overlay;

  const afterSave = (id: string, date?: string) => {
    setJustEditedId(id);
    setOverlay(null);
    if (date) setFeedDate(date);
    if (tab === "analytics" || tab === "vacation" || tab === "driver" || tab === "calloffs" || tab === "customers" || tab === "dispatch") return;
    setTab("today");
  };

  useEffect(() => {
    const apply = () => {
      if (replaceRetiredTotalsLocation(window.location)) {
        setTab("today");
        return;
      }
      const fromUrl = tabFromLocation(window.location);
      if (fromUrl) setTab(fromUrl);
    };
    apply();
    window.addEventListener("popstate", apply);
    window.addEventListener("hashchange", apply);
    return () => {
      window.removeEventListener("popstate", apply);
      window.removeEventListener("hashchange", apply);
    };
  }, []);

  function onTabChange(next: TabId) {
    setTab(next);
    replaceTabLocation(next);
  }

  const main = (
    <>
      {desktop ? (
        <header className={yardDesk ? "desk-topbar desk-topbar-yard" : "desk-topbar"}>
          <div className="desk-topbar-brand">
            <BrandMark size="lg" />
            <div>
              <h1 className="desk-brand">The Load Tracker</h1>
            </div>
          </div>
          {yardDesk ? <div className="yard-top-slot" ref={setYardSlot} /> : null}
          {tab === "today" ? skinToggle : null}
        </header>
      ) : null}

      <SessionBar />

      {!desktop ? <TabBar tab={tab} onChange={onTabChange} /> : null}

      <div className={desktop ? "desk-main" : "phone-stack"}>
        {desktop ? (
          <TabBar vertical tab={tab} onChange={onTabChange} />
        ) : null}

        <div className="phone-body">
          {tab === "today" && desktop && todaySkin === "yard" ? (
            <YardDeskScreen
              date={feedDate}
              onDateChange={setFeedDate}
              justEditedId={justEditedId}
              onLog={(date) => setOverlay({ kind: "log", date })}
              onNotes={(date) => setOverlay({ kind: "day-notes", date })}
              onEdit={(loadId) => setOverlay({ kind: "edit", loadId })}
              topSlot={yardSlot}
              dockBand
            />
          ) : null}

          {tab === "today" && desktop && todaySkin !== "yard" ? (
            <div className="desktop-split">
              <TodayScreen
                date={feedDate}
                onDateChange={setFeedDate}
                justEditedId={justEditedId}
                onLog={(date) => setOverlay({ kind: "log", date })}
                onNotes={(date) => setOverlay({ kind: "day-notes", date })}
                onEdit={(loadId) => setOverlay({ kind: "edit", loadId })}
                showDayPicker={false}
              />
              <TotalsScreen
                embedded
                date={feedDate}
                onDateChange={setFeedDate}
                onEdit={(loadId) => setOverlay({ kind: "edit", loadId })}
                onLog={(date) => setOverlay({ kind: "log", date })}
              />
            </div>
          ) : null}

          {tab === "today" && !desktop && todaySkin === "yard" ? (
            <YardDeskScreen
              date={feedDate}
              onDateChange={setFeedDate}
              justEditedId={justEditedId}
              onLog={(date) => setOverlay({ kind: "log", date })}
              onNotes={(date) => setOverlay({ kind: "day-notes", date })}
              onEdit={(loadId) => setOverlay({ kind: "edit", loadId })}
              skinToggle={skinToggle}
            />
          ) : null}

          {tab === "today" && !desktop && todaySkin !== "yard" ? (
            <TodayScreen
              date={feedDate}
              onDateChange={setFeedDate}
              justEditedId={justEditedId}
              onLog={(date) => setOverlay({ kind: "log", date })}
              onNotes={(date) => setOverlay({ kind: "day-notes", date })}
              onEdit={(loadId) => setOverlay({ kind: "edit", loadId })}
              showDayPicker
              skinToggle={skinToggle}
            />
          ) : null}

          {tab === "trucks" ? (
            <SearchScreen
              editingId={view?.kind === "edit" ? view.loadId : null}
              onEdit={(loadId) => setOverlay({ kind: "edit", loadId })}
              onLogForTruck={(truck, date) =>
                setOverlay({ kind: "log", truck, date })
              }
            />
          ) : null}

          {tab === "analytics" ? <AnalyticsScreen /> : null}

          {tab === "driver" ? <DriverScreen /> : null}

          {tab === "customers" ? <CustomersScreen /> : null}

          {tab === "calloffs" ? <CallOffsScreen /> : null}

          {tab === "vacation" ? <VacationScreen /> : null}

          {tab === "dispatch" ? <DispatchScreen /> : null}
        </div>
      </div>

    </>
  );

  return (
    <div className={desktop ? "app-shell is-desktop" : "app-shell"}>
      <div className="phone">
        {desktop || !view ? main : null}

        {view?.kind === "log"
          ? wrapOverlay(
              desktop,
              <LogLoadScreen
                initialTruck={view.truck}
                date={view.date}
                onCancel={() => setOverlay(null)}
                onSaved={afterSave}
              />,
            )
          : null}

        {view?.kind === "day-notes"
          ? wrapOverlay(
              desktop,
              <DayNotesScreen
                date={view.date}
                onCancel={() => setOverlay(null)}
              />,
            )
          : null}

        {view?.kind === "edit" && editingLoad
          ? wrapOverlay(
              desktop,
              <EditLoadScreen
                load={editingLoad}
                onCancel={() => setOverlay(null)}
                onSaved={afterSave}
                onDeleted={() => {
                  setJustEditedId(null);
                  setOverlay(null);
                }}
              />,
            )
          : null}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LoadsProvider>
        <SpecialtyProvider>
          <VacationProvider>
            <DriverRosterProvider>
              <DriverGoneProvider>
              <DriverNotesProvider>
                <CallOffLogProvider>
                  <DriversProvider>
                    <CustomerLanesProvider>
                    <DailyEodProvider>
                    <DispatchTalliesProvider>
                    <DayNotesProvider>
                      <SaturdayCrewProvider>
                      <Gate>
                        <Shell />
                      </Gate>
                      </SaturdayCrewProvider>
                    </DayNotesProvider>
                    </DispatchTalliesProvider>
                    </DailyEodProvider>
                    </CustomerLanesProvider>
                  </DriversProvider>
                </CallOffLogProvider>
              </DriverNotesProvider>
              </DriverGoneProvider>
            </DriverRosterProvider>
          </VacationProvider>
        </SpecialtyProvider>
      </LoadsProvider>
    </AuthProvider>
  );
}
