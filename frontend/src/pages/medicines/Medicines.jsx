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
import {
  getMedicines,
  MEDICINE_CATEGORIES,
} from "../../services/medicine.service";
import { formatBatchDate } from "../../utils/batch";
import MedicineModal from "./MedicineModal";

const actionClass = `
  min-h-11 rounded-lg border border-border px-3 py-2
  text-xs font-semibold hover:bg-surface-hover
  focus-visible:outline-2 focus-visible:outline-primary
  disabled:cursor-not-allowed disabled:opacity-40
`;

const collator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

export default function Medicines() {
  const { user, authenticatedRequest } = useAuth();
  const isAdmin = user?.role === "Admin";

  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [manufacturerFilter, setManufacturerFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sort, setSort] = useState({ key: "name", direction: "asc" });

  const [selectedAction, setSelectedAction] = useState(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadMedicines() {
      setLoading(true);
      setError("");

      try {
        const result = await getMedicines(authenticatedRequest);
        if (!ignore) setMedicines(result);
      } catch (requestError) {
        if (!ignore) {
          setError(requestError.message || "Unable to load medicines.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadMedicines();

    return () => {
      ignore = true;
    };
  }, [authenticatedRequest, reloadKey]);

  function reloadMedicines() {
    setLoading(true);
    setReloadKey((previous) => previous + 1);
  }

  function clearFilters() {
    setSearch("");
    setCategoryFilter("All");
    setManufacturerFilter("All");
    setStatusFilter("All");
  }

  function handleSort(key) {
    setSort((previous) => ({
      key,
      direction:
        previous.key === key && previous.direction === "asc" ? "desc" : "asc",
    }));
  }

  function openAction(action, medicine = null) {
    if (!isAdmin) return;
    if (action === "edit" && !medicine?.medicine_is_active) return;

    setNotice("");
    setSelectedAction({ action, medicine });
  }

  function handleSuccess(message) {
    setSelectedAction(null);
    setNotice(message);
    reloadMedicines();
  }

  const manufacturerOptions = [
    ...new Map(
      medicines.map((item) => [
        String(item.manufacturer_id),
        { id: String(item.manufacturer_id), name: item.manufacturer },
      ])
    ).values(),
  ].sort((first, second) => collator.compare(first.name, second.name));

  const query = search.trim().toLowerCase();

  const filtered = medicines.filter((item) => {
    const matchesSearch =
      (item.name || "").toLowerCase().includes(query) ||
      (item.manufacturer || "").toLowerCase().includes(query);

    return (
      matchesSearch &&
      (categoryFilter === "All" || item.category === categoryFilter) &&
      (manufacturerFilter === "All" ||
        String(item.manufacturer_id) === manufacturerFilter) &&
      (statusFilter === "All" ||
        (statusFilter === "Active" && item.medicine_is_active) ||
        (statusFilter === "Inactive" && !item.medicine_is_active))
    );
  });

  const sorted = [...filtered].sort((first, second) => {
    let comparison;

    if (sort.key === "created_at") {
      comparison =
        (new Date(first.created_at).getTime() || 0) -
        (new Date(second.created_at).getTime() || 0);
    } else if (sort.key === "reorder_level") {
      comparison = Number(first.reorder_level) - Number(second.reorder_level);
    } else {
      comparison = collator.compare(
        String(first[sort.key] ?? ""),
        String(second[sort.key] ?? "")
      );
    }

    return comparison
      ? sort.direction === "asc" ? comparison : -comparison
      : Number(first.medicine_id) - Number(second.medicine_id);
  });

  const activeCount = medicines.filter((item) => item.medicine_is_active).length;
  const inactiveCount = medicines.length - activeCount;

  const hasFilters =
    search !== "" ||
    categoryFilter !== "All" ||
    manufacturerFilter !== "All" ||
    statusFilter !== "All";

  const columns = [
    { key: "name", label: "Medicine" },
    { key: "manufacturer", label: "Manufacturer" },
    { key: "category", label: "Category" },
    { key: "reorder_level", label: "Reorder level" },
    { key: "status", label: "Status", sortable: false },
    { key: "created_at", label: "Created" },
    ...(isAdmin
      ? [{ key: "actions", label: "Actions", sortable: false }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <CompactHeader
        title="Medicines"
        description="Manage medicine details, manufacturers, and reorder levels."
        summary={
          !loading && !error && (
            <>
              <SummaryBadge count={medicines.length}>total</SummaryBadge>
              <SummaryBadge count={activeCount} tone="success">active</SummaryBadge>
              {inactiveCount > 0 && (
                <SummaryBadge count={inactiveCount}>inactive</SummaryBadge>
              )}
            </>
          )
        }
      >
        {isAdmin && (
          <Button onClick={() => openAction("create")} className="gap-2">
            <span aria-hidden="true">+</span>
            Add Medicine
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
        aria-label="Filter medicines"
        className="rounded-xl border border-border bg-surface p-3 sm:p-4"
      >
        <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <FilterField
            id="medicine-search"
            label="Search"
            type="search"
            autoComplete="off"
            placeholder="Medicine or manufacturer"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <FilterField
            id="medicine-category"
            label="Category"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="All">All categories</option>
            {MEDICINE_CATEGORIES.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </FilterField>

          <FilterField
            id="medicine-manufacturer"
            label="Manufacturer"
            value={manufacturerFilter}
            onChange={(event) => setManufacturerFilter(event.target.value)}
          >
            <option value="All">All manufacturers</option>
            {manufacturerFilter !== "All" &&
              !manufacturerOptions.some(
                (item) => item.id === manufacturerFilter
              ) && (
                <option value={manufacturerFilter}>
                  Selected manufacturer (no medicines)
                </option>
              )}
            {manufacturerOptions.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </FilterField>

          <FilterField
            id="medicine-status"
            label="Medicine status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="All">All statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </FilterField>
        </div>
      </section>

      <CompactTable
        title="Medicines list"
        noun="medicines"
        columns={columns}
        sort={sort}
        onSort={handleSort}
        onReload={reloadMedicines}
        loading={loading}
        error={error}
        total={medicines.length}
        count={sorted.length}
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        emptyMessage="Medicines will appear here once added."
        minWidth={isAdmin ? "min-w-[1100px]" : "min-w-[900px]"}
      >
        {sorted.map((item) => (
          <tr key={item.medicine_id} className="hover:bg-background/40">
            <td className="max-w-56 break-words px-4 py-4 font-medium">
              {item.name}
            </td>
            <td className="max-w-56 break-words px-4 py-4">
              {item.manufacturer}
              {!item.manufacturer_is_active && (
                <p className="mt-1 text-xs text-warning">Inactive manufacturer</p>
              )}
            </td>
            <td className="px-4 py-4">{item.category}</td>
            <td className="px-4 py-4 tabular-nums">{item.reorder_level}</td>
            <td className="px-4 py-4">
              <StatusBadge active={item.medicine_is_active} />
            </td>
            <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
              {formatBatchDate(item.created_at)}
            </td>

            {isAdmin && (
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!item.medicine_is_active}
                    onClick={() => openAction("edit", item)}
                    aria-label={`Edit ${item.name}`}
                    title={
                      item.medicine_is_active
                        ? "Edit medicine"
                        : "Restore before editing"
                    }
                    className={actionClass}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      openAction(
                        item.medicine_is_active ? "deactivate" : "restore",
                        item
                      )
                    }
                    aria-label={`${item.medicine_is_active ? "Deactivate" : "Restore"} ${item.name}`}
                    className={`${actionClass} ${
                      item.medicine_is_active ? "text-danger" : "text-success"
                    }`}
                  >
                    {item.medicine_is_active ? "Deactivate" : "Restore"}
                  </button>
                </div>

                {!item.medicine_is_active && (
                  <p className="mt-1 text-xs text-text-secondary">
                    Restore before editing.
                  </p>
                )}
              </td>
            )}
          </tr>
        ))}
      </CompactTable>

      {selectedAction && isAdmin && (
        <MedicineModal
          key={`${selectedAction.action}-${selectedAction.medicine?.medicine_id || "new"}`}
          action={selectedAction.action}
          medicine={selectedAction.medicine}
          onClose={() => setSelectedAction(null)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}