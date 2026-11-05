import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import { CompactTable } from "../../components/CompactInventoryUI";
import SaleDetailsModal from "../../components/sales/SaleDetailsModal";

import useAuth from "../../hooks/useAuth";
import {
  getSales,
  PAYMENT_MODES,
} from "../../services/sales.service";
import {
  getAvailableInventory,
  getLowStock,
} from "../../services/inventory.service";

// ==========================================
// Formatting and configuration
// ==========================================

const DAY_MS = 86_400_000;
const IST_OFFSET = 19_800_000;

const periods = [
  { days: 1, label: "Today" },
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
];

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const calendarFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
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
  { key: "sale_id", label: "Sale ID", sortable: false },
  { key: "customer_name", label: "Customer", sortable: false },
  { key: "pharmacist_name", label: "Pharmacist", sortable: false },
  { key: "payment_mode", label: "Payment", sortable: false },
  { key: "total_amount", label: "Total", sortable: false },
  { key: "created_at", label: "Date · IST", sortable: false },
  { key: "actions", label: "Actions", sortable: false },
];

const paymentColors = {
  Cash: "bg-primary",
  Card: "bg-info",
  UPI: "bg-success",
};

const metricColors = {
  blue: "border-primary/25 bg-primary/10 text-blue-300",
  cyan: "border-info/25 bg-info/10 text-info",
  red: "border-danger/25 bg-danger/10 text-red-300",
  amber: "border-warning/25 bg-warning/10 text-warning",
};

function money(paise) {
  return currencyFormatter.format(paise / 100);
}

function indiaDay(value) {
  return Math.floor(
    (new Date(value).getTime() + IST_OFFSET) / DAY_MS
  );
}

function dayLabel(day) {
  return calendarFormatter.format(new Date(day * DAY_MS));
}

function expiryLabel(days) {
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `In ${days} days`;
}

// ==========================================
// Data calculations
// ==========================================

function buildReport(sales, days, today) {
  const firstDay = today - days + 1;

  const points = Array.from({ length: days }, (_, index) => ({
    day: firstDay + index,
    count: 0,
    paise: 0,
  }));

  const payments = PAYMENT_MODES.map((mode) => ({
    mode,
    count: 0,
    paise: 0,
  }));

  const filtered = sales.filter((sale) => {
    const day = indiaDay(sale.created_at);
    return day >= firstDay && day <= today;
  });

  for (const sale of filtered) {
    const paise = Math.round(sale.total_amount * 100);

    const point =
      points[indiaDay(sale.created_at) - firstDay];

    point.count += 1;
    point.paise += paise;

    const payment = payments.find(
      (item) => item.mode === sale.payment_mode
    );

    if (payment) {
      payment.count += 1;
      payment.paise += paise;
    }
  }

  const recent = [...filtered]
    .sort(
      (first, second) =>
        new Date(second.created_at) -
          new Date(first.created_at) ||
        second.sale_id - first.sale_id
    )
    .slice(0, 5);

  return {
    points,
    payments,
    recent,
    count: filtered.length,
    paise: points.reduce(
      (total, point) => total + point.paise,
      0
    ),
  };
}

function getExpiryAlerts(inventory) {
  return inventory
    .map((medicine) => ({
      ...medicine,
      soon: medicine.batches
        .filter(
          (batch) =>
            batch.days_to_expire >= 0 &&
            batch.days_to_expire <= 10
        )
        .sort(
          (first, second) =>
            first.days_to_expire - second.days_to_expire ||
            Number(first.batch_id) - Number(second.batch_id)
        ),
    }))
    .filter((medicine) => medicine.soon.length > 0)
    .sort(
      (first, second) =>
        first.soon[0].days_to_expire -
          second.soon[0].days_to_expire ||
        first.medicine_name.localeCompare(second.medicine_name)
    );
}

function validateSales(sales) {
  const invalid = sales.some(
    (sale) =>
      !Number.isSafeInteger(sale.sale_id) ||
      sale.sale_id <= 0 ||
      !Number.isFinite(sale.total_amount) ||
      sale.total_amount < 0 ||
      !sale.created_at ||
      !Number.isFinite(new Date(sale.created_at).getTime()) ||
      !PAYMENT_MODES.includes(sale.payment_mode)
  );

  if (invalid) {
    throw new Error(
      "Some sales contain invalid values. Unable to calculate the report."
    );
  }

  return sales;
}

