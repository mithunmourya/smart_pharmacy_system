import { useEffect, useState } from "react";
import {
  CompactHeader,
  CompactTable,
  FilterField,
  SummaryBadge,
} from "../../components/CompactInventoryUI";
import SaleDetailsModal from "../../components/sales/SaleDetailsModal";
import useAuth from "../../hooks/useAuth";
import { getMyPurchases } from "../../services/purchase.service";
import { PAYMENT_MODES } from "../../services/sales.service";
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
  { key: "sale_id", label: "Purchase ID" },
  { key: "created_at", label: "Purchased on" },
  { key: "payment_mode", label: "Payment" },
  { key: "total_amount", label: "Total" },
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

export default function MyPurchases() {
  const { authenticatedRequest } = useAuth();

  const [purchases, setPurchases] = useState([]);
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

    async function loadPurchases() {
      setLoading(true);
      setError("");

      try {
        const data = await getMyPurchases(authenticatedRequest);

        if (!ignore) {
          setPurchases(data);
        }
      } catch (requestError) {
        if (!ignore) {
          setError(
            requestError.message || "Unable to load your purchases."
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadPurchases();

    return () => {
      ignore = true;
    };
  }, [authenticatedRequest, reloadKey]);

  const searchTerm = search.trim().replace(/^#/, "");
  const hasFilters = Boolean(searchTerm || paymentMode);

  const filteredPurchases = purchases.filter((purchase) => {
    const matchesSearch = String(purchase.sale_id).includes(searchTerm);

    const matchesPayment =
      !paymentMode || purchase.payment_mode === paymentMode;

    return matchesSearch && matchesPayment;
  });

  const visiblePurchases = [...filteredPurchases].sort((a, b) => {
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
    filteredPurchases.reduce(
      (total, purchase) =>
        total + Math.round(purchase.total_amount * 100),
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

  function reloadPurchases() {
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
        title="My Purchases"
        description="View purchases linked to your account and the medicines included."
        summary={
          !loading && !error ? (
            <>
              <SummaryBadge count={filteredPurchases.length}>
                {hasFilters ? "Matching purchases" : "Purchases"}
              </SummaryBadge>

              <SummaryBadge count={formatPrice(filteredTotal)}>
                {hasFilters ? "Matching total" : "Total spent"}
              </SummaryBadge>
            </>
          ) : null
        }
      />

      <div className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[2fr_1fr]">
        <FilterField
          id="purchase-search"
          label="Search purchases"
          type="search"
          placeholder="Purchase ID"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <FilterField
          id="purchase-payment-filter"
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
        title="Purchase history"
        noun="purchases"
        columns={columns}
        sort={sort}
        onSort={handleSort}
        onReload={reloadPurchases}
        loading={loading}
        error={error}
        total={purchases.length}
        count={visiblePurchases.length}
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        emptyMessage="No purchases are linked to your account yet."
        minWidth="min-w-[780px]"
      >
        {visiblePurchases.map((purchase) => (
          <tr
            key={purchase.sale_id}
            className="hover:bg-surface-hover/40"
          >
            <td className="px-4 py-4 font-medium">
              #{purchase.sale_id}
            </td>

            <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
              {formatDateTime(purchase.created_at)}
            </td>

            <td className="px-4 py-4">
              <span className="inline-flex rounded-full border border-border bg-background px-3 py-1 text-xs font-medium">
                {purchase.payment_mode}
              </span>
            </td>

            <td className="whitespace-nowrap px-4 py-4 font-medium tabular-nums">
              {formatPrice(purchase.total_amount)}
            </td>

            <td className="px-4 py-4">
              <button
                type="button"
                onClick={() => setSelectedSaleId(purchase.sale_id)}
                aria-label={`View medicines for purchase ${purchase.sale_id}`}
                aria-haspopup="dialog"
                className={actionClass}
              >
                View medicines
              </button>
            </td>
          </tr>
        ))}
      </CompactTable>

      {selectedSaleId !== null && (
        <SaleDetailsModal
          key={selectedSaleId}
          saleId={selectedSaleId}
          audience="customer"
          onClose={() => setSelectedSaleId(null)}
        />
      )}
    </div>
  );
}