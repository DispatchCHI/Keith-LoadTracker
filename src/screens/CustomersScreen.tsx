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
  lanesForCustomer,
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
  return n % 1 === 0 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`;
}

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
    return current.some((lane) => {
      if (lane.customer !== name) return false;
      if (filter === "Trash (MSW)") return /trash|msw/i.test(lane.commodity);
      if (filter === "Leachate (tanker)") return /leachate/i.test(lane.commodity);
      if (filter === "walking-floor") {
        return (
          !/trash|msw/i.test(lane.commodity) && !/leachate/i.test(lane.commodity)
        );
      }
      return true;
    });
  });

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

  return (
    <section className="screen customers-screen">
      <header className="screen-header">
        <p className="eyebrow">Lanes · 5-year contract book</p>
        <h1>Customers</h1>
        <p className="field-hint">
          Per-load pay by customer, destination, and driver tier.
        </p>
      </header>

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

      <div className="vac-add-actions">
        <button
          type="button"
          className="text-btn amber"
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
          <div className="vac-add-actions">
            <button type="submit" className="text-btn amber">
              Add
            </button>
            <button
              type="button"
              className="text-btn"
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

      <div className="cust-list">
        {visibleNames.map((name) => {
          const rows = lanesForCustomer(store, name);
          const live = current.filter((lane) => lane.customer === name && !isLaneStub(lane));
          const open = openCustomer === name;
          return (
            <article key={name} className="cust-card">
              <header className="cust-head">
                <button
                  type="button"
                  className="cust-toggle"
                  onClick={() => setOpenCustomer(open ? null : name)}
                >
                  <strong>{name}</strong>
                  <span className="field-hint">
                    {live.length
                      ? `${live.length} ${live.length === 1 ? "lane" : "lanes"}`
                      : "No dests yet"}
                  </span>
                </button>
                {(() => {
                  const brand = brandForCustomer(name);
                  return brand ? (
                    <img
                      className="cust-brand"
                      src={brand.src}
                      alt={brand.alt}
                      title={brand.alt}
                    />
                  ) : null;
                })()}
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => {
                    setOpenCustomer(name);
                    setLaneForm({
                      customer: name,
                      destination: "",
                      commodity: "Trash (MSW)",
                      effectiveDate: today,
                      t1: "",
                      t2: "",
                      t3: "",
                      t4: "",
                      t5: "",
                    });
                  }}
                >
                  + Lane
                </button>
              </header>
              {open ? (
                <div className="cust-body">
                  {editingCustomer === name ? (
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
                      <div className="vac-add-actions">
                        <button type="submit" className="text-btn amber">
                          Save
                        </button>
                        <button type="button" className="text-btn" onClick={cancelEditCustomer}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {editingCustomer === name ? null : (
                    <div className="vac-add-actions">
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() => startEditCustomer(name)}
                      >
                        Edit customer
                      </button>
                      <button
                        type="button"
                        className="text-btn danger"
                        onClick={() => setConfirmDeleteCustomer(name)}
                      >
                        Delete customer
                      </button>
                    </div>
                  )}
                  {laneForm && laneForm.customer === name ? (
                    <LaneForm laneForm={laneForm} setLaneForm={setLaneForm} onSave={saveForm} />
                  ) : null}
                  {live.length === 0 ? (
                    <p className="field-hint">Add a destination and the five tier rates.</p>
                  ) : (
                    live.map((lane) => (
                      <LaneRow
                        key={lane.id}
                        lane={lane}
                        history={rows.filter(
                          (row) =>
                            row.destination === lane.destination &&
                            row.commodity === lane.commodity,
                        )}
                        onEdit={() =>
                          setLaneForm({
                            customer: name,
                            id: lane.id,
                            destination: lane.destination,
                            commodity: lane.commodity,
                            effectiveDate: lane.effectiveDate,
                            t1: lane.tier1 != null ? String(lane.tier1) : "",
                            t2: lane.tier2 != null ? String(lane.tier2) : "",
                            t3: lane.tier3 != null ? String(lane.tier3) : "",
                            t4: lane.tier4 != null ? String(lane.tier4) : "",
                            t5: lane.tier5 != null ? String(lane.tier5) : "",
                          })
                        }
                        onRenew={() =>
                          setLaneForm({
                            customer: name,
                            destination: lane.destination,
                            commodity: lane.commodity,
                            effectiveDate: today,
                            t1: lane.tier1 != null ? String(lane.tier1) : "",
                            t2: lane.tier2 != null ? String(lane.tier2) : "",
                            t3: lane.tier3 != null ? String(lane.tier3) : "",
                            t4: lane.tier4 != null ? String(lane.tier4) : "",
                            t5: lane.tier5 != null ? String(lane.tier5) : "",
                          })
                        }
                        onDelete={() => void deleteLane(lane.id)}
                      />
                    ))
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {confirmDeleteCustomer ? (
        <ConfirmOverlay onDismiss={() => setConfirmDeleteCustomer(null)}>
          <p>
            Delete <strong>{confirmDeleteCustomer}</strong> from the book? This removes
            all lanes for that customer. Old loads will no longer look up rates from this
            book.
          </p>
          <div className="overlay-footer tight">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setConfirmDeleteCustomer(null)}
            >
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
                  <span className="cust-logo-none" aria-hidden="true">
                    —
                  </span>
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
  return (
    <form
      className="cust-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <h2>{laneForm.id ? "Edit lane" : "Add lane"}</h2>
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
            <option key={item} value={item}>
              {item}
            </option>
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
      <div className="cust-tiers">
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
      </div>
      <div className="vac-add-actions">
        <button type="submit" className="text-btn amber">
          Save lane
        </button>
        <button type="button" className="text-btn" onClick={() => setLaneForm(null)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function LaneRow({
  lane,
  history,
  onEdit,
  onRenew,
  onDelete,
}: {
  lane: CustomerLane;
  history: CustomerLane[];
  onEdit: () => void;
  onRenew: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="cust-lane">
      <div className="cust-lane-top">
        <strong>{lane.destination}</strong>
        <span className="field-hint">{lane.commodity}</span>
      </div>
      <div className="cust-rate-row" aria-label="Tier rates">
        {[lane.tier1, lane.tier2, lane.tier3, lane.tier4, lane.tier5].map((n, i) => (
          <span key={i} className="cust-rate">
            T{i + 1} {formatTier(n)}
          </span>
        ))}
      </div>
      <p className="field-hint">
        In force {lane.effectiveDate}
        {history.length > 1 ? ` · ${history.length} contract books` : null}
      </p>
      <div className="vac-add-actions">
        <button type="button" className="text-btn" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="text-btn" onClick={onRenew}>
          New contract
        </button>
        <button type="button" className="text-btn" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
