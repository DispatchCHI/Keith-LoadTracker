import { displayDriverName, type DriverType } from "../lib/driverType";

export function DriverTypeTag({ type }: { type: DriverType | null | undefined }) {
  if (type !== "tanker" && type !== "wf") return null;
  return (
    <span className={`drv-type-tag is-${type}`}>{type === "tanker" ? "Tanker" : "WF"}</span>
  );
}

export function RosterPersonName({
  name,
  type,
}: {
  name: string;
  type?: DriverType | null;
}) {
  return (
    <span className="drv-person">
      <span className="drv-person-name">{displayDriverName(name)}</span>
      <DriverTypeTag type={type} />
    </span>
  );
}
