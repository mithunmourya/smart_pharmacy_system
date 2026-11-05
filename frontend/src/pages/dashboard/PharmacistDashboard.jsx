import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import useAuth from "../../hooks/useAuth";
import {
  getAvailableInventory,
  getLowStock,
} from "../../services/inventory.service";

// ==========================================
// Configuration and formatting
// ==========================================

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
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

const linkClass = `
  inline-flex min-h-11 shrink-0 items-center gap-1
  rounded-lg px-2 text-xs font-medium text-blue-300
  hover:bg-surface-hover
  focus-visible:outline-2 focus-visible:outline-primary
`;

const toneClasses = {
  blue: "border-primary/25 bg-primary/10 text-blue-300",
  amber: "border-warning/25 bg-warning/10 text-warning",
  red: "border-danger/25 bg-danger/10 text-red-300",
};

function expiryLabel(days) {
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `In ${days} days`;
}

// ==========================================
// Data helpers
// ==========================================

function initialResource() {
  return {
    data: [],
    loading: true,
    error: "",
  };
}

function initialResources() {
  return {
    inventory: initialResource(),
    lowStock: initialResource(),
  };
}

function resolveResource(result, fallback) {
  if (result.status === "fulfilled") {
    return {
      data: result.value,
      loading: false,
      error: "",
    };
  }

  return {
    data: [],
    loading: false,
    error: result.reason?.message || fallback,
  };
}

function validateInventory(inventory) {
  const invalid = inventory.some(
    (medicine) =>
      !Number.isFinite(medicine.available_stock) ||
      medicine.available_stock <= 0 ||
      medicine.batches.some(
        (batch) =>
          !Number.isFinite(batch.stock_quantity) ||
          batch.stock_quantity < 0 ||
          !Number.isFinite(batch.days_to_expire)
      )
  );

  if (invalid) {
    throw new Error(
      "Some inventory quantities or expiry details could not be read."
    );
  }

  return inventory;
}

function validateLowStock(medicines) {
  const invalid = medicines.some(
    (medicine) =>
      !Number.isFinite(medicine.available_stock) ||
      medicine.available_stock < 0 ||
      !Number.isFinite(medicine.reorder_level) ||
      medicine.reorder_level < 0
  );

  if (invalid) {
    throw new Error(
      "Some low-stock quantities could not be read."
    );
  }

  return medicines;
}

function sortLowStock(medicines) {
  return [...medicines].sort(
    (first, second) =>
      first.available_stock - second.available_stock ||
      first.medicine_name.localeCompare(second.medicine_name)
  );
}

function buildExpirySummary(inventory) {
  const batches = inventory
    .flatMap((medicine) =>
      medicine.batches
        .filter(
          (batch) =>
            batch.stock_quantity > 0 &&
            batch.days_to_expire >= 0 &&
            batch.days_to_expire <= 10
        )
        .map((batch) => ({
          ...batch,
          medicine_id: medicine.medicine_id,
          medicine_name: medicine.medicine_name,
          manufacturer_name: medicine.manufacturer_name,
        }))
    )
    .sort(
      (first, second) =>
        first.days_to_expire - second.days_to_expire ||
        first.medicine_name.localeCompare(
          second.medicine_name
        ) ||
        Number(first.batch_id) - Number(second.batch_id)
    );

  return {
    batches,
    medicineCount: new Set(
      batches.map((batch) => String(batch.medicine_id))
    ).size,
  };
}

// ==========================================
// UI components
// ==========================================

