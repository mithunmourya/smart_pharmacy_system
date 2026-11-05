
import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
} from "vitest";

import {
  render,
  screen,
  within,
  waitFor,
  act,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

import AdminDashboard from "./AdminDashboard";
import useAuth from "../../hooks/useAuth";

import {
  getSales,
} from "../../services/sales.service";

import {
  getAvailableInventory,
  getLowStock,
} from "../../services/inventory.service";

// ============================================
// MOCK DEPENDENCIES
// ============================================

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

vi.mock("../../services/sales.service", () => ({
  getSales: vi.fn(),
  PAYMENT_MODES: ["Cash", "Card", "UPI"],
}));

vi.mock("../../services/inventory.service", () => ({
  getAvailableInventory: vi.fn(),
  getLowStock: vi.fn(),
}));

// Keep the actual AdminDashboard logic.
// Replace only the shared table presentation.

vi.mock("../../components/CompactInventoryUI", () => ({
  CompactTable: ({
    title,
    columns,
    children,
    loading,
    error,
    count,
    emptyMessage,
    onReload,
    reloadDisabled,
  }) => (
    <section aria-label={title}>
      <button
        type="button"
        onClick={onReload}
        disabled={reloadDisabled}
      >
        Reload recent sales
      </button>

      {loading ? (
        <p>Loading recent sales...</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          <p>{count} recent rows</p>

          {count === 0 ? (
            <p>{emptyMessage}</p>
          ) : (
            <table aria-label={title}>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>{children}</tbody>
            </table>
          )}
        </>
      )}
    </section>
  ),
}));

// SaleDetailsModal is tested separately.

vi.mock("../../components/sales/SaleDetailsModal", () => ({
  default: ({
    saleId,
    audience,
    onClose,
  }) => (
    <section
      role="dialog"
      aria-label="Sale details"
    >
      <p>Selected sale: {saleId}</p>
      <p>Audience: {audience}</p>

      <button
        type="button"
        onClick={onClose}
      >
        Close sale details
      </button>
    </section>
  ),
}));

// ============================================
// TEST DATE HELPERS
// ============================================

// AdminDashboard calculates dates using IST.
// Creating sales relative to IST makes the
// tests independent of a hard-coded date.

const DAY_MS = 86_400_000;
const IST_OFFSET = 19_800_000;

function saleDate(daysAgo = 0, hour = 12) {
  const today = Math.floor(
    (Date.now() + IST_OFFSET) / DAY_MS
  );

  const timestamp =
    (today - daysAgo) * DAY_MS -
    IST_OFFSET +
    hour * 60 * 60 * 1000;

  return new Date(timestamp).toISOString();
}

// ============================================
// TEST SALES DATA
// ============================================

function makeSales() {
  return [
    {
      sale_id: 103,
      customer_name: "Neha Jain",
      pharmacist_name: "Pharmacist A",
      payment_mode: "Card",
      total_amount: 75.25,
      created_at: saleDate(1, 15),
    },
    {
      sale_id: 101,
      customer_name: "Ravi Kumar",
      pharmacist_name: "Pharmacist A",
      payment_mode: "Cash",
      total_amount: 202.10,
      created_at: saleDate(0, 13),
    },
    {
      sale_id: 105,
      customer_name: "Anita Patel",
      pharmacist_name: "Pharmacist B",
      payment_mode: "UPI",
      total_amount: 40,
      created_at: saleDate(6, 10),
    },
    {
      sale_id: 104,
      customer_name: "Walk-in customer",
      pharmacist_name: "Pharmacist B",
      payment_mode: "Cash",
      total_amount: 50,
      created_at: saleDate(3, 12),
    },
    {
      sale_id: 102,
      customer_name: "Bob",
      pharmacist_name: "Pharmacist A",
      payment_mode: "UPI",
      total_amount: 98.90,
      created_at: saleDate(0, 16),
    },
    {
      sale_id: 106,
      customer_name: "Older Customer",
      pharmacist_name: "Pharmacist A",
      payment_mode: "Cash",
      total_amount: 30,
      created_at: saleDate(7),
    },
    {
      sale_id: 107,
      customer_name: "Customer Seven",
      pharmacist_name: "Pharmacist B",
      payment_mode: "Card",
      total_amount: 120,
      created_at: saleDate(20),
    },
    {
      sale_id: 108,
      customer_name: "Customer Eight",
      pharmacist_name: "Pharmacist B",
      payment_mode: "Cash",
      total_amount: 35,
      created_at: saleDate(29),
    },
    {
      sale_id: 109,
      customer_name: "Very Old Customer",
      pharmacist_name: "Pharmacist A",
      payment_mode: "UPI",
      total_amount: 500,
      created_at: saleDate(30),
    },
  ];
}

// Expected totals:
// Today: 301.00, 2 sales
// Last 7 days: 466.25, 5 sales
// Last 30 days: 651.25, 8 sales

// ============================================
// TEST LOW-STOCK DATA
// ============================================

const lowStock = [
  {
    medicine_id: 1,
    medicine_name: "Saline",
    manufacturer_name: "Care Labs",
    available_stock: 4,
    reorder_level: 10,
  },
  {
    medicine_id: 2,
    medicine_name: "Insulin",
    manufacturer_name: "Bio Labs",
    available_stock: 0,
    reorder_level: 7,
  },
  {
    medicine_id: 3,
    medicine_name: "Gauze",
    manufacturer_name: "Med Supplies",
    available_stock: 2,
    reorder_level: 8,
  },
];

// ============================================
// TEST INVENTORY DATA
// ============================================

const inventory = [
  {
    medicine_id: 10,
    medicine_name: "Paracetamol",
    manufacturer_name: "ABC Pharma",
    available_stock: 60,
    batches: [
      {
        batch_id: 11,
        batch_number: "P-8",
        stock_quantity: 8,
        days_to_expire: 8,
      },
      {
        batch_id: 12,
        batch_number: "P-0",
        stock_quantity: 12,
        days_to_expire: 0,
      },
      {
        batch_id: 13,
        batch_number: "P-OLD",
        stock_quantity: 3,
        days_to_expire: -2,
      },
      {
        batch_id: 14,
        batch_number: "P-1",
        stock_quantity: 12,
        days_to_expire: 1,
      },
    ],
  },
  {
    medicine_id: 11,
    medicine_name: "Cetirizine",
    manufacturer_name: "Care Labs",
    available_stock: 20,
    batches: [
      {
        batch_id: 21,
        batch_number: "C-1",
        stock_quantity: 20,
        days_to_expire: 1,
      },
    ],
  },
  {
    medicine_id: 12,
    medicine_name: "Aspirin",
    manufacturer_name: "ABC Pharma",
    available_stock: 15,
    batches: [
      {
        batch_id: 31,
        batch_number: "A-10",
        stock_quantity: 15,
        days_to_expire: 10,
      },
    ],
  },
  {
    medicine_id: 13,
    medicine_name: "Vitamin C",
    manufacturer_name: "Nature Health",
    available_stock: 25,
    batches: [
      {
        batch_id: 41,
        batch_number: "V-30",
        stock_quantity: 25,
        days_to_expire: 30,
      },
    ],
  },
];

// ============================================
// AUTHENTICATION DATA
// ============================================

const adminUser = {
  user_id: 1,
  name: "Admin User",
  email: "admin@example.com",
  role: "Admin",
};

const mockRequest = vi.fn();

// ============================================
// TEST HELPERS
// ============================================

function renderDashboard() {
  return render(
    <MemoryRouter>
      <AdminDashboard />
    </MemoryRouter>
  );
}

async function renderReady() {
  const result = renderDashboard();

  await screen.findByText(/^Last checked /);

  return result;
}

function metric(label) {
  return screen
    .getByRole("heading", { name: label })
    .closest("section");
}

function panel(label) {
  return screen
    .getByRole("heading", { name: label })
    .closest("section");
}

function stockAlerts() {
  return screen
    .getByRole("heading", {
      name: "Low stock and out of stock",
    })
    .closest(".min-w-0");
}

function expiryAlerts() {
  return screen
    .getByRole("heading", {
      name: "Expiring within 10 days",
    })
    .closest(".min-w-0");
}

function periodButton(label) {
  return screen.getByRole("button", {
    name: label,
  });
}

function refreshButton() {
  return screen.getByRole("button", {
    name: "Refresh dashboard",
  });
}

function chart() {
  return screen.getByRole("group", {
    name: "Select a day to view its sales",
  });
}

function chartButtons() {
  return within(chart()).getAllByRole("button");
}

function recentTable() {
  return screen.getByRole("table", {
    name: "Recent sales",
  });
}

function recentRows() {
  return within(recentTable())
    .getAllByRole("row")
    .slice(1);
}

function recentSaleIds() {
  return recentRows().map((row) =>
    row.cells[0].textContent.trim()
  );
}

function deferred() {
  let resolve;
  let reject;

  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function hasAlert(message) {
  return screen.getAllByRole("alert").some(
    (alert) =>
      alert.textContent.includes(message)
  );
}

// ============================================
// ADMIN DASHBOARD TESTS
// ============================================

describe("AdminDashboard", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    useAuth.mockReturnValue({
      user: adminUser,
      authenticatedRequest: mockRequest,
    });

    getSales.mockResolvedValue(makeSales());
    getLowStock.mockResolvedValue(lowStock);
    getAvailableInventory.mockResolvedValue(inventory);
  });

  // ==========================================
  // 1. PAGE RENDER
  // ==========================================

  test("renders dashboard heading and admin welcome", async () => {
    await renderReady();

    expect(
      screen.getByRole("heading", {
        name: "Dashboard",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Welcome back, Admin User."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByText("Pharmacy overview")
    ).toBeInTheDocument();
  });

  // ==========================================
  // 2. FETCH ALL THREE RESOURCES
  // ==========================================

  test("loads sales, low stock and inventory", async () => {
    await renderReady();

    expect(getSales).toHaveBeenCalledWith(
      mockRequest
    );

    expect(getLowStock).toHaveBeenCalledWith(
      mockRequest
    );

    expect(
      getAvailableInventory
    ).toHaveBeenCalledWith(mockRequest);

    expect(getSales).toHaveBeenCalledTimes(1);
    expect(getLowStock).toHaveBeenCalledTimes(1);

    expect(
      getAvailableInventory
    ).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 3. INITIAL LOADING
  // ==========================================

  test("shows loading state until all resources settle", async () => {
    const pending = deferred();

    getSales.mockReturnValue(pending.promise);

    renderDashboard();

    expect(
      metric("Sales amount")
    ).toHaveTextContent("Loading...");

    expect(
      metric("Completed sales")
    ).toHaveTextContent("Loading...");

    expect(
      metric("Low-stock medicines")
    ).toHaveTextContent("Loading...");

    expect(
      metric("Medicines nearing expiry")
    ).toHaveTextContent("Loading...");

    expect(refreshButton()).toBeDisabled();

    await act(async () => {
      pending.resolve(makeSales());
    });

    expect(
      metric("Sales amount")
    ).toHaveTextContent("₹466.25");

    expect(refreshButton()).toBeEnabled();
  });

  // ==========================================
  // 4. DEFAULT SALES PERIOD
  // ==========================================

  test("defaults to Last 7 days", async () => {
    await renderReady();

    expect(
      periodButton("Last 7 days")
    ).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    expect(
      periodButton("Today")
    ).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    expect(
      periodButton("Last 30 days")
    ).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  // ==========================================
  // 5. SEVEN-DAY REPORT
  // ==========================================

  test("calculates sales amount and count for last 7 days", async () => {
    await renderReady();

    expect(
      metric("Sales amount")
    ).toHaveTextContent("₹466.25");

    expect(
      metric("Completed sales")
    ).toHaveTextContent("5");

    expect(
      metric("Sales amount")
    ).toHaveTextContent("Last 7 days");
  });

  // ==========================================
  // 6. TODAY REPORT
  // ==========================================

  test("calculates today's sales correctly", async () => {
    const user = userEvent.setup();

    await renderReady();

    await user.click(periodButton("Today"));

    expect(
      metric("Sales amount")
    ).toHaveTextContent("₹301.00");

    expect(
      metric("Completed sales")
    ).toHaveTextContent("2");

    expect(
      periodButton("Today")
    ).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  // ==========================================
  // 7. THIRTY-DAY REPORT
  // ==========================================

  test("calculates last 30 days sales correctly", async () => {
    const user = userEvent.setup();

    await renderReady();

    await user.click(
      periodButton("Last 30 days")
    );

    expect(
      metric("Sales amount")
    ).toHaveTextContent("₹651.25");

    expect(
      metric("Completed sales")
    ).toHaveTextContent("8");

    expect(
      periodButton("Last 30 days")
    ).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  // ==========================================
  // 8. FILTER LOCALLY
  // ==========================================

  test("changing reporting period does not refetch API data", async () => {
    const user = userEvent.setup();

    await renderReady();

    await user.click(periodButton("Today"));

    await user.click(
      periodButton("Last 30 days")
    );

    await user.click(
      periodButton("Last 7 days")
    );

    expect(getSales).toHaveBeenCalledTimes(1);
    expect(getLowStock).toHaveBeenCalledTimes(1);

    expect(
      getAvailableInventory
    ).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 9. SEVEN-DAY SALES CHART
  // ==========================================

  test("renders seven daily chart bars by default", async () => {
    await renderReady();

    expect(chartButtons()).toHaveLength(7);

    expect(
      chartButtons()[6]
    ).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  // ==========================================
  // 10. TODAY CHART
  // ==========================================

  test("renders one daily chart bar for Today", async () => {
    const user = userEvent.setup();

    await renderReady();

    await user.click(periodButton("Today"));

    expect(chartButtons()).toHaveLength(1);

    expect(chartButtons()[0]).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  // ==========================================
  // 11. THIRTY-DAY CHART
  // ==========================================

  test("renders thirty chart bars for Last 30 days", async () => {
    const user = userEvent.setup();

    await renderReady();

    await user.click(
      periodButton("Last 30 days")
    );

    expect(chartButtons()).toHaveLength(30);
  });

  // ==========================================
  // 12. INTERACTIVE SALES CHART
  // ==========================================

  test("selects a day to inspect its sales", async () => {
    const user = userEvent.setup();

    await renderReady();

    const buttons = chartButtons();

    // The second-to-last day is yesterday.
    await user.click(buttons[5]);

    expect(buttons[5]).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    expect(buttons[6]).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    const chartStatus = within(
      panel("Sales trend")
    ).getByRole("status");

    expect(chartStatus).toHaveTextContent(
      "1 sale"
    );

    expect(chartStatus).toHaveTextContent(
      "₹75.25"
    );
  });

  // ==========================================
  // 13. CHART RESET ON PERIOD CHANGE
  // ==========================================

  test("resets selected chart day when period changes", async () => {
    const user = userEvent.setup();

    await renderReady();

    await user.click(chartButtons()[5]);

    await user.click(periodButton("Today"));

    expect(chartButtons()).toHaveLength(1);

    expect(
      chartButtons()[0]
    ).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    expect(
      within(panel("Sales trend"))
        .getByRole("status")
    ).toHaveTextContent("₹301.00");
  });

  // ==========================================
  // 14. PAYMENT BREAKDOWN
  // ==========================================

  test("calculates payment totals by payment mode", async () => {
    await renderReady();

    const payment = panel("Payment breakdown");

    expect(payment).toHaveTextContent("Cash");
    expect(payment).toHaveTextContent("Card");
    expect(payment).toHaveTextContent("UPI");

    expect(payment).toHaveTextContent(
      "₹252.10"
    );

    expect(payment).toHaveTextContent(
      "₹75.25"
    );

    expect(payment).toHaveTextContent(
      "₹138.90"
    );
  });

  // ==========================================
  // 15. PAYMENT PERCENTAGES
  // ==========================================

  test("calculates percentage of sales amount by payment mode", async () => {
    await renderReady();

    const payment = panel("Payment breakdown");

    expect(payment).toHaveTextContent(
      "54.1% of amount"
    );

    expect(payment).toHaveTextContent(
      "16.1% of amount"
    );

    expect(payment).toHaveTextContent(
      "29.8% of amount"
    );
  });

  // ==========================================
  // 16. AVERAGE SALE
  // ==========================================

  test("calculates average sale amount", async () => {
    await renderReady();

    const payment = panel("Payment breakdown");

    expect(payment).toHaveTextContent(
      "Average sale"
    );

    expect(payment).toHaveTextContent(
      "₹93.25"
    );
  });

  // ==========================================
  // 17. RECENT SALES
  // ==========================================

  test("shows latest five sales in descending date order", async () => {
    await renderReady();

    expect(recentSaleIds()).toEqual([
      "#102",
      "#101",
      "#103",
      "#104",
      "#105",
    ]);

    expect(
      within(recentTable())
        .getByText("Walk-in customer")
    ).toBeInTheDocument();
  });

  // ==========================================
  // 18. RECENT SALES VALUES
  // ==========================================

  test("displays customer, pharmacist and payment details", async () => {
    await renderReady();

    const rows = recentRows();

    expect(rows).toHaveLength(5);

    expect(rows[0]).toHaveTextContent(
      "Bob"
    );

    expect(rows[0]).toHaveTextContent(
      "Pharmacist A"
    );

    expect(rows[0]).toHaveTextContent(
      "UPI"
    );

    expect(rows[0]).toHaveTextContent(
      "₹98.90"
    );
  });

  // ==========================================
  // 19. OPEN SALE DETAILS
  // ==========================================

  test("opens sale details with admin audience", async () => {
    const user = userEvent.setup();

    await renderReady();

    await user.click(
      screen.getByRole("button", {
        name: "View details for sale 102",
      })
    );

    const dialog = screen.getByRole("dialog", {
      name: "Sale details",
    });

    expect(dialog).toHaveTextContent(
      "Selected sale: 102"
    );

    expect(dialog).toHaveTextContent(
      "Audience: admin"
    );
  });

  // ==========================================
  // 20. CLOSE SALE DETAILS
  // ==========================================

  test("closes selected sale details", async () => {
    const user = userEvent.setup();

    await renderReady();

    await user.click(
      screen.getByRole("button", {
        name: "View details for sale 102",
      })
    );

    await user.click(
      screen.getByRole("button", {
        name: "Close sale details",
      })
    );

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();
  });

  // ==========================================
  // 21. PERIOD CHANGE CLOSES DETAILS
  // ==========================================

  test("closes sale details when reporting period changes", async () => {
    const user = userEvent.setup();

    await renderReady();

    await user.click(
      screen.getByRole("button", {
        name: "View details for sale 102",
      })
    );

    await user.click(periodButton("Today"));

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    expect(
      metric("Completed sales")
    ).toHaveTextContent("2");
  });

  // ==========================================
  // 22. EMPTY SALES
  // ==========================================

  test("shows zero sales and empty activity when no sales exist", async () => {
    getSales.mockResolvedValue([]);

    await renderReady();

    expect(
      metric("Sales amount")
    ).toHaveTextContent("₹0.00");

    expect(
      metric("Completed sales")
    ).toHaveTextContent("0");

    expect(
      screen.getByText(
        /No sales were recorded in this period/
      )
    ).toBeInTheDocument();

    expect(
      within(panel("Sales trend")).getByText(
        /No sales in this period/
      )
    ).toBeInTheDocument();
  });

  // ==========================================
  // 23. ZERO SALES PAYMENT AMOUNT
  // ==========================================

  test("handles zero payment totals without invalid percentages", async () => {
    getSales.mockResolvedValue([]);

    await renderReady();

    const payment = panel("Payment breakdown");

    expect(
      within(payment).getAllByText("0.0% of amount")
    ).toHaveLength(3);

    expect(payment).toHaveTextContent(
      "₹0.00"
    );

    expect(payment).not.toHaveTextContent(
      "NaN"
    );
  });

  // ==========================================
  // 24. LOW-STOCK SUMMARY
  // ==========================================

  test("calculates low-stock and out-of-stock counts", async () => {
    await renderReady();

    expect(
      metric("Low-stock medicines")
    ).toHaveTextContent("3");

    expect(
      metric("Low-stock medicines")
    ).toHaveTextContent(
      "1 out of stock"
    );
  });

  // ==========================================
  // 25. LOW-STOCK ORDERING
  // ==========================================

  test("shows out-of-stock medicines first", async () => {
    await renderReady();

    const alerts = stockAlerts();

    const names = within(alerts)
      .getAllByRole("listitem")
      .map((item) =>
        item.querySelector("p").textContent.trim()
      );

    expect(names).toEqual([
      "Insulin",
      "Gauze",
      "Saline",
    ]);

    expect(alerts).toHaveTextContent(
      "Out of stock"
    );

    expect(alerts).toHaveTextContent(
      "Reorder level:"
    );
  });

  // ==========================================
  // 26. LOW-STOCK DISPLAY LIMIT
  // ==========================================

  test("shows only four low-stock medicines in alert preview", async () => {
    getLowStock.mockResolvedValue([
      ...lowStock,
      {
        medicine_id: 4,
        medicine_name: "Vitamin A",
        manufacturer_name: "Nature Health",
        available_stock: 9,
        reorder_level: 12,
      },
      {
        medicine_id: 5,
        medicine_name: "Zinc",
        manufacturer_name: "Nature Health",
        available_stock: 10,
        reorder_level: 12,
      },
    ]);

    await renderReady();

    const alerts = stockAlerts();

    expect(
      within(alerts).getAllByRole("listitem")
    ).toHaveLength(4);

    expect(alerts).toHaveTextContent(
      /Showing\s*4\s*of\s*5\s*medicines/
    );

    expect(alerts).not.toHaveTextContent(
      "Zinc"
    );
  });

  // ==========================================
  // 27. EXPIRY SUMMARY
  // ==========================================

  test("counts medicines nearing expiry once each", async () => {
    await renderReady();

    // Paracetamol has three expiring batches,
    // but should count as one medicine.
    expect(
      metric("Medicines nearing expiry")
    ).toHaveTextContent("3");
  });

  // ==========================================
  // 28. EXPIRY ALERT ORDER
  // ==========================================

  test("orders expiry alerts by earliest expiry", async () => {
    await renderReady();

    const alerts = expiryAlerts();

    const names = within(alerts)
      .getAllByRole("listitem")
      .map((item) =>
        item.querySelector("p").textContent.trim()
      );

    expect(names).toEqual([
      "Paracetamol",
      "Cetirizine",
      "Aspirin",
    ]);

    expect(alerts).toHaveTextContent(
      "Expires today"
    );

    expect(alerts).toHaveTextContent(
      "Expires tomorrow"
    );

    expect(alerts).toHaveTextContent(
      "In 10 days"
    );
  });

  // ==========================================
  // 29. MULTIPLE EXPIRING BATCHES
  // ==========================================

  test("shows earliest batch and counts other expiring batches", async () => {
    await renderReady();

    const alerts = expiryAlerts();

    expect(alerts).toHaveTextContent(
      "Batch P-0"
    );

    expect(alerts).toHaveTextContent(
      "+2 other batches nearing expiry"
    );

    // Expired batch should not be included.
    expect(alerts).not.toHaveTextContent(
      "P-OLD"
    );

    // Batch expiring after 10 days excluded.
    expect(alerts).not.toHaveTextContent(
      "V-30"
    );
  });

  // ==========================================
  // 30. EXPIRY PREVIEW LIMIT
  // ==========================================

  test("shows at most four medicines in expiry preview", async () => {
    getAvailableInventory.mockResolvedValue([
      ...inventory,
      {
        medicine_id: 14,
        medicine_name: "Iron",
        manufacturer_name: "Care Labs",
        available_stock: 5,
        batches: [
          {
            batch_id: 51,
            batch_number: "I-2",
            stock_quantity: 5,
            days_to_expire: 2,
          },
        ],
      },
      {
        medicine_id: 15,
        medicine_name: "Vitamin B",
        manufacturer_name: "Care Labs",
        available_stock: 5,
        batches: [
          {
            batch_id: 61,
            batch_number: "B-5",
            stock_quantity: 5,
            days_to_expire: 5,
          },
        ],
      },
    ]);

    await renderReady();

    const alerts = expiryAlerts();

    expect(
      within(alerts).getAllByRole("listitem")
    ).toHaveLength(4);

    expect(alerts).toHaveTextContent(
      /Showing\s*4\s*of\s*5\s*medicines/
    );

    expect(alerts).not.toHaveTextContent(
      "Aspirin"
    );
  });

  // ==========================================
  // 31. EMPTY LOW STOCK
  // ==========================================

  test("shows empty state when there are no low-stock medicines", async () => {
    getLowStock.mockResolvedValue([]);

    await renderReady();

    expect(
      metric("Low-stock medicines")
    ).toHaveTextContent("0");

    expect(stockAlerts()).toHaveTextContent(
      /No medicines are currently at or below their/
    );
  });

  // ==========================================
  // 32. EMPTY EXPIRY ALERTS
  // ==========================================

  test("shows empty state when no batches are expiring soon", async () => {
    getAvailableInventory.mockResolvedValue([
      inventory[3],
    ]);

    await renderReady();

    expect(
      metric("Medicines nearing expiry")
    ).toHaveTextContent("0");

    expect(expiryAlerts()).toHaveTextContent(
      /No available batches are expiring within the/
    );
  });

  // ==========================================
  // 33. ALL DATA EMPTY
  // ==========================================

  test("handles all resources returning empty arrays", async () => {
    getSales.mockResolvedValue([]);
    getLowStock.mockResolvedValue([]);
    getAvailableInventory.mockResolvedValue([]);

    await renderReady();

    expect(metric("Sales amount"))
      .toHaveTextContent("₹0.00");

    expect(metric("Completed sales"))
      .toHaveTextContent("0");

    expect(metric("Low-stock medicines"))
      .toHaveTextContent("0");

    expect(metric("Medicines nearing expiry"))
      .toHaveTextContent("0");
  });

  // ==========================================
  // 34. SALES API FAILURE
  // ==========================================

  test("handles sales failure independently of stock data", async () => {
    getSales.mockRejectedValue(
      new Error("Sales API unavailable")
    );

    await renderReady();

    expect(
      metric("Sales amount")
    ).toHaveTextContent("Unavailable");

    expect(
      metric("Completed sales")
    ).toHaveTextContent("Unavailable");

    expect(
      hasAlert("Sales API unavailable")
    ).toBe(true);

    expect(
      metric("Low-stock medicines")
    ).toHaveTextContent("3");

    expect(
      metric("Medicines nearing expiry")
    ).toHaveTextContent("3");
  });

  // ==========================================
  // 35. LOW-STOCK API FAILURE
  // ==========================================

  test("handles low-stock failure without losing sales report", async () => {
    getLowStock.mockRejectedValue(
      new Error("Low stock API unavailable")
    );

    await renderReady();

    expect(
      metric("Low-stock medicines")
    ).toHaveTextContent("Unavailable");

    expect(
      hasAlert("Low stock API unavailable")
    ).toBe(true);

    expect(
      metric("Sales amount")
    ).toHaveTextContent("₹466.25");
  });

  // ==========================================
  // 36. INVENTORY API FAILURE
  // ==========================================

  test("handles inventory failure without losing sales and stock", async () => {
    getAvailableInventory.mockRejectedValue(
      new Error("Inventory API unavailable")
    );

    await renderReady();

    expect(
      metric("Medicines nearing expiry")
    ).toHaveTextContent("Unavailable");

    expect(
      hasAlert("Inventory API unavailable")
    ).toBe(true);

    expect(
      metric("Low-stock medicines")
    ).toHaveTextContent("3");

    expect(
      metric("Sales amount")
    ).toHaveTextContent("₹466.25");
  });

  // ==========================================
  // 37-39. FALLBACK API ERRORS
  // ==========================================

  test.each([
    [
      "sales",
      "Unable to load sales.",
    ],
    [
      "stock",
      "Unable to load low-stock medicines.",
    ],
    [
      "inventory",
      "Unable to load expiry information.",
    ],
  ])(
    "shows fallback error when %s request has no message",
    async (resource, expectedMessage) => {
      if (resource === "sales") {
        getSales.mockRejectedValue(new Error(""));
      }

      if (resource === "stock") {
        getLowStock.mockRejectedValue(new Error(""));
      }

      if (resource === "inventory") {
        getAvailableInventory.mockRejectedValue(
          new Error("")
        );
      }

      await renderReady();

      expect(
        hasAlert(expectedMessage)
      ).toBe(true);
    }
  );

  // ==========================================
  // 40-45. INVALID SALES DATA
  // ==========================================

  test.each([
    [
      "invalid sale ID",
      { sale_id: 0 },
    ],
    [
      "negative total",
      { total_amount: -5 },
    ],
    [
      "invalid total",
      { total_amount: NaN },
    ],
    [
      "missing date",
      { created_at: "" },
    ],
    [
      "invalid date",
      { created_at: "invalid-date" },
    ],
    [
      "unknown payment mode",
      { payment_mode: "Bitcoin" },
    ],
  ])(
    "rejects sales report containing %s",
    async (_description, changes) => {
      const invalid = {
        ...makeSales()[0],
        ...changes,
      };

      getSales.mockResolvedValue([invalid]);

      await renderReady();

      expect(
        metric("Sales amount")
      ).toHaveTextContent("Unavailable");

      expect(
        hasAlert(
          "Some sales contain invalid values. Unable to calculate the report."
        )
      ).toBe(true);
    }
  );

  // ==========================================
  // 46-47. INVALID STOCK DATA
  // ==========================================

  test.each([
    [
      "negative stock",
      { available_stock: -1 },
    ],
    [
      "invalid reorder level",
      { reorder_level: NaN },
    ],
  ])(
    "rejects low-stock resource with %s",
    async (_description, changes) => {
      getLowStock.mockResolvedValue([
        {
          ...lowStock[0],
          ...changes,
        },
      ]);

      await renderReady();

      expect(
        metric("Low-stock medicines")
      ).toHaveTextContent("Unavailable");

      expect(
        hasAlert(
          "Unable to read some stock quantities."
        )
      ).toBe(true);
    }
  );

  // ==========================================
  // 48-49. INVALID INVENTORY DATA
  // ==========================================

  test.each([
    [
      "invalid expiry",
      { days_to_expire: NaN },
    ],
    [
      "invalid batch quantity",
      { stock_quantity: Infinity },
    ],
  ])(
    "rejects inventory containing %s",
    async (_description, changes) => {
      getAvailableInventory.mockResolvedValue([
        {
          ...inventory[0],
          batches: [
            {
              ...inventory[0].batches[0],
              ...changes,
            },
          ],
        },
      ]);

      await renderReady();

      expect(
        metric("Medicines nearing expiry")
      ).toHaveTextContent("Unavailable");

      expect(
        hasAlert(
          "Unable to read some batch expiry details."
        )
      ).toBe(true);
    }
  );

  // ==========================================
  // 50. REFRESH DASHBOARD
  // ==========================================

  test("refreshes all three resources when clicked", async () => {
    const user = userEvent.setup();

    await renderReady();

    await user.click(refreshButton());

    await waitFor(() => {
      expect(getSales).toHaveBeenCalledTimes(2);

      expect(getLowStock).toHaveBeenCalledTimes(2);

      expect(
        getAvailableInventory
      ).toHaveBeenCalledTimes(2);
    });

    await screen.findByText(/^Last checked /);

    expect(refreshButton()).toBeEnabled();
  });

  // ==========================================
  // 51. REFRESH UPDATES VALUES
  // ==========================================

  test("updates sales statistics after refreshing", async () => {
    const user = userEvent.setup();

    const updatedSales = [
      {
        sale_id: 200,
        customer_name: "Updated Customer",
        pharmacist_name: "Pharmacist A",
        payment_mode: "UPI",
        total_amount: 999.50,
        created_at: saleDate(0),
      },
    ];

    getSales
      .mockResolvedValueOnce(makeSales())
      .mockResolvedValueOnce(updatedSales);

    await renderReady();

    expect(
      metric("Sales amount")
    ).toHaveTextContent("₹466.25");

    await user.click(refreshButton());

    await waitFor(() => {
      expect(
        metric("Sales amount")
      ).toHaveTextContent("₹999.50");
    });

    expect(
      metric("Completed sales")
    ).toHaveTextContent("1");

    expect(recentSaleIds()).toEqual([
      "#200",
    ]);
  });

  // ==========================================
  // 52. REFRESH CLOSES SALE DETAILS
  // ==========================================

  test("closes sale details when dashboard refreshes", async () => {
    const user = userEvent.setup();

    await renderReady();

    await user.click(
      screen.getByRole("button", {
        name: "View details for sale 102",
      })
    );

    expect(
      screen.getByRole("dialog")
    ).toBeInTheDocument();

    await user.click(refreshButton());

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(getSales).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================
  // 53. PREVENT REFRESH WHILE LOADING
  // ==========================================

  test("disables refresh during an ongoing request", async () => {
    const pending = deferred();

    getSales.mockReturnValue(pending.promise);

    renderDashboard();

    expect(refreshButton()).toBeDisabled();

    expect(getSales).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(makeSales());
    });

    expect(refreshButton()).toBeEnabled();

    expect(getSales).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 54. RETRY FAILED DASHBOARD
  // ==========================================

  test("recovers from sales API failure after refreshing", async () => {
    const user = userEvent.setup();

    getSales
      .mockRejectedValueOnce(
        new Error("Temporary API failure")
      )
      .mockResolvedValueOnce(makeSales());

    await renderReady();

    expect(
      metric("Sales amount")
    ).toHaveTextContent("Unavailable");

    await user.click(refreshButton());

    await waitFor(() => {
      expect(
        metric("Sales amount")
      ).toHaveTextContent("₹466.25");
    });

    expect(
      getSales
    ).toHaveBeenCalledTimes(2);
  });

  // ==========================================
  // 55. SALES PERIOD DOES NOT AFFECT STOCK
  // ==========================================

  test("keeps stock metrics unchanged when sales period changes", async () => {
    const user = userEvent.setup();

    await renderReady();

    await user.click(periodButton("Today"));

    expect(
      metric("Low-stock medicines")
    ).toHaveTextContent("3");

    expect(
      metric("Medicines nearing expiry")
    ).toHaveTextContent("3");

    await user.click(
      periodButton("Last 30 days")
    );

    expect(
      metric("Low-stock medicines")
    ).toHaveTextContent("3");

    expect(
      metric("Medicines nearing expiry")
    ).toHaveTextContent("3");
  });

  // ==========================================
  // 56. NAVIGATION SHORTCUTS
  // ==========================================

  test("renders correct admin navigation links", async () => {
    await renderReady();

    expect(
      screen.getByRole("link", {
        name: "Manage users",
      })
    ).toHaveAttribute("href", "/users");

    expect(
      screen.getByRole("link", {
        name: "Manage batches",
      })
    ).toHaveAttribute("href", "/batches");

    expect(
      screen.getByRole("link", {
        name: "Available inventory",
      })
    ).toHaveAttribute("href", "/inventory");

    expect(
      screen.getByRole("link", {
        name: "Sales history",
      })
    ).toHaveAttribute("href", "/sales");

    expect(
      screen.getByRole("link", {
        name: "My profile",
      })
    ).toHaveAttribute("href", "/profile");
  });

  // ==========================================
  // 57. IGNORE OUTDATED REQUESTS
  // ==========================================

  test("ignores stale API results after authentication changes", async () => {
    const oldAuthRequest = vi.fn();
    const newAuthRequest = vi.fn();

    const oldResponse = deferred();

    const newSales = [
      {
        sale_id: 300,
        customer_name: "New Session Customer",
        pharmacist_name: "Pharmacist A",
        payment_mode: "Cash",
        total_amount: 12.34,
        created_at: saleDate(0),
      },
    ];

    getSales.mockImplementation((request) => {
      if (request === oldAuthRequest) {
        return oldResponse.promise;
      }

      return Promise.resolve(newSales);
    });

    useAuth.mockReturnValue({
      user: adminUser,
      authenticatedRequest: oldAuthRequest,
    });

    const { rerender } = renderDashboard();

    expect(
      metric("Sales amount")
    ).toHaveTextContent("Loading...");

    // Change authenticated request function.
    useAuth.mockReturnValue({
      user: adminUser,
      authenticatedRequest: newAuthRequest,
    });

    rerender(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        metric("Sales amount")
      ).toHaveTextContent("₹12.34");
    });

    // The old session's API response arrives late.
    await act(async () => {
      oldResponse.resolve(makeSales());
    });

    // Old results must not replace new data.
    expect(
      metric("Sales amount")
    ).toHaveTextContent("₹12.34");

    expect(recentSaleIds()).toEqual([
      "#300",
    ]);

    expect(getSales).toHaveBeenCalledTimes(2);
  });
});
