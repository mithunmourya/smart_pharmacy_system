import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import { CompactTable } from "../../components/CompactInventoryUI";
import SaleDetailsModal from "../../components/sales/SaleDetailsModal";

import useAuth from "../../hooks/useAuth";
import { getMyPurchases } from "../../services/purchase.service";

// ==========================================
// Formatting and configuration
// ==========================================

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
});

const actionClass = `
  inline-flex min-h-11 items-center justify-center gap-2
  rounded-xl border border-border px-3 py-2
  text-sm font-medium transition-colors
  hover:bg-surface-hover
  focus-visible:outline-2 focus-visible:outline-offset-2
  focus-visible:outline-primary
  disabled:cursor-not-allowed disabled:opacity-50
`;

const columns = [
  { key: "sale_id", label: "Purchase ID", sortable: false },
  { key: "created_at", label: "Date · IST", sortable: false },
  { key: "payment_mode", label: "Payment", sortable: false },
  { key: "total_amount", label: "Amount", sortable: false },
  { key: "actions", label: "Actions", sortable: false },
];

function money(paise) {
  return currencyFormatter.format(paise / 100);
}

// ==========================================
// Data helpers
// ==========================================

function initialHistory() {
  return {
    purchases: [],
    loading: true,
    error: "",
    updatedAt: null,
  };
}

function validatePurchases(purchases) {
  const invalid = purchases.some(
    (purchase) =>
      !Number.isSafeInteger(purchase.sale_id) ||
      purchase.sale_id <= 0 ||
      !Number.isFinite(purchase.total_amount) ||
      purchase.total_amount < 0 ||
      !purchase.created_at ||
      !Number.isFinite(
        new Date(purchase.created_at).getTime()
      )
  );

  if (invalid) {
    throw new Error(
      "Some purchase details could not be read. Please try again."
    );
  }

  return purchases;
}

function summarizePurchases(purchases) {
  const sorted = [...purchases].sort(
    (first, second) =>
      new Date(second.created_at).getTime() -
        new Date(first.created_at).getTime() ||
      second.sale_id - first.sale_id
  );

  return {
    count: purchases.length,

    totalPaise: purchases.reduce(
      (total, purchase) =>
        total + Math.round(purchase.total_amount * 100),
      0
    ),

    latest: sorted[0] || null,
    recent: sorted.slice(0, 5),
  };
}

// ==========================================
// UI components
// ==========================================

function Icon({ name, className = "size-5" }) {
  const paths = {
    purchases: [
      "M6 3h12v18l-3-2-3 2-3-2-3 2V3z",
      "M9 7h6",
      "M9 11h6",
      "M9 15h3",
    ],

    money: [
      "M3 6h18v12H3z",
      "M3 10a4 4 0 0 0 4-4",
      "M17 6a4 4 0 0 0 4 4",
      "M3 14a4 4 0 0 1 4 4",
      "M17 18a4 4 0 0 1 4-4",
      "M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
    ],

    clock: [
      "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
      "M12 7v5l3 2",
    ],

    refresh: [
      "M20 7v5h-5",
      "M4 17v-5h5",
      "M6.1 7a7 7 0 0 1 11.55-1.65L20 8",
      "M17.9 17a7 7 0 0 1-11.55 1.65L4 16",
    ],

    arrow: [
      "M5 12h14",
      "m13 6 6 6-6 6",
    ],
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {(paths[name] || paths.purchases).map(
        (path, index) => (
          <path key={index} d={path} />
        )
      )}
    </svg>
  );
}

function SummaryCard({
  label,
  value,
  description,
  icon,
  loading,
  error,
}) {
  return (
    <section
      aria-busy={loading}
      className="min-w-0 rounded-2xl border border-border
                 bg-surface p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-medium text-text-secondary">
          {label}
        </h2>

        <span
          className="flex size-10 shrink-0 items-center
                     justify-center rounded-xl
                     border border-primary/25
                     bg-primary/10 text-blue-300"
        >
          <Icon name={icon} />
        </span>
      </div>

      <p className="mt-3 break-words text-2xl font-bold tracking-tight tabular-nums">
        {loading
          ? "Loading..."
          : error
            ? "Unavailable"
            : value}
      </p>

      <p className="mt-2 text-xs leading-5 text-text-secondary">
        {description}
      </p>
    </section>
  );
}

// ==========================================
// Customer dashboard
// ==========================================

