import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Building2,
  CalendarDays,
  PhoneOff,
  PieChart,
  Radio,
  Search,
  Users,
} from "lucide-react";
import type { TabId } from "../types";
import { BrandMark } from "./BrandMark";

const TABS: { id: TabId; label: string; Icon: LucideIcon }[] = [
  { id: "today", label: "Today", Icon: CalendarDays },
  { id: "driver", label: "Drivers", Icon: Users },
  { id: "calloffs", label: "Call-Off's", Icon: PhoneOff },
  { id: "vacation", label: "Vacation", Icon: Briefcase },
  { id: "trucks", label: "Search", Icon: Search },
  { id: "customers", label: "Customers", Icon: Building2 },
  { id: "analytics", label: "Analytics", Icon: PieChart },
  { id: "dispatch", label: "Dispatch", Icon: Radio },
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
        {TABS.map((item) => {
          const { Icon } = item;
          return (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "tab tab-active" : "tab"}
              onClick={() => onChange(item.id)}
            >
              {vertical ? (
                <Icon className="tab-icon" aria-hidden size={18} strokeWidth={2} />
              ) : null}
              <span className="tab-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
