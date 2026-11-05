import { useEffect, useState } from "react";
import {
  CompactHeader,
  CompactTable,
  FilterField,
  SummaryBadge,
} from "../../components/CompactInventoryUI";
import SaleDetailsModal from "../../components/sales/SaleDetailsModal";
import useAuth from "../../hooks/useAuth";
import {
  getSales,
  PAYMENT_MODES,
} from "../../services/sales.service";
import { formatPrice } from "../../utils/batch";

const actionClass = `
  inline-flex min-h-11 items-center justify-center rounded-lg
  border border-border px-3 py-2 text-sm font-medium
  hover:bg-surface-hover
  focus-visible:outline-2 focus-visible:outline-offset-2
  focus-visible:outline-primary
  disabled:cursor-not-allowed disabled:opacity-50
`;

const columns = [
  { key: "sale_id", label: "Sale ID" },
  { key: "customer_name", label: "Customer" },
  { key: "pharmacist_name", label: "Pharmacist" },
  { key: "payment_mode", label: "Payment" },
  { key: "total_amount", label: "Total" },
  { key: "created_at", label: "Created" },
  { key: "actions", label: "Actions", sortable: false },
];

function timestamp(value) {
  if (!value) return null;

  const time = new Date(value).getTime();

  return Number.isFinite(time) ? time : null;
}

function formatDateTime(value) {
  const time = timestamp(value);

  if (time === null) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}

export default function SalesHistory() {
  const { authenticatedRequest } = useAuth();

  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [search, setSearch] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [selectedSaleId, setSelectedSaleId] = useState(null);

  const [sort, setSort] = useState({
    key: "created_at",
    direction: "desc",
  });

  useEffect(() => {
    let ignore = false;

    async function loadSales() {
      setLoading(true);
      setError("");

      try {
        const data = await getSales(authenticatedRequest);

        if (!ignore) {
          setSales(data);
        }
      } catch (requestError) {
        if (!ignore) {
          setError(
            requestError.message || "Unable to load sales."
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadSales();

    return () => {
      ignore = true;
    };
  }, [authenticatedRequest, reloadKey]);

  const searchTerm = search.trim().toLowerCase();
  const hasFilters = Boolean(searchTerm || paymentMode);

  const filteredSales = sales.filter((sale) => {
    const matchesSearch = [
      sale.sale_id,
      sale.customer_name,
      sale.pharmacist_name,
    ].some((value) =>
      String(value ?? "").toLowerCase().includes(searchTerm)
    );

    const matchesPayment =
      !paymentMode || sale.payment_mode === paymentMode;

    return matchesSearch && matchesPayment;
  });

  const visibleSales = [...filteredSales].sort((a, b) => {
    let comparison = 0;

    if (sort.key === "created_at") {
      const first = timestamp(a.created_at);
      const second = timestamp(b.created_at);

      // Missing dates stay at the bottom in either direction.
      if (first === null && second !== null) return 1;
      if (first !== null && second === null) return -1;

      comparison = (first ?? 0) - (second ?? 0);
    } else if (
      sort.key === "sale_id" ||
      sort.key === "total_amount"
    ) {
      comparison = Number(a[sort.key]) - Number(b[sort.key]);
    } else {
      comparison = String(a[sort.key] || "").localeCompare(
        String(b[sort.key] || ""),
        undefined,
        {
          sensitivity: "base",
          numeric: true,
        }
      );
    }

    return (
      comparison * (sort.direction === "asc" ? 1 : -1) ||
      b.sale_id - a.sale_id
    );
  });

  const filteredTotal =
    filteredSales.reduce(
      (total, sale) =>
        total + Math.round(sale.total_amount * 100),
      0
    ) / 100;

  function handleSort(key) {
    setSort((previous) => ({
      key,
      direction:
        previous.key === key && previous.direction === "asc"
          ? "desc"
          : "asc",
    }));
  }

  function reloadSales() {
    setLoading(true);
    setSelectedSaleId(null);
    setReloadKey((previous) => previous + 1);
  }

  function clearFilters() {
    setSearch("");
    setPaymentMode("");
  }

  return (
    <div className="space-y-5">
      <CompactHeader
        title="Sales History"
        description="Review recorded sales, customers, and medicines sold."
        summary={
          !loading && !error ? (
            <>
              <SummaryBadge count={filteredSales.length}>
                {hasFilters ? "Matching sales" : "Sales"}
              </SummaryBadge>

              <SummaryBadge count={formatPrice(filteredTotal)}>
                {hasFilters ? "Matching total" : "Total sales amount"}
              </SummaryBadge>
            </>
          ) : null
        }
      />

      <div className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[2fr_1fr]">
        <FilterField
          id="sales-search"
          label="Search sales"
          type="search"
          placeholder="Sale ID, customer, or pharmacist"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <FilterField
          id="sales-payment-filter"
          label="Payment mode"
          value={paymentMode}
          onChange={(event) => setPaymentMode(event.target.value)}
        >
          <option value="">All payment modes</option>

          {PAYMENT_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </FilterField>
      </div>

      <CompactTable
        title="Recorded sales"
        noun="sales"
        columns={columns}
        sort={sort}
        onSort={handleSort}
        onReload={reloadSales}
        loading={loading}
        error={error}
        total={sales.length}
        count={visibleSales.length}
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        emptyMessage="No sales have been recorded yet."
        minWidth="min-w-[1050px]"
      >
        {visibleSales.map((sale) => (
          <tr
            key={sale.sale_id}
            className="hover:bg-surface-hover/40"
          >
            <td className="px-4 py-4 font-medium">
              #{sale.sale_id}
            </td>

            <td className="px-4 py-4">
              {sale.customer_name}
            </td>

            <td className="px-4 py-4">
              {sale.pharmacist_name}
            </td>

            <td className="px-4 py-4">
              <span className="inline-flex rounded-full border border-border bg-background px-3 py-1 text-xs font-medium">
                {sale.payment_mode}
              </span>
            </td>

            <td className="whitespace-nowrap px-4 py-4 font-medium tabular-nums">
              {formatPrice(sale.total_amount)}
            </td>

            <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
              {formatDateTime(sale.created_at)}
            </td>

            <td className="px-4 py-4">
              <button
                type="button"
                onClick={() => setSelectedSaleId(sale.sale_id)}
                aria-label={`View details for sale ${sale.sale_id}`}
                aria-haspopup="dialog"
                className={actionClass}
              >
                View details
              </button>
            </td>
          </tr>
        ))}
      </CompactTable>

      {selectedSaleId !== null && (
        <SaleDetailsModal
          key={selectedSaleId}
          saleId={selectedSaleId}
          audience="admin"
          onClose={() => setSelectedSaleId(null)}
        />
      )}
    </div>
  );
}