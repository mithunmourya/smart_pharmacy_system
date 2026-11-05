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
import { getManufacturers } from "../../services/manufacturer.service";
import { formatBatchDate } from "../../utils/batch";
import ManufacturerModal from "./ManufacturerModal";

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

export default function Manufacturers() {
  const { user, authenticatedRequest } = useAuth();
  const isAdmin = user?.role === "Admin";

  const [manufacturers, setManufacturers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sort, setSort] = useState({ key: "name", direction: "asc" });

  const [selectedAction, setSelectedAction] = useState(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadManufacturers() {
      setLoading(true);
      setError("");

      try {
        const result = await getManufacturers(authenticatedRequest);
        if (!ignore) setManufacturers(result);
      } catch (requestError) {
        if (!ignore) {
          setError(requestError.message || "Unable to load manufacturers.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadManufacturers();

    return () => {
      ignore = true;
    };
  }, [authenticatedRequest, reloadKey]);

  function reloadManufacturers() {
    setLoading(true);
    setReloadKey((previous) => previous + 1);
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("All");
  }

  function handleSort(key) {
    setSort((previous) => ({
      key,
      direction:
        previous.key === key && previous.direction === "asc" ? "desc" : "asc",
    }));
  }

  function openAction(action, manufacturer = null) {
    if (!isAdmin) return;
    if (action === "edit" && !manufacturer?.is_active) return;

    setNotice("");
    setSelectedAction({ action, manufacturer });
  }

  function handleSuccess(message) {
    setSelectedAction(null);
    setNotice(message);
    reloadManufacturers();
  }

  const query = search.trim().toLowerCase();

  const filtered = manufacturers.filter(
    (item) =>
      (item.name || "").toLowerCase().includes(query) &&
      (statusFilter === "All" ||
        (statusFilter === "Active" && item.is_active) ||
        (statusFilter === "Inactive" && !item.is_active))
  );

  const sorted = [...filtered].sort((first, second) => {
    const comparison =
      sort.key === "created_at"
        ? (new Date(first.created_at).getTime() || 0) -
          (new Date(second.created_at).getTime() || 0)
        : collator.compare(first.name || "", second.name || "");

    return comparison
      ? sort.direction === "asc" ? comparison : -comparison
      : Number(first.manufacturer_id) - Number(second.manufacturer_id);
  });

  const activeCount = manufacturers.filter((item) => item.is_active).length;
  const inactiveCount = manufacturers.length - activeCount;
  const hasFilters = search !== "" || statusFilter !== "All";

  const columns = [
    { key: "name", label: "Manufacturer name" },
    { key: "status", label: "Status", sortable: false },
    { key: "created_at", label: "Created" },
    ...(isAdmin
      ? [{ key: "actions", label: "Actions", sortable: false }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <CompactHeader
        title="Manufacturers"
        description="Manage manufacturer names and status."
        summary={
          !loading && !error && (
            <>
              <SummaryBadge count={manufacturers.length}>total</SummaryBadge>
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
            Add Manufacturer
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
        aria-label="Filter manufacturers"
        className="rounded-xl border border-border bg-surface p-3 sm:p-4"
      >
        <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <FilterField
            id="manufacturer-search"
            label="Search manufacturers"
            type="search"
            autoComplete="off"
            placeholder="Search manufacturer name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <FilterField
            id="manufacturer-status"
            label="Status"
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
        title="Manufacturers list"
        noun="manufacturers"
        columns={columns}
        sort={sort}
        onSort={handleSort}
        onReload={reloadManufacturers}
        loading={loading}
        error={error}
        total={manufacturers.length}
        count={sorted.length}
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        emptyMessage="Manufacturers will appear here once added."
        minWidth={isAdmin ? "min-w-[720px]" : "min-w-[480px]"}
      >
        {sorted.map((item) => (
          <tr key={item.manufacturer_id} className="hover:bg-background/40">
            <td className="max-w-80 break-words px-4 py-4 font-medium">
              {item.name}
            </td>
            <td className="px-4 py-4">
              <StatusBadge active={item.is_active} />
            </td>
            <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
              {formatBatchDate(item.created_at)}
            </td>

            {isAdmin && (
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!item.is_active}
                    onClick={() => openAction("edit", item)}
                    aria-label={`Edit ${item.name}`}
                    title={
                      item.is_active
                        ? "Edit manufacturer"
                        : "Restore before editing"
                    }
                    className={actionClass}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      openAction(item.is_active ? "deactivate" : "restore", item)
                    }
                    aria-label={`${item.is_active ? "Deactivate" : "Restore"} ${item.name}`}
                    className={`${actionClass} ${
                      item.is_active ? "text-danger" : "text-success"
                    }`}
                  >
                    {item.is_active ? "Deactivate" : "Restore"}
                  </button>
                </div>

                {!item.is_active && (
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
        <ManufacturerModal
          key={`${selectedAction.action}-${selectedAction.manufacturer?.manufacturer_id || "new"}`}
          action={selectedAction.action}
          manufacturer={selectedAction.manufacturer}
          onClose={() => setSelectedAction(null)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}