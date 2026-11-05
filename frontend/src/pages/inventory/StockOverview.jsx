import { useEffect, useState } from "react";
import Modal from "../../components/Modal";
import useAuth from "../../hooks/useAuth";
import {
  getAvailableInventory,
  getLowStock,
} from "../../services/inventory.service";
import { formatBatchDate, formatPrice } from "../../utils/batch";

const controlClass = `
  min-h-11 w-full min-w-0 rounded-lg border border-border
  bg-background px-3 py-2.5 text-sm text-text-primary
  focus-visible:outline-2 focus-visible:outline-primary
`;

const labelClass = "mb-1.5 block text-xs font-medium text-text-secondary";

const collator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

const commonColumns = [
  { key: "medicine_name", label: "Medicine" },
  { key: "manufacturer_name", label: "Manufacturer" },
  { key: "category", label: "Category" },
  { key: "available_stock", label: "Available stock", numeric: true },
];

function expiryText(days) {
  if (days === null || !Number.isFinite(days)) return "Unknown expiry";
  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  if (days <= 10) return `Expires in ${days} days`;
  return `${days} days remaining`;
}

function SortableHeader({ column, sort, onSort }) {
  const active = sort.key === column.key;
  const nextAscending = !active || sort.direction === "desc";

  const description = column.date
    ? nextAscending
      ? "earliest to latest"
      : "latest to earliest"
    : column.numeric
      ? nextAscending
        ? "lowest to highest"
        : "highest to lowest"
      : nextAscending
        ? "A to Z"
        : "Z to A";

  return (
    <th
      scope="col"
      aria-sort={
        active
          ? sort.direction === "asc"
            ? "ascending"
            : "descending"
          : undefined
      }
      className="px-4 py-1 font-medium"
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        aria-label={`${column.label}: sort ${description}`}
        title={`Sort ${description}`}
        className={`inline-flex min-h-11 items-center gap-2 rounded-lg
                    px-1 text-xs font-semibold uppercase tracking-wide
                    hover:bg-surface-hover focus-visible:outline-2
                    focus-visible:outline-primary ${
                      active ? "text-text-primary" : "text-text-secondary"
                    }`}
      >
        {column.label}

        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4 shrink-0"
        >
          {!active ? (
            <>
              <path d="M8 19V5m-3 3 3-3 3 3" />
              <path d="M16 5v14m-3-3 3 3 3-3" />
            </>
          ) : sort.direction === "asc" ? (
            <path d="M12 19V5m-5 5 5-5 5 5" />
          ) : (
            <path d="M12 5v14m-5-5 5 5 5-5" />
          )}
        </svg>
      </button>
    </th>
  );
}