function Icon({ name, className = "size-5" }) {
  const paths = {
    plus: [
      "M12 5v14",
      "M5 12h14",
    ],
    inventory: [
      "m12 3 9 5-9 5-9-5 9-5z",
      "M3 8v9l9 5 9-5V8",
      "M12 13v9",
      "m7.5 5.5 9 5",
    ],
    warning: [
      "M12 3 2 21h20L12 3z",
      "M12 9v5",
      "M12 17h.01",
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
      {(paths[name] || paths.inventory).map(
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
  tone,
  resource,
}) {
  return (
    <section
      aria-busy={resource.loading}
      className="min-w-0 rounded-2xl border border-border
                 bg-surface p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-medium text-text-secondary">
          {label}
        </h2>

        <span
          className={`flex size-10 shrink-0 items-center
                      justify-center rounded-xl border
                      ${toneClasses[tone]}`}
        >
          <Icon name={icon} />
        </span>
      </div>

      <p className="mt-3 break-words text-2xl font-bold tracking-tight tabular-nums">
        {resource.loading
          ? "Loading..."
          : resource.error
            ? "Unavailable"
            : value}
      </p>

      <p className="mt-2 text-xs leading-5 text-text-secondary">
        {description}
      </p>
    </section>
  );
}

function Panel({
  title,
  description,
  link,
  linkLabel,
  children,
}) {
  return (
    <section
      className="min-w-0 rounded-2xl border border-border
                 bg-surface p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>

          <p className="mt-1 text-xs leading-5 text-text-secondary">
            {description}
          </p>
        </div>

        <Link to={link} className={linkClass}>
          {linkLabel}
          <Icon name="arrow" className="size-4" />
        </Link>
      </div>

      {children}
    </section>
  );
}

function ResourceContent({
  resource,
  onRetry,
  retryDisabled,
  children,
}) {
  if (resource.loading) {
    return (
      <p
        role="status"
        className="py-10 text-center text-sm text-text-secondary"
      >
        Loading stock information...
      </p>
    );
  }

  if (resource.error) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/10 p-4">
        <p role="alert" className="text-sm leading-6">
          {resource.error}
        </p>

        <button
          type="button"
          onClick={onRetry}
          disabled={retryDisabled}
          className={`${actionClass} mt-3`}
        >
          Retry
        </button>
      </div>
    );
  }

  return children;
}

function EmptyMessage({ children }) {
  return (
    <p
      className="rounded-xl border border-dashed border-border
                 px-4 py-10 text-center text-sm leading-6
                 text-text-secondary"
    >
      {children}
    </p>
  );
}

// ==========================================
// Pharmacist dashboard
// ==========================================

export default function PharmacistDashboard() {
  const { user, authenticatedRequest } = useAuth();

  const [resources, setResources] =
    useState(initialResources);

  const [reloadKey, setReloadKey] = useState(0);
  const [lastChecked, setLastChecked] = useState(null);
  const [now, setNow] = useState(() => new Date());

  const calendarDay = dateFormatter.format(now);

  // Keep the date correct when the page remains open.
  useEffect(() => {
    function updateClock() {
      setNow(new Date());
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        updateClock();
      }
    }

    const timer = window.setInterval(updateClock, 60_000);

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      window.clearInterval(timer);

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, []);

  // Load on entry, refresh, or a new India calendar day.
  useEffect(() => {
    let ignore = false;

    setResources(initialResources());
    setLastChecked(null);

    async function loadDashboard() {
      const [inventoryResult, lowStockResult] =
        await Promise.allSettled([
          getAvailableInventory(authenticatedRequest).then(
            validateInventory
          ),
          getLowStock(authenticatedRequest).then(
            validateLowStock
          ),
        ]);

      if (ignore) return;

      setResources({
        inventory: resolveResource(
          inventoryResult,
          "Unable to load available inventory."
        ),
        lowStock: resolveResource(
          lowStockResult,
          "Unable to load low-stock medicines."
        ),
      });

      setLastChecked(new Date());
    }

    loadDashboard();

    return () => {
      ignore = true;
    };
  }, [authenticatedRequest, reloadKey, calendarDay]);

  const lowStockAlerts = useMemo(
    () => sortLowStock(resources.lowStock.data),
    [resources.lowStock.data]
  );

  const expirySummary = useMemo(
    () => buildExpirySummary(resources.inventory.data),
    [resources.inventory.data]
  );

  const outOfStockCount = lowStockAlerts.filter(
    (medicine) => medicine.available_stock === 0
  ).length;

  const loading =
    resources.inventory.loading ||
    resources.lowStock.loading;

  function refreshDashboard() {
    if (loading) return;

    setResources(initialResources());
    setLastChecked(null);
    setReloadKey((previous) => previous + 1);
  }

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">
            Pharmacy workspace
          </p>

          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Dashboard
          </h1>

          <p className="mt-2 break-words text-sm text-text-secondary">
            Welcome back, {user.name}. Your stock overview is
            here.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshDashboard}
          disabled={loading}
          aria-label="Refresh dashboard"
          className={`${actionClass} self-start sm:self-auto`}
        >
          <Icon
            name="refresh"
            className={`size-5 ${
              loading ? "motion-safe:animate-spin" : ""
            }`}
          />

          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary">
        <p>{calendarDay} · India time</p>

        <p>
          {loading
            ? "Updating stock information..."
            : lastChecked
              ? `Last checked ${timeFormatter.format(
                  lastChecked
                )} IST · Refresh for latest stock`
              : "Current stock overview"}
        </p>
      </div>

      {/* Main action */}
      <section
        aria-labelledby="new-sale-heading"
        className="flex flex-col gap-4 rounded-2xl
                   border border-primary/25 bg-primary/10
                   p-5 sm:flex-row sm:items-center
                   sm:justify-between sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span
            className="flex size-11 shrink-0 items-center
                       justify-center rounded-xl
                       bg-primary/15 text-blue-300"
          >
            <Icon name="plus" className="size-6" />
          </span>

          <div className="min-w-0">
            <h2
              id="new-sale-heading"
              className="text-lg font-semibold"
            >
              Ready to serve your next customer?
            </h2>

            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Start a sale for a registered or walk-in
              customer and select their medicines.
            </p>
          </div>
        </div>

        <Link
          to="/sales/new"
          className="inline-flex min-h-12 shrink-0
                     items-center justify-center gap-2
                     rounded-xl bg-primary px-5 py-3
                     text-sm font-semibold text-white
                     transition-colors hover:bg-primary-hover
                     focus-visible:outline-2
                     focus-visible:outline-offset-2
                     focus-visible:outline-primary"
        >
          <Icon name="plus" />
          New Sale
        </Link>
      </section>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Medicines in stock"
          value={resources.inventory.data.length}
          description="Medicines with available, unexpired stock."
          icon="inventory"
          tone="blue"
          resource={resources.inventory}
        />

        <SummaryCard
          label="Low-stock medicines"
          value={lowStockAlerts.length}
          description={
            resources.lowStock.loading ||
            resources.lowStock.error
              ? "Medicines at or below their reorder level."
              : `${outOfStockCount} out of stock · At or below reorder level.`
          }
          icon="warning"
          tone={outOfStockCount > 0 ? "red" : "amber"}
          resource={resources.lowStock}
        />

        <SummaryCard
          label="Medicines nearing expiry"
          value={expirySummary.medicineCount}
          description="Available batches expiring within 10 days."
          icon="clock"
          tone="amber"
          resource={resources.inventory}
        />
      </div>

      {/* Stock alerts */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel
          title="Stock alerts"
          description="Out-of-stock medicines appear first."
          link="/low-stock"
          linkLabel="View all"
        >
          <ResourceContent
            resource={resources.lowStock}
            onRetry={refreshDashboard}
            retryDisabled={loading}
          >
            {lowStockAlerts.length === 0 ? (
              <EmptyMessage>
                No medicines are currently at or below their
                reorder level.
              </EmptyMessage>
            ) : (
              <>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {lowStockAlerts
                    .slice(0, 5)
                    .map((medicine) => {
                      const outOfStock =
                        medicine.available_stock === 0;

                      return (
                        <li
                          key={medicine.medicine_id}
                          className="p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <h3 className="break-words text-sm font-semibold">
                                {medicine.medicine_name}
                              </h3>

                              <p className="mt-1 break-words text-xs text-text-secondary">
                                {medicine.manufacturer_name}
                              </p>
                            </div>

                            <span
                              className={`shrink-0 rounded-full
                                          px-2.5 py-1 text-xs
                                          font-medium
                                          ${
                                            outOfStock
                                              ? "bg-danger/10 text-red-300"
                                              : "bg-warning/10 text-warning"
                                          }`}
                            >
                              {outOfStock
                                ? "Out of stock"
                                : "Low stock"}
                            </span>
                          </div>

                          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
                            <div className="flex items-center gap-2">
                              <dt className="text-text-secondary">
                                Available
                              </dt>

                              <dd className="font-semibold tabular-nums">
                                {medicine.available_stock}
                              </dd>
                            </div>

                            <div className="flex items-center gap-2">
                              <dt className="text-text-secondary">
                                Reorder level
                              </dt>

                              <dd className="font-semibold tabular-nums">
                                {medicine.reorder_level}
                              </dd>
                            </div>
                          </dl>
                        </li>
                      );
                    })}
                </ul>

                <p className="mt-3 text-xs leading-5 text-text-secondary">
                  Showing{" "}
                  {Math.min(5, lowStockAlerts.length)} of{" "}
                  {lowStockAlerts.length} medicines.
                </p>
              </>
            )}
          </ResourceContent>
        </Panel>

        <Panel
          title="Upcoming batch expiry"
          description="Available batches expiring within 10 days."
          link="/inventory"
          linkLabel="Inventory"
        >
          <ResourceContent
            resource={resources.inventory}
            onRetry={refreshDashboard}
            retryDisabled={loading}
          >
            {expirySummary.batches.length === 0 ? (
              <EmptyMessage>
                No available batches are expiring within the
                next 10 days.
              </EmptyMessage>
            ) : (
              <>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {expirySummary.batches
                    .slice(0, 5)
                    .map((batch) => (
                      <li
                        key={`${batch.medicine_id}-${batch.batch_id}`}
                        className="p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="break-words text-sm font-semibold">
                              {batch.medicine_name}
                            </h3>

                            <p className="mt-1 break-words text-xs text-text-secondary">
                              {batch.manufacturer_name}
                            </p>
                          </div>

                          <span
                            className={`shrink-0 rounded-full
                                        px-2.5 py-1 text-xs
                                        font-medium
                                        ${
                                          batch.days_to_expire === 0
                                            ? "bg-danger/10 text-red-300"
                                            : "bg-warning/10 text-warning"
                                        }`}
                          >
                            {expiryLabel(
                              batch.days_to_expire
                            )}
                          </span>
                        </div>

                        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
                          <div className="flex min-w-0 items-center gap-2">
                            <dt className="shrink-0 text-text-secondary">
                              Batch
                            </dt>

                            <dd className="break-all font-medium">
                              {batch.batch_number}
                            </dd>
                          </div>

                          <div className="flex items-center gap-2">
                            <dt className="text-text-secondary">
                              Available units
                            </dt>

                            <dd className="font-semibold tabular-nums">
                              {batch.stock_quantity}
                            </dd>
                          </div>
                        </dl>
                      </li>
                    ))}
                </ul>

                <p className="mt-3 text-xs leading-5 text-text-secondary">
                  Showing{" "}
                  {Math.min(
                    5,
                    expirySummary.batches.length
                  )}{" "}
                  of {expirySummary.batches.length} batches.
                  The summary card counts each medicine once.
                </p>
              </>
            )}
          </ResourceContent>
        </Panel>
      </div>

      {/* Quick navigation */}
      <nav
        aria-label="Dashboard shortcuts"
        className="flex flex-wrap gap-2"
      >
        <Link to="/inventory" className={actionClass}>
          <Icon name="inventory" className="size-4" />
          Available Inventory
        </Link>

        <Link to="/low-stock" className={actionClass}>
          <Icon name="warning" className="size-4" />
          Low Stock
        </Link>

        <Link to="/profile" className={actionClass}>
          My Profile
          <Icon name="arrow" className="size-4" />
        </Link>
      </nav>
    </div>
  );
}