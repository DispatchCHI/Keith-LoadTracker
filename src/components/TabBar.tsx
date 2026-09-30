import { useState } from "react";
import type { TabId } from "../types";
import { BrandMark } from "./BrandMark";

const MORE_TABS: { id: TabId; label: string }[] = [
  { id: "driver", label: "Drivers" },
  { id: "calloffs", label: "Call offs" },
  { id: "vacation", label: "Vacation" },
  { id: "trucks", label: "Search" },
  { id: "customers", label: "Customers" },
  { id: "analytics", label: "Analytics" },
];

export function TabBar({
  tab,
  onChange,
  vertical = false,
}: {
  tab: TabId;
  onChange: (tab: TabId) => void;
  vertical?: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(vertical);
  const moreActive = MORE_TABS.some((item) => item.id === tab);

  return (
    <nav
      className={vertical ? "tab-bar tab-bar-side" : "tab-bar"}
      aria-label="Primary"
    >
      {vertical ? (
        <div className="brand-side">
          <BrandMark size="sm" />
        </div>
      ) : null}
      <div className="tab-row">
        <button
          type="button"
          className={tab === "today" ? "tab tab-active" : "tab"}
          onClick={() => {
            if (!vertical) setMoreOpen(false);
            onChange("today");
          }}
        >
          Today
        </button>
        <button
          type="button"
          className={moreActive ? "tab tab-active" : "tab"}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          More
        </button>
      </div>
      {moreOpen ? (
        <div className="more-panel">
          {MORE_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "more-item more-item-active" : "more-item"}
              onClick={() => {
                if (!vertical) setMoreOpen(false);
                onChange(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