function InventoryBatchModal({ medicine, onClose }) {
  return (
    <Modal title="Available batches" onClose={onClose}>
      <div className="space-y-5">
        <div>
          <h3 className="break-words font-semibold">
            {medicine.medicine_name}
          </h3>

          <p className="mt-1 break-words text-sm text-text-secondary">
            {medicine.manufacturer_name} · {medicine.category}
          </p>

          <p className="mt-3 text-sm">
            Available stock:{" "}
            <span className="font-semibold tabular-nums">
              {medicine.available_stock}
            </span>
          </p>
        </div>

        <p className="text-xs leading-5 text-text-secondary">
          Batches are ordered by earliest expiry. Selling prices can differ
          between batches.
        </p>

        <div
          role="region"
          aria-label={`Available batches for ${medicine.medicine_name}`}
          tabIndex={0}
          className="overflow-x-auto rounded-xl border border-border
                     focus-visible:outline-2 focus-visible:outline-primary"
        >
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-background text-xs text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Batch
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Selling price
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Stock
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Expiry
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {medicine.batches.map((batch) => (
                <tr key={batch.batch_id}>
                  <td className="max-w-40 break-words px-4 py-4">
                    {batch.batch_number}
                  </td>

                  <td className="px-4 py-4 tabular-nums">
                    {formatPrice(batch.selling_price)}
                  </td>

                  <td className="px-4 py-4 tabular-nums">
                    {batch.stock_quantity}
                  </td>

                  <td className="whitespace-nowrap px-4 py-4">
                    {formatBatchDate(batch.expiry_date)}

                    <p
                      className={`mt-1 text-xs ${
                        batch.days_to_expire <= 10
                          ? "text-warning"
                          : "text-text-secondary"
                      }`}
                    >
                      {expiryText(batch.days_to_expire)}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="min-h-11 w-full rounded-xl border border-border
                     px-5 py-3 text-sm font-semibold hover:bg-surface-hover
                     focus-visible:outline-2 focus-visible:outline-primary"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}

export default function StockOverview({ mode = "inventory" }) {
  const { authenticatedRequest } = useAuth();
  const isLowStock = mode === "low-stock";
  const title = isLowStock ? "Low Stock" : "Available Inventory";

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [manufacturerFilter, setManufacturerFilter] = useState("All");
  const [stockFilter, setStockFilter] = useState("All");
  const [selectedId, setSelectedId] = useState(null);

  const [sort, setSort] = useState({
    key: isLowStock ? "available_stock" : "medicine_name",
    direction: "asc",
  });

  useEffect(() => {
    let ignore = false;

    async function loadRecords() {
      setLoading(true);
      setError("");

      try {
        const result = isLowStock
          ? await getLowStock(authenticatedRequest)
          : await getAvailableInventory(authenticatedRequest);

        if (!ignore) {
          setRecords(result);
        }
      } catch (requestError) {
        if (!ignore) {
          setError(
            requestError.message || "Unable to load stock information."
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadRecords();

    return () => {
      ignore = true;
    };
  }, [authenticatedRequest, isLowStock, reloadKey]);

  function reloadRecords() {
    setLoading(true);
    setReloadKey((previous) => previous + 1);
  }

  function clearFilters() {
    setSearch("");
    setCategoryFilter("All");
    setManufacturerFilter("All");
    setStockFilter("All");
  }

  function handleSort(key) {
    setSort((previous) => ({
      key,
      direction:
        previous.key === key && previous.direction === "asc"
          ? "desc"
          : "asc",
    }));
  }

  const categories = [
    ...new Set(records.map((item) => item.category)),
  ].sort(collator.compare);

  const manufacturers = [
    ...new Map(
      records.map((item) => [
        String(item.manufacturer_id),
        {
          id: String(item.manufacturer_id),
          name: item.manufacturer_name,
        },
      ])
    ).values(),
  ].sort((first, second) => collator.compare(first.name, second.name));

  const query = search.trim().toLowerCase();

  const filteredRecords = records.filter((item) => {
    const matchesSearch =
      (item.medicine_name || "").toLowerCase().includes(query) ||
      (item.manufacturer_name || "").toLowerCase().includes(query) ||
      (!isLowStock &&
        item.batches.some((batch) =>
          (batch.batch_number || "").toLowerCase().includes(query)
        ));

    const matchesStock = isLowStock
      ? stockFilter === "All" ||
        (stockFilter === "Out" && item.available_stock === 0) ||
        (stockFilter === "Low" && item.available_stock > 0)
      : stockFilter === "All" ||
        (stockFilter === "Soon" &&
          item.earliest_expiry_days !== null &&
          item.earliest_expiry_days <= 10) ||
        (stockFilter === "Today" && item.earliest_expiry_days === 0);

    return (
      matchesSearch &&
      matchesStock &&
      (categoryFilter === "All" || item.category === categoryFilter) &&
      (manufacturerFilter === "All" ||
        String(item.manufacturer_id) === manufacturerFilter)
    );
  });

  const columns = [
    ...commonColumns,
    ...(isLowStock
      ? [
          {
            key: "reorder_level",
            label: "Reorder level",
            numeric: true,
          },
          {
            key: "units_to_threshold",
            label: "Units to threshold",
            numeric: true,
          },
        ]
      : [
          {
            key: "earliest_expiry_days",
            label: "Earliest expiry",
            date: true,
            numeric: true,
          },
        ]),
  ];

  const numericSort = columns.find(
    (column) => column.key === sort.key
  )?.numeric;

  const sortedRecords = [...filteredRecords].sort((first, second) => {
    const firstValue = first[sort.key];
    const secondValue = second[sort.key];

    if (firstValue == null && secondValue != null) return 1;
    if (firstValue != null && secondValue == null) return -1;

    const comparison =
      firstValue == null && secondValue == null
        ? 0
        : numericSort
          ? Number(firstValue) - Number(secondValue)
          : collator.compare(String(firstValue), String(secondValue));

    return comparison !== 0
      ? sort.direction === "asc"
        ? comparison
        : -comparison
      : Number(first.medicine_id) - Number(second.medicine_id);
  });

  const hasFilters =
    search !== "" ||
    categoryFilter !== "All" ||
    manufacturerFilter !== "All" ||
    stockFilter !== "All";

  const selectedMedicine = records.find(
    (item) => String(item.medicine_id) === selectedId
  );

  const outOfStockCount = records.filter(
    (item) => item.available_stock === 0
  ).length;

  const expiringCount = isLowStock
    ? 0
    : records.filter(
        (item) =>
          item.earliest_expiry_days !== null &&
          item.earliest_expiry_days <= 10
      ).length;

  return (
    <div className="space-y-4">
      {/* Compact title and summary badges */}
      <header className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {title}
          </h1>

          <p className="mt-1 text-sm leading-6 text-text-secondary">
            {isLowStock
              ? "Medicines at or below their reorder level."
              : "Check available stock, batch prices, and expiry dates."}
          </p>
        </div>

        {!loading && !error && (
          <div
            role="group"
            aria-label="Summary for all medicines before filtering"
            className="flex flex-wrap items-center gap-2 xl:justify-end"
          >
            <span
              className="inline-flex items-center gap-2 rounded-full
                         border border-border bg-surface px-3 py-1.5
                         text-xs text-text-secondary"
            >
              <strong className="font-semibold tabular-nums text-text-primary">
                {records.length}
              </strong>
              {isLowStock ? "medicines need attention" : "medicines in stock"}
            </span>

            <span
              title={
                isLowStock
                  ? "Medicines with zero available stock"
                  : "Medicines with at least one batch expiring today or within 10 days"
              }
              className={`inline-flex items-center gap-2 rounded-full
                          border px-3 py-1.5 text-xs ${
                            isLowStock
                              ? "border-danger/30 bg-danger/10 text-danger"
                              : "border-warning/30 bg-warning/10 text-warning"
                          }`}
            >
              <strong className="font-semibold tabular-nums">
                {isLowStock ? outOfStockCount : expiringCount}
              </strong>
              {isLowStock ? "out of stock" : "with expiry ≤10 days"}
            </span>
          </div>
        )}
      </header>

      {/* One row on wide screens; wraps on smaller screens */}
      <section
        aria-label={`Filter ${title.toLowerCase()}`}
        className="rounded-xl border border-border bg-surface p-3 sm:p-4"
      >
        <div
          className="grid items-end gap-3 sm:grid-cols-2
                     xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]"
        >
          <div className="min-w-0">
            <label htmlFor={`${mode}-search`} className={labelClass}>
              Search
            </label>

            <input
              id={`${mode}-search`}
              name="search"
              type="search"
              autoComplete="off"
              placeholder={
                isLowStock
                  ? "Medicine or manufacturer"
                  : "Medicine, manufacturer, or batch"
              }
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={`${controlClass} placeholder:text-text-muted`}
            />
          </div>

          <div className="min-w-0">
            <label htmlFor={`${mode}-category`} className={labelClass}>
              Category
            </label>

            <select
              id={`${mode}-category`}
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className={controlClass}
            >
              <option value="All">All categories</option>

              {categoryFilter !== "All" &&
                !categories.includes(categoryFilter) && (
                  <option value={categoryFilter}>
                    {categoryFilter} (no results)
                  </option>
                )}

              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label htmlFor={`${mode}-manufacturer`} className={labelClass}>
              Manufacturer
            </label>

            <select
              id={`${mode}-manufacturer`}
              value={manufacturerFilter}
              onChange={(event) => setManufacturerFilter(event.target.value)}
              className={controlClass}
            >
              <option value="All">All manufacturers</option>

              {manufacturerFilter !== "All" &&
                !manufacturers.some(
                  (item) => item.id === manufacturerFilter
                ) && (
                  <option value={manufacturerFilter}>
                    Selected manufacturer (no results)
                  </option>
                )}

              {manufacturers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label htmlFor={`${mode}-condition`} className={labelClass}>
              {isLowStock ? "Stock condition" : "Expiry"}
            </label>

            <select
              id={`${mode}-condition`}
              value={stockFilter}
              onChange={(event) => setStockFilter(event.target.value)}
              className={controlClass}
            >
              <option value="All">
                {isLowStock ? "All conditions" : "All expiry dates"}
              </option>

              {isLowStock ? (
                <>
                  <option value="Out">Out of stock</option>
                  <option value="Low">Low stock, above zero</option>
                </>
              ) : (
                <>
                  <option value="Soon">Within 10 days</option>
                  <option value="Today">Expires today</option>
                </>
              )}
            </select>
          </div>
        </div>
      </section>

      {/* Table */}
      <section
        aria-labelledby={`${mode}-list-heading`}
        className="overflow-hidden rounded-xl border border-border bg-surface"
      >
        <div
          className="flex items-center justify-between gap-3
                     border-b border-border px-4 py-2"
        >
          <div className="min-w-0">
            <h2
              id={`${mode}-list-heading`}
              className="text-sm font-semibold"
            >
              {isLowStock ? "Low-stock medicines" : "Available medicines"}
            </h2>

            <p role="status" className="mt-0.5 text-xs text-text-secondary">
              {loading
                ? "Loading stock information..."
                : error
                  ? "Could not load stock information."
                  : `${sortedRecords.length} of ${records.length} medicines`}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="min-h-11 rounded-lg px-2 text-xs font-medium
                           text-text-secondary hover:bg-surface-hover
                           hover:text-text-primary focus-visible:outline-2
                           focus-visible:outline-primary"
              >
                Clear filters
              </button>
            )}

            <button
              type="button"
              onClick={reloadRecords}
              disabled={loading}
              aria-label={`Reload ${title.toLowerCase()}`}
              title={`Reload ${title.toLowerCase()}`}
              className="flex size-11 shrink-0 items-center justify-center
                         rounded-lg border border-border text-text-secondary
                         hover:bg-surface-hover hover:text-text-primary
                         focus-visible:outline-2 focus-visible:outline-primary
                         disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`size-5 ${
                  loading ? "motion-safe:animate-spin" : ""
                }`}
              >
                <path d="M20 7v5h-5M4 17v-5h5" />
                <path d="M6.1 7a7 7 0 0 1 11.55-1.65L20 8" />
                <path d="M17.9 17a7 7 0 0 1-11.55 1.65L4 16" />
              </svg>
            </button>
          </div>
        </div>

        <p role="status" className="sr-only">
          Sorted by {columns.find((column) => column.key === sort.key)?.label},{" "}
          {sort.direction === "asc" ? "ascending" : "descending"}.
        </p>

        <div aria-busy={loading}>
          {loading ? (
            <p className="px-6 py-12 text-center text-sm text-text-secondary">
              Loading stock information...
            </p>
          ) : error ? (
            <div className="px-6 py-12 text-center">
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>

              <p className="mt-3 text-sm text-text-secondary">
                Use the reload button above to try again.
              </p>
            </div>
          ) : records.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <h3 className="font-medium">
                {isLowStock
                  ? "No low-stock medicines found"
                  : "No available inventory"}
              </h3>

              <p className="mt-2 text-sm text-text-secondary">
                {isLowStock
                  ? "No medicines were returned by the low-stock check."
                  : "Available medicine batches will appear here when stock is added."}
              </p>
            </div>
          ) : sortedRecords.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <h3 className="font-medium">No matching medicines</h3>

              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 min-h-11 rounded-lg px-3 text-sm underline
                           focus-visible:outline-2 focus-visible:outline-primary"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div
              role="region"
              aria-label={title}
              tabIndex={0}
              className="overflow-x-auto focus-visible:outline-2
                         focus-visible:outline-primary
                         focus-visible:-outline-offset-2"
            >
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead
                  className="bg-background text-xs uppercase
                             tracking-wide text-text-secondary"
                >
                  <tr>
                    {columns.map((column) => (
                      <SortableHeader
                        key={column.key}
                        column={column}
                        sort={sort}
                        onSort={handleSort}
                      />
                    ))}

                    <th scope="col" className="px-4 py-3 font-medium">
                      {isLowStock ? "Stock condition" : "Batches"}
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {sortedRecords.map((item) => (
                    <tr
                      key={item.medicine_id}
                      className="hover:bg-background/40"
                    >
                      <td className="max-w-56 break-words px-4 py-4 font-medium">
                        {item.medicine_name}
                      </td>

                      <td
                        className="max-w-56 break-words px-4 py-4
                                   text-text-secondary"
                      >
                        {item.manufacturer_name}
                      </td>

                      <td className="px-4 py-4">
                        {item.category}
                      </td>

                      <td className="px-4 py-4 font-semibold tabular-nums">
                        {item.available_stock}
                      </td>

                      {isLowStock ? (
                        <>
                          <td className="px-4 py-4 tabular-nums">
                            {item.reorder_level}
                          </td>

                          <td className="px-4 py-4 tabular-nums">
                            {item.units_to_threshold}

                            {item.units_to_threshold === 0 && (
                              <p className="mt-1 text-xs text-text-secondary">
                                At reorder level
                              </p>
                            )}
                          </td>

                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex whitespace-nowrap
                                          rounded-full px-3 py-1
                                          text-xs font-medium ${
                                            item.available_stock === 0
                                              ? "bg-danger/10 text-danger"
                                              : "bg-warning/10 text-warning"
                                          }`}
                            >
                              {item.stock_status}
                            </span>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="whitespace-nowrap px-4 py-4">
                            {formatBatchDate(item.earliest_expiry_date)}

                            <p
                              className={`mt-1 text-xs ${
                                item.earliest_expiry_days !== null &&
                                item.earliest_expiry_days <= 10
                                  ? "text-warning"
                                  : "text-text-secondary"
                              }`}
                            >
                              {expiryText(item.earliest_expiry_days)}
                            </p>
                          </td>

                          <td className="px-4 py-4">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedId(String(item.medicine_id))
                              }
                              aria-label={`View available batches for ${item.medicine_name}`}
                              className="min-h-11 whitespace-nowrap rounded-lg
                                         border border-border px-3 py-2
                                         text-xs font-semibold
                                         hover:bg-surface-hover
                                         focus-visible:outline-2
                                         focus-visible:outline-primary"
                            >
                              View batches ({item.batches.length})
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p
          className="border-t border-border px-4 py-3
                     text-xs leading-5 text-text-secondary"
        >
          {isLowStock
            ? "Units to threshold is the quantity needed to reach the reorder level, not a suggested purchase quantity."
            : "Expiry alerts include today and the next 10 days. View batches for individual prices and quantities."}
        </p>
      </section>

      {!isLowStock && selectedMedicine && (
        <InventoryBatchModal
          medicine={selectedMedicine}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}