export default function CustomerDashboard() {
  const { user, authenticatedRequest } = useAuth();

  const [history, setHistory] = useState(initialHistory);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedSaleId, setSelectedSaleId] = useState(null);

  useEffect(() => {
    let ignore = false;

    setHistory(initialHistory());

    async function loadPurchases() {
      try {
        const response =
          await getMyPurchases(authenticatedRequest);

        const purchases = validatePurchases(response);

        if (ignore) return;

        setHistory({
          purchases,
          loading: false,
          error: "",
          updatedAt: new Date(),
        });
      } catch (error) {
        if (ignore) return;

        setHistory({
          purchases: [],
          loading: false,
          error:
            error.message ||
            "Unable to load your purchase history.",
          updatedAt: null,
        });
      }
    }

    loadPurchases();

    return () => {
      ignore = true;
    };
  }, [authenticatedRequest, reloadKey]);

  const summary = useMemo(
    () => summarizePurchases(history.purchases),
    [history.purchases]
  );

  const initials =
    user.name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "U";

  function refreshDashboard() {
    if (history.loading) return;

    setSelectedSaleId(null);
    setHistory(initialHistory());
    setReloadKey((previous) => previous + 1);
  }

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">
            Your pharmacy
          </p>

          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Dashboard
          </h1>

          <p className="mt-2 break-words text-sm leading-6 text-text-secondary">
            Welcome back, {user.name}. View your purchases
            and manage your account.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshDashboard}
          disabled={history.loading}
          aria-label="Refresh dashboard"
          className={`${actionClass} self-start sm:self-auto`}
        >
          <Icon
            name="refresh"
            className={`size-5 ${
              history.loading
                ? "motion-safe:animate-spin"
                : ""
            }`}
          />

          {history.loading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary">
        <p>All purchases linked to your account</p>

        {history.updatedAt && (
          <p>
            Updated{" "}
            {timeFormatter.format(history.updatedAt)} IST
          </p>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Total purchases"
          value={summary.count}
          description="All recorded purchases linked to your account."
          icon="purchases"
          loading={history.loading}
          error={history.error}
        />

        <SummaryCard
          label="Total amount spent"
          value={money(summary.totalPaise)}
          description="Total recorded amount across your purchases."
          icon="money"
          loading={history.loading}
          error={history.error}
        />

        <SummaryCard
          label="Most recent purchase"
          value={
            summary.latest
              ? dateFormatter.format(
                  new Date(summary.latest.created_at)
                )
              : "No purchases yet"
          }
          description={
            summary.latest
              ? `Purchase #${summary.latest.sale_id} · ${money(
                  Math.round(
                    summary.latest.total_amount * 100
                  )
                )}`
              : "Your latest purchase will appear here."
          }
          icon="clock"
          loading={history.loading}
          error={history.error}
        />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-3">
        {/* Recent purchases */}
        <section
          aria-labelledby="recent-purchases-heading"
          className="min-w-0 space-y-3 xl:col-span-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2
                id="recent-purchases-heading"
                className="font-semibold"
              >
                Recent purchases
              </h2>

              <p className="mt-1 text-xs text-text-secondary">
                Your latest five purchases.
              </p>
            </div>

            <Link
              to="/my-purchases"
              className={actionClass}
            >
              View all
              <Icon name="arrow" className="size-4" />
            </Link>
          </div>

          <CompactTable
            title="Your purchase history"
            noun="purchases"
            columns={columns}
            sort={{
              key: "created_at",
              direction: "desc",
            }}
            onReload={refreshDashboard}
            loading={history.loading}
            error={history.error}
            total={summary.count}
            count={summary.recent.length}
            hasFilters={false}
            emptyMessage="Purchases linked to your account will appear here. Share your registered email with the pharmacist when making a purchase."
            minWidth="min-w-[760px]"
          >
            {summary.recent.map((purchase) => (
              <tr
                key={purchase.sale_id}
                className="hover:bg-surface-hover/50"
              >
                <td className="px-4 py-4 font-semibold tabular-nums">
                  #{purchase.sale_id}
                </td>

                <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                  {dateTimeFormatter.format(
                    new Date(purchase.created_at)
                  )}
                </td>

                <td className="px-4 py-4">
                  <span
                    className="inline-flex rounded-full
                               bg-background px-3 py-1
                               text-xs font-medium"
                  >
                    {purchase.payment_mode}
                  </span>
                </td>

                <td className="whitespace-nowrap px-4 py-4 font-semibold tabular-nums">
                  {money(
                    Math.round(
                      purchase.total_amount * 100
                    )
                  )}
                </td>

                <td className="px-4 py-4">
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-label={`View medicines for purchase ${purchase.sale_id}`}
                    onClick={() =>
                      setSelectedSaleId(
                        purchase.sale_id
                      )
                    }
                    className={`${actionClass} whitespace-nowrap`}
                  >
                    View medicines
                  </button>
                </td>
              </tr>
            ))}
          </CompactTable>

          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-sm font-medium">
              Keep your purchase history together
            </p>

            <p className="mt-1 text-xs leading-6 text-text-secondary">
              Ask the pharmacist to select your registered
              account before completing a sale. Purchases
              recorded as walk-in sales will not appear in
              your account.
            </p>
          </div>
        </section>

        {/* Profile */}
        <section
          aria-labelledby="customer-profile-heading"
          className="min-w-0 rounded-2xl border border-border
                     bg-surface p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2
                id="customer-profile-heading"
                className="font-semibold"
              >
                Your profile
              </h2>

              <p className="mt-1 text-xs text-text-secondary">
                Your registered account details.
              </p>
            </div>

            <span
              aria-hidden="true"
              className="flex size-12 shrink-0 items-center
                         justify-center rounded-2xl
                         border border-primary/25
                         bg-primary/10 font-bold
                         text-blue-300"
            >
              {initials}
            </span>
          </div>

          <dl className="mt-6 space-y-5">
            <div>
              <dt className="text-xs text-text-secondary">
                Full name
              </dt>

              <dd className="mt-1.5 break-words text-sm font-medium">
                {user.name}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-text-secondary">
                Email address
              </dt>

              <dd className="mt-1.5 break-all text-sm font-medium">
                {user.email}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-text-secondary">
                Account role
              </dt>

              <dd className="mt-2">
                <span
                  className="inline-flex rounded-full
                             bg-background px-3 py-1
                             text-xs font-medium"
                >
                  {user.role}
                </span>
              </dd>
            </div>
          </dl>

          <nav
            aria-label="Account shortcuts"
            className="mt-6 space-y-2"
          >
            <Link
              to="/profile"
              className={`${actionClass} w-full`}
            >
              My Profile
              <Icon name="arrow" className="size-4" />
            </Link>

            <Link
              to="/settings/change-password"
              className={`${actionClass} w-full`}
            >
              Change Password
            </Link>
          </nav>

          <p className="mt-4 text-xs leading-6 text-text-secondary">
            To update your name or email address, contact
            an admin.
          </p>
        </section>
      </div>

      {/* Customer-owned purchase details */}
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