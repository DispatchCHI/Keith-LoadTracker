import { useMemo, useState } from "react";
import { ConfirmOverlay } from "../components/ConfirmOverlay";
import { chicagoToday } from "../lib/chicagoDate";
import {
  CURRENT_CONTRACT_START,
} from "../data/customerLaneSeed";
import {
  LANE_COMMODITIES,
  cleanPlaceName,
  customerNames,
  currentLanesByCustomer,
  isLaneStub,
  placesMatch,
  type CustomerLane,
} from "../lib/customerLanes";
import { useCustomerLanes } from "../store/CustomerLanesContext";
import {
  BRAND_COMPANY_OPTIONS,
  assignCustomerBrand,
  brandCompanyIdForCustomer,
  brandForCompanyId,
  brandForCustomer,
  setCustomerBrandOverride,
  type BrandCompanyId,
} from "../lib/customerBrands";

function moneyField(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/[$,]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function formatTier(n: number | null): string {
  if (n === null) return "—";
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
}

function laneMatchesFilter(lane: CustomerLane, filter: string): boolean {
  if (isLaneStub(lane)) return false;
  if (filter === "all") return true;
  if (filter === "Trash (MSW)") return /trash|msw/i.test(lane.commodity);
  if (filter === "Leachate (tanker)") return /leachate/i.test(lane.commodity);
  if (filter === "walking-floor") {
    return !/trash|msw/i.test(lane.commodity) && !/leachate/i.test(lane.commodity);
  }
  return true;
}

function commodityClass(commodity: string): string {
  if (/trash|msw/i.test(commodity)) return "cust-pill msw";
  if (/leachate/i.test(commodity)) return "cust-pill leach";
  if (/yard/i.test(commodity)) return "cust-pill yw";
  if (/recycle/i.test(commodity)) return "cust-pill rc";
  return "cust-pill other";
}

const COMPANY_GROUPS: { id: BrandCompanyId; label: string; tone: string }[] = [
  { id: "waste-management", label: "Waste Management", tone: "wm" },
  { id: "republic", label: "Republic Services", tone: "rs" },
  { id: "lrs", label: "LRS Services", tone: "lrs" },
  { id: "tri-state", label: "Tri-State", tone: "ts" },
  { id: "none", label: "No logo", tone: "none" },
];

type LaneFormState = {
  customer: string;
  id?: string;
  destination: string;
  commodity: string;
  effectiveDate: string;
  t1: string;
  t2: string;
  t3: string;
  t4: string;
  t5: string;
};

export function CustomersScreen() {
  const { store, saveLane, deleteLane, deleteCustomer, renameCustomer } = useCustomerLanes();
  const today = chicagoToday();
  const [filter, setFilter] = useState<string>("all");
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState("");
  const [newCustomerBrand, setNewCustomerBrand] = useState<BrandCompanyId>("none");
  const [openCustomer, setOpenCustomer] = useState<string | null>(null);
  const [laneForm, setLaneForm] = useState<LaneFormState | null>(null);
  const [confirmDeleteCustomer, setConfirmDeleteCustomer] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBrand, setEditBrand] = useState<BrandCompanyId>("none");
  const [editError, setEditError] = useState("");

  const names = useMemo(() => customerNames(store), [store]);
  const current = useMemo(() => currentLanesByCustomer(store, today), [store, today]);

  const visibleNames = names.filter((name) => {
    if (filter === "all") return true;
    return current.some((lane) => lane.customer === name && laneMatchesFilter(lane, filter));
  });

  const groups = COMPANY_GROUPS.flatMap((group) => {
    const rows = visibleNames
      .filter((name) => brandCompanyIdForCustomer(name) === group.id)
      .slice()
      .sort((a, b) => a.localeCompare(b, "en"));
    return rows.length ? [{ ...group, rows }] : [];
  });

  const selected = openCustomer && visibleNames.includes(openCustomer) ? openCustomer : null;
  const selectedLanes = selected
    ? current
        .filter((lane) => lane.customer === selected && laneMatchesFilter(lane, filter))
        .slice()
        .sort((a, b) => {
          const dest = a.destination.localeCompare(b.destination, "en");
          if (dest) return dest;
          return a.commodity.localeCompare(b.commodity, "en");
        })
    : [];

  const saveForm = async () => {
    if (!laneForm) return;
    const dest = laneForm.destination.trim();
    if (!dest) return;
    const saved = await saveLane({
      id: laneForm.id,
      customer: laneForm.customer,
      destination: dest,
      commodity: laneForm.commodity,
      effectiveDate: laneForm.effectiveDate,
      tier1: moneyField(laneForm.t1),
      tier2: moneyField(laneForm.t2),
      tier3: moneyField(laneForm.t3),
      tier4: moneyField(laneForm.t4),
      tier5: moneyField(laneForm.t5),
    });
    if (saved) setLaneForm(null);
  };

  const startEditCustomer = (name: string) => {
    setOpenCustomer(name);
    setEditingCustomer(name);
    setEditName(name);
    setEditBrand(brandCompanyIdForCustomer(name));
    setEditError("");
  };

  const cancelEditCustomer = () => {
    setEditingCustomer(null);
    setEditName("");
    setEditBrand("none");
    setEditError("");
  };

  const selectCustomer = (name: string) => {
    setOpenCustomer(name);
    setLaneForm((form) => (form && placesMatch(form.customer, name) ? form : null));
    if (editingCustomer && !placesMatch(editingCustomer, name)) cancelEditCustomer();
  };

  const startLane = (name: string, lane?: CustomerLane, renew = false) => {
    setOpenCustomer(name);
    setLaneForm({
      customer: name,
      id: renew ? undefined : lane?.id,
      destination: lane?.destination ?? "",
      commodity: lane?.commodity ?? "Trash (MSW)",
      effectiveDate: renew ? today : (lane?.effectiveDate ?? today),
      t1: lane?.tier1 != null ? String(lane.tier1) : "",
      t2: lane?.tier2 != null ? String(lane.tier2) : "",
      t3: lane?.tier3 != null ? String(lane.tier3) : "",
      t4: lane?.tier4 != null ? String(lane.tier4) : "",
      t5: lane?.tier5 != null ? String(lane.tier5) : "",
    });
  };

  const saveCustomerEdit = () => {
    if (!editingCustomer) return;
    const nextName = cleanPlaceName(editName);
    if (!nextName) {
      setEditError("Enter a customer name.");
      return;
    }
    const status = renameCustomer(editingCustomer, nextName);
    if (status === "collision") {
      setEditError("A customer with that name is already on the board.");
      return;
    }
    if (status === "missing") {
      cancelEditCustomer();
      setOpenCustomer((open) => (open === editingCustomer ? null : open));
      return;
    }
    if (status === "empty") {
      setEditError("Enter a customer name.");
      return;
    }
    assignCustomerBrand(editingCustomer, nextName, editBrand);
    setOpenCustomer(nextName);
    setLaneForm((form) =>
      form && placesMatch(form.customer, editingCustomer) ? { ...form, customer: nextName } : form,
    );
    cancelEditCustomer();
  };

  function laneCount(name: string): number {
    return current.filter((lane) => lane.customer === name && laneMatchesFilter(lane, filter)).length;
  }

  return (
    <section className="screen customers-screen">
      <header className="page-header">
        <div>
          <p className="eyebrow">Lanes · 5-year contract book</p>
          <h1 className="page-title">Customers</h1>
        </div>
        <p className="field-hint tight">
          Per-load pay by customer, destination, and driver tier.
        </p>
      </header>

      <div className="cust-toolbar">
        <div className="vac-year-row" role="tablist" aria-label="Commodity">
          {[
            { id: "all", label: "All" },
            { id: "Trash (MSW)", label: "Trash / MSW" },
            { id: "walking-floor", label: "Walking-floor" },
            { id: "Leachate (tanker)", label: "Leachate" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={filter === item.id ? "day-chip day-chip-active" : "day-chip"}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="cust-save"
          onClick={() => {
            setNewCustomer("");
            setNewCustomerBrand("none");
            setAddingCustomer(true);
          }}
        >
          + Add customer
        </button>
      </div>

      {addingCustomer ? (
        <form
          className="cust-form"
          onSubmit={(event) => {
            event.preventDefault();
            const name = cleanPlaceName(newCustomer);
            if (!name) return;
            setCustomerBrandOverride(name, newCustomerBrand);
            void saveLane({
              customer: name,
              destination: "",
              commodity: "Trash (MSW)",
              effectiveDate: CURRENT_CONTRACT_START,
            });
            setNewCustomer("");
            setNewCustomerBrand("none");
            setAddingCustomer(false);
            setOpenCustomer(name);
          }}
        >
          <h2>Add customer</h2>
          <CustomerIdentityFields
            name={newCustomer}
            onName={setNewCustomer}
            brand={newCustomerBrand}
            onBrand={setNewCustomerBrand}
          />
          <div className="cust-form-actions">
            <button type="submit" className="cust-save">Add</button>
            <button
              type="button"
              className="cust-link"
              onClick={() => {
                setAddingCustomer(false);
                setNewCustomer("");
                setNewCustomerBrand("none");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="cust-split">
        <aside className="cust-board" aria-label="Customers">
          {groups.map((group) => (
            <section key={group.id} className="cust-group">
              <div className={`cust-group-label ${group.tone}`}>
                <span>{group.label}</span>
                <span>{group.rows.length}</span>
              </div>
              {group.rows.map((name) => {
                const count = laneCount(name);
                return (
                  <button
                    key={name}
                    type="button"
                    className={selected === name ? "cust-row on" : "cust-row"}
                    onClick={() => selectCustomer(name)}
                  >
                    <CustomerLogo name={name} />
                    <span className="cust-row-name">{name}</span>
                    <span className="cust-row-meta">{count || "none"}</span>
                  </button>
                );
              })}
            </section>
          ))}
          {!groups.length ? <p className="cust-hint">No customers for this filter.</p> : null}
        </aside>

        <section className="cust-detail" aria-label="Customer lanes">
          {selected ? (
            <>
              <div className="cust-detail-head">
                <h2>
                  <CustomerLogo name={selected} large />
                  {selected}
                </h2>
                {editingCustomer === selected ? null : (
                  <div className="cust-detail-actions">
                    <button type="button" className="cust-link" onClick={() => startEditCustomer(selected)}>
                      Edit customer
                    </button>
                    <button type="button" className="cust-link danger" onClick={() => setConfirmDeleteCustomer(selected)}>
                      Delete customer
                    </button>
                    <button type="button" className="cust-link" onClick={() => startLane(selected)}>
                      + Lane
                    </button>
                  </div>
                )}
              </div>

              {editingCustomer === selected ? (
                <form
                  className="cust-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveCustomerEdit();
                  }}
                >
                  <h2>Edit customer</h2>
                  <CustomerIdentityFields
                    name={editName}
                    onName={(value) => {
                      setEditName(value);
                      if (editError) setEditError("");
                    }}
                    brand={editBrand}
                    onBrand={setEditBrand}
                    autoFocus
                  />
                  {editError ? <p className="drv-add-error">{editError}</p> : null}
                  <div className="cust-form-actions">
                    <button type="submit" className="cust-save">Save</button>
                    <button type="button" className="cust-link" onClick={cancelEditCustomer}>Cancel</button>
                  </div>
                </form>
              ) : null}

              {selectedLanes.length ? (
                <div className="cust-table-wrap">
                  <table className="cust-table">
                    <thead>
                      <tr>
                        <th>Destination</th>
                        <th>Commodity</th>
                        <th className="num">T1</th>
                        <th className="num">T2</th>
                        <th className="num">T3</th>
                        <th className="num">T4</th>
                        <th className="num">T5</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {selectedLanes.map((lane) => (
                        <tr key={lane.id}>
                          <td>{lane.destination}</td>
                          <td><span className={commodityClass(lane.commodity)}>{lane.commodity}</span></td>
                          {[lane.tier1, lane.tier2, lane.tier3, lane.tier4, lane.tier5].map((n, i) => (
                            <td key={i} className="num">{formatTier(n)}</td>
                          ))}
                          <td className="cust-actions">
                            <button type="button" className="cust-link" onClick={() => startLane(selected, lane)}>Edit</button>
                            <button type="button" className="cust-link" onClick={() => startLane(selected, lane, true)}>
                              New contract
                            </button>
                            <button type="button" className="cust-link danger" onClick={() => void deleteLane(lane.id)}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="cust-hint">Add a destination and the five tier rates.</p>
              )}

              {laneForm && placesMatch(laneForm.customer, selected) ? (
                <LaneForm
                  laneForm={{ ...laneForm, id: laneForm.id }}
                  setLaneForm={setLaneForm}
                  onSave={saveForm}
                />
              ) : null}
            </>
          ) : (
            <p className="cust-hint">Pick a customer to see lanes.</p>
          )}
        </section>
      </div>

      {confirmDeleteCustomer ? (
        <ConfirmOverlay onDismiss={() => setConfirmDeleteCustomer(null)}>
          <p>
            Delete <strong>{confirmDeleteCustomer}</strong> from the book? This removes
            all lanes for that customer. Old loads will no longer look up rates from this
            book.
          </p>
          <div className="overlay-footer tight">
            <button type="button" className="btn-ghost" onClick={() => setConfirmDeleteCustomer(null)}>
              Keep
            </button>
            <button
              type="button"
              className="btn-danger grow"
              onClick={() => {
                const name = confirmDeleteCustomer;
                setConfirmDeleteCustomer(null);
                void (async () => {
                  await deleteCustomer(name);
                  setOpenCustomer((open) => (open === name ? null : open));
                  setLaneForm((form) => (form?.customer === name ? null : form));
                  if (editingCustomer === name) cancelEditCustomer();
                })();
              }}
            >
              Delete customer
            </button>
          </div>
        </ConfirmOverlay>
      ) : null}
    </section>
  );
}

function CustomerLogo({ name, large = false }: { name: string; large?: boolean }) {
  const brand = brandForCustomer(name);
  if (!brand) {
    return <span className={large ? "cust-logo-slot lg" : "cust-logo-slot"} aria-hidden="true" />;
  }
  return (
    <img
      className={large ? "cust-brand lg" : "cust-brand"}
      src={brand.src}
      alt={large ? brand.alt : ""}
      title={brand.alt}
    />
  );
}

function CustomerIdentityFields({
  name,
  onName,
  brand,
  onBrand,
  autoFocus = false,
}: {
  name: string;
  onName: (value: string) => void;
  brand: BrandCompanyId;
  onBrand: (value: BrandCompanyId) => void;
  autoFocus?: boolean;
}) {
  return (
    <>
      <label className="drv-pay-field">
        <span>Customer name</span>
        <input
          className="text-input"
          value={name}
          onChange={(event) => onName(event.target.value)}
          placeholder="Customer name"
          autoComplete="off"
          autoFocus={autoFocus}
        />
      </label>
      <div className="drv-pay-field">
        <span>Company logo</span>
        <div className="vac-year-row cust-logo-row" role="radiogroup" aria-label="Company logo">
          {BRAND_COMPANY_OPTIONS.map((opt) => {
            const mark = brandForCompanyId(opt.id);
            const active = brand === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={active ? "day-chip day-chip-active" : "day-chip"}
                onClick={() => onBrand(opt.id)}
              >
                {mark ? (
                  <img className="cust-logo-mark" src={mark.src} alt="" />
                ) : (
                  <span className="cust-logo-none" aria-hidden="true">—</span>
                )}
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function LaneForm({
  laneForm,
  setLaneForm,
  onSave,
}: {
  laneForm: LaneFormState;
  setLaneForm: (next: LaneFormState | null) => void;
  onSave: () => void;
}) {
  const renewing = !laneForm.id && laneForm.destination.trim().length > 0;
  return (
    <form
      className="cust-form cust-lane-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <p className="cust-form-title">{laneForm.id ? "Edit lane" : renewing ? "New contract" : "Add lane"}</p>
      <label className="drv-pay-field">
        <span>Destination</span>
        <input
          className="text-input"
          value={laneForm.destination}
          onChange={(event) => setLaneForm({ ...laneForm, destination: event.target.value })}
          placeholder="DeKalb"
          autoComplete="off"
        />
      </label>
      <label className="drv-pay-field">
        <span>Commodity</span>
        <select
          className="text-input"
          value={laneForm.commodity}
          onChange={(event) => setLaneForm({ ...laneForm, commodity: event.target.value })}
        >
          {LANE_COMMODITIES.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </label>
      <label className="drv-pay-field">
        <span>Contract start</span>
        <input
          className="text-input"
          type="date"
          value={laneForm.effectiveDate}
          onChange={(event) => setLaneForm({ ...laneForm, effectiveDate: event.target.value })}
        />
      </label>
      {(["t1", "t2", "t3", "t4", "t5"] as const).map((key, i) => (
        <label key={key} className="drv-pay-field">
          <span>Tier {i + 1}</span>
          <input
            className="text-input"
            inputMode="decimal"
            value={laneForm[key]}
            onChange={(event) => setLaneForm({ ...laneForm, [key]: event.target.value })}
            placeholder="0.00"
          />
        </label>
      ))}
      <div className="cust-form-actions">
        <button type="submit" className="cust-save">Save lane</button>
        <button type="button" className="cust-link" onClick={() => setLaneForm(null)}>Cancel</button>
      </div>
    </form>
  );
}
