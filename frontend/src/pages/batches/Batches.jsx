import { useEffect, useState } from "react";
import Button from "../../components/Button";
import {
  CompactHeader,
  CompactTable,
  FilterField,
  StatusBadge,
  SummaryBadge,
} from "../../components/CompactInventoryUI";
import useAuth from "../../hooks/useAuth";
import { getMedicines } from "../../services/medicine.service";
import { getBatchesByMedicine } from "../../services/batch.service";
import {
  toDateInput,
  formatBatchDate,
  daysToExpiry,
  expiryLabel,
  formatPrice,
} from "../../utils/batch";
import BatchModal from "./BatchModal";

const actionClass = `
  min-h-11 whitespace-nowrap rounded-lg border border-border
  px-3 py-2 text-xs font-semibold hover:bg-surface-hover
  focus-visible:outline-2 focus-visible:outline-primary
  disabled:cursor-not-allowed disabled:opacity-40
`;

const collator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

export default function Batches() {
  const { user, authenticatedRequest } = useAuth();
  const isAdmin = user?.role === "Admin";

  const [medicines, setMedicines] = useState([]);
  const [medicinesLoading, setMedicinesLoading] = useState(true);
  const [medicineError, setMedicineError] = useState("");
  const [medicineReloadKey, setMedicineReloadKey] = useState(0);
  const [medicineId, setMedicineId] = useState("");

  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [expiryFilter, setExpiryFilter] = useState("All");
  const [sort, setSort] = useState({
    key: "expiry_date",
    direction: "asc",
  });

  const [selectedAction, setSelectedAction] = useState(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadMedicines() {
      setMedicinesLoading(true);
      setMedicineError("");

      try {
        const result = await getMedicines(authenticatedRequest);
        if (!ignore) setMedicines(result);
      } catch (requestError) {
        if (!ignore) {
          setMedicineError(requestError.message || "Unable to load medicines.");
        }
      } finally {
        if (!ignore) setMedicinesLoading(false);
      }
    }

    loadMedicines();

    return () => {
      ignore = true;
    };
  }, [authenticatedRequest, medicineReloadKey]);

  useEffect(() => {
    if (!medicineId) return;

    let ignore = false;

    async function loadBatches() {
      setLoading(true);
      setError("");

      try {
        const result = await getBatchesByMedicine(
          authenticatedRequest,
          medicineId
        );
        if (!ignore) setBatches(result);
      } catch (requestError) {
        if (!ignore) {
          setError(requestError.message || "Unable to load batches.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadBatches();

    return () => {
      ignore = true;
    };
  }, [authenticatedRequest, medicineId, reloadKey]);

  const selectedMedicine = medicines.find(
    (item) => String(item.medicine_id) === medicineId
  );

  function clearFilters() {
    setSearch("");
    setStatusFilter("All");
    setExpiryFilter("All");
  }

  function changeMedicine(event) {
    const nextId = event.target.value;

    setMedicineId(nextId);
    setBatches([]);
    setLoading(Boolean(nextId));
    setError("");
    setNotice("");
    clearFilters();
  }

  function reloadBatches() {
    if (!medicineId) return;

    setLoading(true);
    setReloadKey((previous) => previous + 1);
    setMedicineReloadKey((previous) => previous + 1);
  }

  function handleSort(key) {
    setSort((previous) => ({
      key,
      direction:
        previous.key === key && previous.direction === "asc" ? "desc" : "asc",
    }));
  }

  function openAction(action, batch = null) {
    if (!isAdmin || !selectedMedicine) return;
    if (action === "create" && !selectedMedicine.medicine_is_active) return;
    if ((action === "edit" || action === "stock") && !batch?.is_active) {
      return;
    }

    setNotice("");
    setSelectedAction({ action, batch, medicine: selectedMedicine });
  }

  function handleSuccess(message) {
    setSelectedAction(null);
    setNotice(message);
    reloadBatches();
  }

  const query = search.trim().toLowerCase();

  const filtered = batches.filter((batch) => {
    const days = daysToExpiry(batch.expiry_date);

    const matchesExpiry =
      expiryFilter === "All" ||
      (expiryFilter === "Expired" && days !== null && days < 0) ||
      (expiryFilter === "Soon" &&
        days !== null && days >= 0 && days <= 10) ||
      (expiryFilter === "Later" && days !== null && days > 10);

    return (
      (batch.batch_number || "").toLowerCase().includes(query) &&
      matchesExpiry &&
      (statusFilter === "All" ||
        (statusFilter === "Active" && batch.is_active) ||
        (statusFilter === "Inactive" && !batch.is_active))
    );
  });

  const sorted = [...filtered].sort((first, second) => {
    let comparison;

    if (sort.key === "expiry_date") {
      comparison = toDateInput(first.expiry_date).localeCompare(
        toDateInput(second.expiry_date)
      );
    } else if (sort.key === "created_at") {
      comparison =
        (new Date(first.created_at).getTime() || 0) -
        (new Date(second.created_at).getTime() || 0);
    } else if (
      ["purchase_price", "selling_price", "stock_quantity"].includes(sort.key)
    ) {
      comparison = Number(first[sort.key]) - Number(second[sort.key]);
    } else {
      comparison = collator.compare(
        String(first[sort.key] ?? ""),
        String(second[sort.key] ?? "")
      );
    }

    return comparison
      ? sort.direction === "asc" ? comparison : -comparison
      : Number(first.batch_id) - Number(second.batch_id);
  });

  const expiringCount = batches.filter((batch) => {
    const days = daysToExpiry(batch.expiry_date);
    return days !== null && days >= 0 && days <= 10;
  }).length;

  const expiredCount = batches.filter((batch) => {
    const days = daysToExpiry(batch.expiry_date);
    return days !== null && days < 0;
  }).length;

  const hasFilters =
    search !== "" || statusFilter !== "All" || expiryFilter !== "All";

  const canAdd =
    isAdmin &&
    !!selectedMedicine?.medicine_is_active &&
    !medicinesLoading &&
    !medicineError;

  const columns = [
    { key: "batch_number", label: "Batch number" },
    { key: "purchase_price", label: "Purchase price" },
    { key: "selling_price", label: "Selling price" },
    { key: "stock_quantity", label: "Stock" },
    { key: "expiry_date", label: "Expiry" },
    { key: "created_at", label: "Created" },
    { key: "status", label: "Status", sortable: false },
    ...(isAdmin
      ? [{ key: "actions", label: "Actions", sortable: false }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <CompactHeader
        title="Batches"
        description="Select a medicine to manage its batches, prices, and stock."
        summary={
          medicineId && !loading && !error && (
            <>
              <SummaryBadge count={batches.length}>batches</SummaryBadge>
              {expiringCount > 0 && (
                <SummaryBadge count={expiringCount} tone="warning">
                  expire within 10 days
                </SummaryBadge>
              )}
              {expiredCount > 0 && (
                <SummaryBadge count={expiredCount} tone="danger">
                  expired
                </SummaryBadge>
              )}
            </>
          )
        }
      >
        {isAdmin && (
          <Button
            disabled={!canAdd}
            onClick={() => openAction("create")}
            className="gap-2"
          >
            <span aria-hidden="true">+</span>
            Add Batch
          </Button>
        )}
      </CompactHeader>

      {notice && (
        <div
          role="status"
          className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm"
        >
          {notice}
        </div>
      )}

      <section
        aria-label="Select medicine and filter batches"
        className="rounded-xl border border-border bg-surface p-3 sm:p-4"
      >
        <FilterField
          id="batch-medicine"
          label="Medicine"
          value={medicineId}
          onChange={changeMedicine}
          disabled={medicinesLoading || !!medicineError}
        >
          <option value="">
            {medicinesLoading ? "Loading medicines..." : "Select a medicine"}
          </option>
          {medicineId &&
            !medicines.some(
              (item) => String(item.medicine_id) === medicineId
            ) && (
              <option value={medicineId}>
                Selected medicine (unavailable)
              </option>
            )}
          {medicines.map((item) => (
            <option key={item.medicine_id} value={String(item.medicine_id)}>
              {item.name} — {item.manufacturer}
              {!item.medicine_is_active ? " (inactive medicine)" : ""}
            </option>
          ))}
        </FilterField>

        {medicineError && (
          <div className="mt-2">
            <p role="alert" className="text-sm text-danger">{medicineError}</p>
            <button
              type="button"
              onClick={() => setMedicineReloadKey((previous) => previous + 1)}
              className="min-h-11 rounded-lg px-2 text-sm underline
                         focus-visible:outline-2 focus-visible:outline-primary"
            >
              Retry loading medicines
            </button>
          </div>
        )}

        {!medicinesLoading && !medicineError && medicines.length === 0 && (
          <p className="mt-2 text-sm text-text-secondary">
            Add a medicine before creating batches.
          </p>
        )}

        {selectedMedicine && (
          <div className="mt-2 space-y-1 text-xs leading-5">
            {!selectedMedicine.medicine_is_active && (
              <p className="text-warning">
                Inactive medicine: existing batches remain visible, but new
                batches cannot be added.
              </p>
            )}
            {!selectedMedicine.manufacturer_is_active && (
              <p className="text-warning">
                Inactive manufacturer: these batches are excluded from
                available inventory.
              </p>
            )}
          </div>
        )}

        {medicineId && (
          <div className="mt-3 grid items-end gap-3 sm:grid-cols-3">
            <FilterField
              id="batch-search"
              label="Search batches"
              type="search"
              autoComplete="off"
              placeholder="Batch number"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <FilterField
              id="batch-status"
              label="Batch status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="All">All statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </FilterField>

            <FilterField
              id="batch-expiry"
              label="Expiry"
              value={expiryFilter}
              onChange={(event) => setExpiryFilter(event.target.value)}
            >
              <option value="All">All expiry dates</option>
              <option value="Expired">Expired</option>
              <option value="Soon">Within 10 days</option>
              <option value="Later">More than 10 days remaining</option>
            </FilterField>
          </div>
        )}
      </section>

      <CompactTable
        title="Batches list"
        noun="batches"
        columns={columns}
        sort={sort}
        onSort={handleSort}
        onReload={reloadBatches}
        loading={loading}
        error={error}
        ready={Boolean(medicineId)}
        reloadDisabled={medicinesLoading}
        total={batches.length}
        count={sorted.length}
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        emptyMessage={
          canAdd
            ? "Use Add Batch to create the first batch for this medicine."
            : "Batches will appear here once added."
        }
        minWidth={isAdmin ? "min-w-[1250px]" : "min-w-[950px]"}
      >
        {sorted.map((batch) => {
          const days = daysToExpiry(batch.expiry_date);

          return (
            <tr key={batch.batch_id} className="hover:bg-background/40">
              <td className="max-w-48 break-words px-4 py-4 font-medium">
                {batch.batch_number}
              </td>
              <td className="px-4 py-4 tabular-nums">
                {formatPrice(batch.purchase_price)}
              </td>
              <td className="px-4 py-4 tabular-nums">
                {formatPrice(batch.selling_price)}
              </td>
              <td className="px-4 py-4 tabular-nums">
                {batch.stock_quantity}
                {batch.stock_quantity === 0 && (
                  <p className="mt-1 text-xs text-warning">Out of stock</p>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-4">
                {formatBatchDate(batch.expiry_date)}
                <p className={`mt-1 text-xs ${
                  days !== null && days < 0
                    ? "text-danger"
                    : days !== null && days <= 10
                      ? "text-warning"
                      : "text-text-secondary"
                }`}>
                  {expiryLabel(batch.expiry_date)}
                </p>
              </td>
              <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                {formatBatchDate(batch.created_at)}
              </td>
              <td className="px-4 py-4">
                <StatusBadge active={batch.is_active} />
              </td>

              {isAdmin && (
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!batch.is_active || !selectedMedicine}
                      onClick={() => openAction("edit", batch)}
                      aria-label={`Edit batch ${batch.batch_number}`}
                      className={actionClass}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={!batch.is_active || !selectedMedicine}
                      onClick={() => openAction("stock", batch)}
                      aria-label={`Adjust stock for batch ${batch.batch_number}`}
                      className={actionClass}
                    >
                      Adjust Stock
                    </button>
                    <button
                      type="button"
                      disabled={!selectedMedicine}
                      onClick={() =>
                        openAction(batch.is_active ? "deactivate" : "restore", batch)
                      }
                      aria-label={`${batch.is_active ? "Deactivate" : "Restore"} batch ${batch.batch_number}`}
                      className={`${actionClass} ${
                        batch.is_active ? "text-danger" : "text-success"
                      }`}
                    >
                      {batch.is_active ? "Deactivate" : "Restore"}
                    </button>
                  </div>

                  {!batch.is_active && (
                    <p className="mt-1 text-xs text-text-secondary">
                      Restore before editing or adjusting stock.
                    </p>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </CompactTable>

      {selectedAction && isAdmin && (
        <BatchModal
          key={`${selectedAction.action}-${selectedAction.batch?.batch_id || "new"}`}
          action={selectedAction.action}
          medicine={selectedAction.medicine}
          batch={selectedAction.batch}
          onClose={() => setSelectedAction(null)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}