function validateStock(medicines) {
  const invalid = medicines.some(
    (medicine) =>
      !Number.isFinite(medicine.available_stock) ||
      medicine.available_stock < 0 ||
      !Number.isFinite(medicine.reorder_level)
  );

  if (invalid) {
    throw new Error("Unable to read some stock quantities.");
  }

  return medicines;
}

function validateInventory(inventory) {
  const invalid = inventory.some((medicine) =>
    medicine.batches.some(
      (batch) =>
        !Number.isFinite(batch.days_to_expire) ||
        !Number.isFinite(batch.stock_quantity)
    )
  );

  if (invalid) {
    throw new Error("Unable to read some batch expiry details.");
  }

  return inventory;
}

function initialResource() {
  return {
    data: [],
    loading: true,
    error: "",
  };
}

function initialResources() {
  return {
    sales: initialResource(),
    stock: initialResource(),
    inventory: initialResource(),
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

// ==========================================
// Small UI components
// ==========================================

function Icon({ name, className = "size-5" }) {
  const paths = {
    money: [
      "M3 6h18v12H3z",
      "M3 10a4 4 0 0 0 4-4",
      "M17 6a4 4 0 0 0 4 4",
      "M3 14a4 4 0 0 1 4 4",
      "M17 18a4 4 0 0 1 4-4",
      "M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
    ],
    sales: [
      "M6 3h12v18l-3-2-3 2-3-2-3 2V3z",
      "M9 7h6",
      "M9 11h6",
      "M9 15h3",
    ],
    stock: [
      "m12 3 9 5-9 5-9-5 9-5z",
      "M3 8v9l9 5 9-5V8",
      "M12 13v9",
      "m7.5 5.5 9 5",
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
      {(paths[name] || paths.stock).map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  );
}

function MetricCard({
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
                      ${metricColors[tone]}`}
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
  action,
  children,
  className = "",
}) {
  return (
    <section
      className={`min-w-0 rounded-2xl border border-border
                  bg-surface p-4 sm:p-5 ${className}`}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>

          {description && (
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              {description}
            </p>
          )}
        </div>

        {action}
      </div>

      {children}
    </section>
  );
}

function ResourceContent({ resource, children }) {
  if (resource.loading) {
    return (
      <p
        role="status"
        className="py-10 text-center text-sm text-text-secondary"
      >
        Loading...
      </p>
    );
  }

  if (resource.error) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/10 p-4">
        <p role="alert" className="text-sm">
          {resource.error}
        </p>

        <p className="mt-2 text-xs text-text-secondary">
          Use Refresh dashboard to try again.
        </p>
      </div>
    );
  }

  return children;
}

function EmptyMessage({ children }) {
  return (
    <p
      className="rounded-xl border border-dashed border-border
                 px-4 py-8 text-center text-sm leading-6
                 text-text-secondary"
    >
      {children}
    </p>
  );
}

// ==========================================
// Interactive daily sales chart
// ==========================================

function SalesChart({ points }) {
  const [selectedDay, setSelectedDay] = useState(null);

  const selected =
    points.find((point) => point.day === selectedDay) ||
    points[points.length - 1];

  const maximum = Math.max(
    1,
    ...points.map((point) => point.paise)
  );

  const hasSales = points.some((point) => point.count > 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap justify-between gap-2 text-xs text-text-secondary">
        <span>Daily sales amount</span>

        <span>
          Highest:{" "}
          {money(
            Math.max(...points.map((point) => point.paise))
          )}
        </span>
      </div>

      <div className="overflow-x-auto pb-2">
        <div
          role="group"
          aria-label="Select a day to view its sales"
          className="grid items-end gap-1"
          style={{
            gridTemplateColumns: `repeat(${points.length}, minmax(36px, 1fr))`,
            minWidth:
              points.length > 7
                ? `${points.length * 44}px`
                : undefined,
          }}
        >
          {points.map((point) => {
            const active = point.day === selected.day;

            const height =
              point.paise > 0
                ? Math.max(
                    6,
                    Math.round((point.paise / maximum) * 144)
                  )
                : 3;

            return (
              <button
                key={point.day}
                type="button"
                aria-pressed={active}
                aria-label={`${dayLabel(point.day)}: ${
                  point.count
                } sales, ${money(point.paise)}`}
                onClick={() => setSelectedDay(point.day)}
                title={`${dayLabel(point.day)} · ${money(
                  point.paise
                )} · ${point.count} sales`}
                className={`flex h-48 min-w-0 flex-col
                            items-center justify-end rounded-lg
                            px-1 pb-1 transition-colors
                            focus-visible:outline-2
                            focus-visible:outline-primary
                            ${
                              active
                                ? "bg-primary/10"
                                : "hover:bg-surface-hover"
                            }`}
              >
                <span
                  aria-hidden="true"
                  className={`block w-full max-w-14 rounded-t-md
                              transition-colors
                              ${
                                point.paise === 0
                                  ? "bg-border"
                                  : active
                                    ? "bg-primary"
                                    : "bg-primary/60"
                              }`}
                  style={{ height: `${height}px` }}
                />

                <span
                  className={`mt-3 whitespace-nowrap text-[10px]
                              ${
                                active
                                  ? "font-semibold text-text-primary"
                                  : "text-text-secondary"
                              }`}
                >
                  {dayLabel(point.day)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="mt-4 flex flex-wrap items-center justify-between
                   gap-3 rounded-xl border border-border
                   bg-background px-4 py-3"
      >
        <div>
          <p className="text-sm font-medium">
            {dayLabel(selected.day)}
          </p>

          <p className="mt-1 text-xs text-text-secondary">
            {selected.count}{" "}
            {selected.count === 1 ? "sale" : "sales"}
          </p>
        </div>

        <p className="text-lg font-semibold tabular-nums">
          {money(selected.paise)}
        </p>
      </div>

      <p className="mt-3 text-xs leading-5 text-text-secondary">
        {hasSales
          ? "Select a bar to inspect a day. Dates use India time."
          : "No sales in this period. Days without sales are shown as zero."}
      </p>
    </div>
  );
}

// ==========================================
// Payment breakdown
// ==========================================

function PaymentBreakdown({ report }) {
  return (
    <div className="space-y-5">
      {report.payments.map((payment) => {
        const percentage =
          report.paise > 0
            ? (payment.paise / report.paise) * 100
            : 0;

        return (
          <div key={payment.mode}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-full ${
                    paymentColors[payment.mode]
                  }`}
                />

                <span className="text-sm font-medium">
                  {payment.mode}
                </span>
              </div>

              <span className="text-sm font-semibold tabular-nums">
                {money(payment.paise)}
              </span>
            </div>

            <div
              aria-hidden="true"
              className="mt-3 h-2 overflow-hidden rounded-full bg-background"
            >
              <div
                className={`h-full rounded-full ${
                  paymentColors[payment.mode]
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>

            <div className="mt-2 flex justify-between text-xs text-text-secondary">
              <span>
                {payment.count}{" "}
                {payment.count === 1 ? "sale" : "sales"}
              </span>

              <span>{percentage.toFixed(1)}% of amount</span>
            </div>
          </div>
        );
      })}

      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-text-secondary">
            Average sale
          </span>

          <span className="font-semibold tabular-nums">
            {money(
              report.count > 0
                ? Math.round(report.paise / report.count)
                : 0
            )}
          </span>
        </div>

        <p className="mt-3 text-xs leading-5 text-text-secondary">
          Based on recorded payment modes for the selected period.
        </p>
      </div>
    </div>
  );
}

// ==========================================
// Main dashboard
// ==========================================

export default function AdminDashboard() {
  const { user, authenticatedRequest } = useAuth();

  const [days, setDays] = useState(7);
  const [resources, setResources] = useState(initialResources);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedSaleId, setSelectedSaleId] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [lastChecked, setLastChecked] = useState(null);

  const today = indiaDay(now);

  // Keep the reporting day correct when the page stays open.
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

  // Reload on entry, manual refresh, or a new India calendar day.
  useEffect(() => {
    let ignore = false;

    setResources(initialResources());
    setLastChecked(null);

    async function loadDashboard() {
      const [salesResult, stockResult, inventoryResult] =
        await Promise.allSettled([
          getSales(authenticatedRequest).then(validateSales),
          getLowStock(authenticatedRequest).then(validateStock),
          getAvailableInventory(authenticatedRequest).then(
            validateInventory
          ),
        ]);

      if (ignore) return;

      setResources({
        sales: resolveResource(
          salesResult,
          "Unable to load sales."
        ),
        stock: resolveResource(
          stockResult,
          "Unable to load low-stock medicines."
        ),
        inventory: resolveResource(
          inventoryResult,
          "Unable to load expiry information."
        ),
      });

      setLastChecked(new Date());
    }

    loadDashboard();

    return () => {
      ignore = true;
    };
  }, [authenticatedRequest, reloadKey, today]);

  const report = useMemo(
    () => buildReport(resources.sales.data, days, today),
    [resources.sales.data, days, today]
  );

  const expiryAlerts = useMemo(
    () => getExpiryAlerts(resources.inventory.data),
    [resources.inventory.data]
  );

  const lowStockAlerts = useMemo(
    () =>
      [...resources.stock.data].sort(
        (first, second) =>
          first.available_stock - second.available_stock ||
          first.medicine_name.localeCompare(
            second.medicine_name
          )
      ),
    [resources.stock.data]
  );

  const outOfStock = lowStockAlerts.filter(
    (medicine) => medicine.available_stock === 0
  ).length;

  const loading =
    resources.sales.loading ||
    resources.stock.loading ||
    resources.inventory.loading;

  const periodLabel =
    periods.find((period) => period.days === days)?.label ||
    "Selected period";

  const rangeLabel =
    days === 1
      ? dayLabel(today)
      : `${dayLabel(today - days + 1)} – ${dayLabel(today)}`;

  function refreshDashboard() {
    if (loading) return;

    setSelectedSaleId(null);
    setResources(initialResources());
    setReloadKey((previous) => previous + 1);
  }

  function changePeriod(nextDays) {
    setSelectedSaleId(null);
    setDays(nextDays);
  }

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      {/* Header and reporting period */}
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">
            Pharmacy overview
          </p>

          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Dashboard
          </h1>

          <p className="mt-2 break-words text-sm text-text-secondary">
            Welcome back, {user.name}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <fieldset className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1">
            <legend className="sr-only">
              Sales reporting period
            </legend>

            {periods.map((period) => (
              <button
                key={period.days}
                type="button"
                aria-pressed={days === period.days}
                onClick={() => changePeriod(period.days)}
                className={`min-h-11 rounded-lg px-3 py-2
                            text-sm font-medium transition-colors
                            focus-visible:outline-2
                            focus-visible:outline-primary
                            ${
                              days === period.days
                                ? "bg-primary text-white"
                                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                            }`}
              >
                {period.label}
              </button>
            ))}
          </fieldset>

          <button
            type="button"
            onClick={refreshDashboard}
            disabled={loading}
            aria-label="Refresh dashboard"
            title="Refresh dashboard"
            className={actionClass}
          >
            <Icon
              name="refresh"
              className={`size-5 ${
                loading ? "motion-safe:animate-spin" : ""
              }`}
            />
            <span className="sr-only sm:not-sr-only">
              Refresh
            </span>
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary">
        <p>
          Sales: {rangeLabel} · India time
        </p>

        <p>
          {loading
            ? "Updating dashboard..."
            : lastChecked
              ? `Last checked ${timeFormatter.format(
                  lastChecked
                )} IST · Refresh for latest data`
              : "Refresh to load the latest data"}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Sales amount"
          value={money(report.paise)}
          description={`${periodLabel} · Recorded sales total`}
          icon="money"
          tone="blue"
          resource={resources.sales}
        />

        <MetricCard
          label="Completed sales"
          value={report.count}
          description={`${periodLabel} · Includes walk-in sales`}
          icon="sales"
          tone="cyan"
          resource={resources.sales}
        />

        <MetricCard
          label="Low-stock medicines"
          value={lowStockAlerts.length}
          description={
            resources.stock.loading || resources.stock.error
              ? "Current stock · At or below reorder level"
              : `Current stock · ${outOfStock} out of stock`
          }
          icon="stock"
          tone={outOfStock > 0 ? "red" : "amber"}
          resource={resources.stock}
        />

        <MetricCard
          label="Medicines nearing expiry"
          value={expiryAlerts.length}
          description="Current stock · Batches expiring within 10 days"
          icon="clock"
          tone="amber"
          resource={resources.inventory}
        />
      </div>

      {/* Sales analytics */}
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Panel
          title="Sales trend"
          description={`${periodLabel} · ${rangeLabel}`}
          className="lg:col-span-2"
          action={
            <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-blue-300">
              Daily amount
            </span>
          }
        >
          <ResourceContent resource={resources.sales}>
            <SalesChart
              key={`${days}-${today}`}
              points={report.points}
            />
          </ResourceContent>
        </Panel>

        <Panel
          title="Payment breakdown"
          description={`${periodLabel} · Share of sales amount`}
        >
          <ResourceContent resource={resources.sales}>
            <PaymentBreakdown report={report} />
          </ResourceContent>
        </Panel>
      </div>

      {/* Current inventory alerts */}
      <Panel
        title="Stock attention"
        description="Current stock alerts, independent of the sales period."
        action={
          <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-text-secondary">
            Current stock
          </span>
        }
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">
                Low stock and out of stock
              </h3>

              <Link
                to="/low-stock"
                className="inline-flex min-h-11 shrink-0 items-center
                           gap-1 rounded-lg px-2 text-xs font-medium
                           text-blue-300 hover:bg-surface-hover
                           focus-visible:outline-2
                           focus-visible:outline-primary"
              >
                View all
                <Icon name="arrow" className="size-4" />
              </Link>
            </div>

            <ResourceContent resource={resources.stock}>
              {lowStockAlerts.length === 0 ? (
                <EmptyMessage>
                  No medicines are currently at or below their
                  reorder level.
                </EmptyMessage>
              ) : (
                <>
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {lowStockAlerts.slice(0, 4).map((medicine) => {
                      const empty =
                        medicine.available_stock === 0;

                      return (
                        <li
                          key={medicine.medicine_id}
                          className="flex flex-wrap items-center
                                     justify-between gap-3 p-4"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-medium">
                              {medicine.medicine_name}
                            </p>

                            <p className="mt-1 break-words text-xs text-text-secondary">
                              {medicine.manufacturer_name}
                            </p>

                            <p className="mt-2 text-xs text-text-secondary">
                              Available:{" "}
                              <span className="font-medium text-text-primary">
                                {medicine.available_stock}
                              </span>
                              {" · "}Reorder level:{" "}
                              {medicine.reorder_level}
                            </p>
                          </div>

                          <span
                            className={`shrink-0 rounded-full
                                        px-2.5 py-1 text-xs font-medium
                                        ${
                                          empty
                                            ? "bg-danger/10 text-red-300"
                                            : "bg-warning/10 text-warning"
                                        }`}
                          >
                            {empty ? "Out of stock" : "Low stock"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <p className="mt-3 text-xs text-text-secondary">
                    Showing {Math.min(4, lowStockAlerts.length)}{" "}
                    of {lowStockAlerts.length} medicines.
                    Out-of-stock items appear first.
                  </p>
                </>
              )}
            </ResourceContent>
          </div>

          <div className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">
                Expiring within 10 days
              </h3>

              <Link
                to="/inventory"
                className="inline-flex min-h-11 shrink-0 items-center
                           gap-1 rounded-lg px-2 text-xs font-medium
                           text-blue-300 hover:bg-surface-hover
                           focus-visible:outline-2
                           focus-visible:outline-primary"
              >
                Inventory
                <Icon name="arrow" className="size-4" />
              </Link>
            </div>

            <ResourceContent resource={resources.inventory}>
              {expiryAlerts.length === 0 ? (
                <EmptyMessage>
                  No available batches are expiring within the
                  next 10 days.
                </EmptyMessage>
              ) : (
                <>
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {expiryAlerts.slice(0, 4).map((medicine) => {
                      const batch = medicine.soon[0];
                      const otherBatches =
                        medicine.soon.length - 1;

                      return (
                        <li
                          key={medicine.medicine_id}
                          className="flex flex-wrap items-center
                                     justify-between gap-3 p-4"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-medium">
                              {medicine.medicine_name}
                            </p>

                            <p className="mt-1 break-words text-xs text-text-secondary">
                              Batch {batch.batch_number}
                              {" · "}
                              {batch.stock_quantity} units
                            </p>

                            <p className="mt-2 text-xs text-text-secondary">
                              {otherBatches > 0
                                ? `+${otherBatches} other ${
                                    otherBatches === 1
                                      ? "batch"
                                      : "batches"
                                  } nearing expiry`
                                : medicine.manufacturer_name}
                            </p>
                          </div>

                          <span
                            className={`shrink-0 rounded-full px-2.5
                                        py-1 text-xs font-medium
                                        ${
                                          batch.days_to_expire === 0
                                            ? "bg-danger/10 text-red-300"
                                            : "bg-warning/10 text-warning"
                                        }`}
                          >
                            {expiryLabel(batch.days_to_expire)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <p className="mt-3 text-xs text-text-secondary">
                    Showing {Math.min(4, expiryAlerts.length)}{" "}
                    of {expiryAlerts.length} medicines.
                    Each medicine is counted once.
                  </p>
                </>
              )}
            </ResourceContent>
          </div>
        </div>
      </Panel>

      {/* Recent sales within the selected period */}
      <section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Recent activity</h2>

            <p className="mt-1 text-xs text-text-secondary">
              Latest five sales within {rangeLabel}.
            </p>
          </div>

          <Link to="/sales" className={actionClass}>
            Sales history
            <Icon name="arrow" className="size-4" />
          </Link>
        </div>

        <CompactTable
          title="Recent sales"
          noun="sales"
          columns={columns}
          sort={{ key: "created_at", direction: "desc" }}
          onReload={refreshDashboard}
          reloadDisabled={loading}
          loading={resources.sales.loading}
          error={resources.sales.error}
          total={report.count}
          count={report.recent.length}
          hasFilters={false}
          emptyMessage="No sales were recorded in this period. Select another period or refresh after a new sale."
          minWidth="min-w-[1000px]"
        >
          {report.recent.map((sale) => (
            <tr
              key={sale.sale_id}
              className="hover:bg-surface-hover/50"
            >
              <td className="px-4 py-4 font-semibold tabular-nums">
                #{sale.sale_id}
              </td>

              <td className="max-w-48 break-words px-4 py-4">
                {sale.customer_name}
              </td>

              <td className="max-w-48 break-words px-4 py-4">
                {sale.pharmacist_name}
              </td>

              <td className="px-4 py-4">
                <span className="inline-flex items-center gap-2 rounded-full bg-background px-3 py-1 text-xs font-medium">
                  <span
                    aria-hidden="true"
                    className={`size-1.5 rounded-full ${
                      paymentColors[sale.payment_mode]
                    }`}
                  />
                  {sale.payment_mode}
                </span>
              </td>

              <td className="whitespace-nowrap px-4 py-4 font-semibold tabular-nums">
                {money(Math.round(sale.total_amount * 100))}
              </td>

              <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                {dateTimeFormatter.format(
                  new Date(sale.created_at)
                )}
              </td>

              <td className="px-4 py-4">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={`View details for sale ${sale.sale_id}`}
                  onClick={() => setSelectedSaleId(sale.sale_id)}
                  className={`${actionClass} whitespace-nowrap`}
                >
                  View details
                </button>
              </td>
            </tr>
          ))}
        </CompactTable>
      </section>

      {/* Quick navigation */}
      <nav
        aria-label="Dashboard shortcuts"
        className="flex flex-wrap gap-2"
      >
        <Link to="/users" className={actionClass}>
          Manage users
        </Link>

        <Link to="/inventory" className={actionClass}>
          Available inventory
        </Link>

        <Link to="/batches" className={actionClass}>
          Manage batches
        </Link>

        <Link to="/profile" className={actionClass}>
          My profile
        </Link>
      </nav>

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