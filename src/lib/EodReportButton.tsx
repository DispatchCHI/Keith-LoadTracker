import { useState } from "react";
import { buildEodReportPng, shareEodReportPng } from "../lib/eodReportImage";
import { useDailyEod } from "../store/DailyEodContext";
import { useLoads } from "../store/LoadsContext";

export function EodReportButton({ date }: { date: string }) {
  const { loadsOn } = useLoads();
  const { totalsOn } = useDailyEod();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setError(null);
    setBusy(true);
    try {
      const dataUrl = buildEodReportPng({
        date,
        loads: loadsOn(date),
        snapshot: totalsOn(date),
      });
      await shareEodReportPng(dataUrl, date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the EOD image");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="eod-report-wrap">
      <button
        type="button"
        className="log-load-top notes-top"
        onClick={() => void onClick()}
        disabled={busy}
      >
        {busy ? "Building…" : "EOD image"}
      </button>
      {error ? <span className="field-hint">{error}</span> : null}
    </span>
  );
}
