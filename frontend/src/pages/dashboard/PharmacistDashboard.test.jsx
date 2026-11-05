
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

import PharmacistDashboard from "./PharmacistDashboard";
import useAuth from "../../hooks/useAuth";

import {
  getAvailableInventory,
  getLowStock,
} from "../../services/inventory.service";

// =============================================
// MOCK DEPENDENCIES
// =============================================

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

vi.mock("../../services/inventory.service", () => ({
  getAvailableInventory: vi.fn(),
  getLowStock: vi.fn(),
}));

// =============================================
// TEST USER
// =============================================

const pharmacist = {
  user_id: 2,
  name: "Ravi Kumar",
  email: "ravi@example.com",
  role: "Pharmacist",
};

const mockRequest = vi.fn();

// =============================================
// TEST LOW-STOCK DATA
// =============================================

const lowStock = [
  {
    medicine_id: 1,
    medicine_name: "Vitamin D",
    manufacturer_name: "Vital Pharma",
    available_stock: 5,
    reorder_level: 10,
  },
  {
    medicine_id: 2,
    medicine_name: "Insulin",
    manufacturer_name: "Bio Labs",
    available_stock: 0,
    reorder_level: 12,
  },
  {
    medicine_id: 3,
    medicine_name: "Gauze",
    manufacturer_name: "Med Supplies",
    available_stock: 2,
    reorder_level: 8,
  },
  {
    medicine_id: 4,
    medicine_name: "Amoxicillin",
    manufacturer_name: "Care Labs",
    available_stock: 0,
    reorder_level: 6,
  },
  {
    medicine_id: 5,
    medicine_name: "Zinc",
    manufacturer_name: "Vital Pharma",
    available_stock: 9,
    reorder_level: 12,
  },
];

// =============================================
// TEST INVENTORY DATA
// =============================================

const inventory = [
  {
    medicine_id: 10,
    medicine_name: "Paracetamol",
    manufacturer_name: "ABC Pharma",
    available_stock: 50,
    batches: [
      {
        batch_id: 101,
        batch_number: "PAR-9",
        stock_quantity: 10,
        days_to_expire: 9,
      },
      {
        batch_id: 102,
        batch_number: "PAR-0",
        stock_quantity: 12,
        days_to_expire: 0,
      },
      {
        batch_id: 103,
        batch_number: "PAR-1",
        stock_quantity: 7,
        days_to_expire: 1,
      },
      {
        batch_id: 104,
        batch_number: "PAR-EXPIRED",
        stock_quantity: 8,
        days_to_expire: -2,
      },
      {
        batch_id: 105,
        batch_number: "PAR-ZERO",
        stock_quantity: 0,
        days_to_expire: 2,
      },
      {
        batch_id: 106,
        batch_number: "PAR-11",
        stock_quantity: 4,
        days_to_expire: 11,
      },
    ],
  },
  {
    medicine_id: 11,
    medicine_name: "Cetirizine",
    manufacturer_name: "Care Labs",
    available_stock: 30,
    batches: [
      {
        batch_id: 201,
        batch_number: "CET-1",
        stock_quantity: 20,
        days_to_expire: 1,
      },
    ],
  },
  {
    medicine_id: 12,
    medicine_name: "Amoxicillin",
    manufacturer_name: "Care Labs",
    available_stock: 25,
    batches: [
      {
        batch_id: 301,
        batch_number: "AMX-10",
        stock_quantity: 25,
        days_to_expire: 10,
      },
    ],
  },
  {
    medicine_id: 13,
    medicine_name: "Vitamin C",
    manufacturer_name: "Nature Health",
    available_stock: 35,
    batches: [
      {
        batch_id: 401,
        batch_number: "VIT-30",
        stock_quantity: 35,
        days_to_expire: 30,
      },
    ],
  },
  {
    medicine_id: 14,
    medicine_name: "Zinc",
    manufacturer_name: "Nature Health",
    available_stock: 15,
    batches: [],
  },
];

// =============================================
// HELPER FUNCTIONS
// =============================================

function renderDashboard() {
  return render(
    <MemoryRouter>
      <PharmacistDashboard />
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

function stockPanel() {
  return panel("Stock alerts");
}

function expiryPanel() {
  return panel("Upcoming batch expiry");
}

function stockItems() {
  return within(stockPanel()).queryAllByRole(
    "listitem"
  );
}

function expiryItems() {
  return within(expiryPanel()).queryAllByRole(
    "listitem"
  );
}

function stockNames() {
  return stockItems().map(
    (item) =>
      within(item)
        .getByRole("heading")
        .textContent.trim()
  );
}

function expiryBatchNumbers() {
  return expiryItems().map(
    (item) =>
      item.querySelector("dl dd")
        ?.textContent.trim()
  );
}

function refreshButton() {
  return screen.getByRole("button", {
    name: "Refresh dashboard",
  });
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
    (element) =>
      element.textContent.includes(message)
  );
}

// =============================================
// PHARMACIST DASHBOARD TESTS
// =============================================

describe("PharmacistDashboard", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    useAuth.mockReturnValue({
      user: pharmacist,
      authenticatedRequest: mockRequest,
    });

    getAvailableInventory.mockResolvedValue(
      inventory
    );

    getLowStock.mockResolvedValue(lowStock);
  });

  // ===========================================
  // PAGE RENDERING
  // ===========================================

  test("renders dashboard heading and pharmacist welcome", async () => {
    await renderReady();

    expect(
      screen.getByRole("heading", {
        name: "Dashboard",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Welcome back, Ravi Kumar. Your stock overview is here."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByText("Pharmacy workspace")
    ).toBeInTheDocument();
  });

  test("loads inventory and low stock using authenticated request", async () => {
    await renderReady();

    expect(
      getAvailableInventory
    ).toHaveBeenCalledWith(mockRequest);

    expect(
      getLowStock
    ).toHaveBeenCalledWith(mockRequest);

    expect(
      getAvailableInventory
    ).toHaveBeenCalledTimes(1);

    expect(
      getLowStock
    ).toHaveBeenCalledTimes(1);
  });

  test("shows loading state while fetching stock", async () => {
    const request = deferred();

    getAvailableInventory.mockReturnValue(
      request.promise
    );

    renderDashboard();

    expect(
      metric("Medicines in stock")
    ).toHaveTextContent("Loading...");

    expect(
      metric("Low-stock medicines")
    ).toHaveTextContent("Loading...");

    expect(
      metric("Medicines nearing expiry")
    ).toHaveTextContent("Loading...");

    expect(
      screen.getAllByText(
        "Loading stock information..."
      )
    ).toHaveLength(2);

    expect(refreshButton()).toBeDisabled();

    await act(async () => {
      request.resolve(inventory);
    });

    await screen.findByText(/^Last checked /);

    expect(refreshButton()).toBeEnabled();
  });

  test("waits for both API requests before completing loading", async () => {
    const inventoryRequest = deferred();
    const stockRequest = deferred();

    getAvailableInventory.mockReturnValue(
      inventoryRequest.promise
    );

    getLowStock.mockReturnValue(
      stockRequest.promise
    );

    renderDashboard();

    await act(async () => {
      inventoryRequest.resolve(inventory);
    });

    // Both resources are processed together
    // using Promise.allSettled().
    expect(
      metric("Medicines in stock")
    ).toHaveTextContent("Loading...");

    expect(refreshButton()).toBeDisabled();

    await act(async () => {
      stockRequest.resolve(lowStock);
    });

    expect(
      metric("Medicines in stock")
    ).toHaveTextContent("5");

    expect(
      metric("Low-stock medicines")
    ).toHaveTextContent("5");
  });

  test("displays India time and last checked information", async () => {
    await renderReady();

    expect(
      screen.getByText(/· India time$/)
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        /Last checked .* IST · Refresh for latest stock/
      )
    ).toBeInTheDocument();

    expect(
      screen.queryByText(
        "Updating stock information..."
      )
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // SUMMARY CARDS
  // ===========================================

  test("displays available inventory medicine count", async () => {
    await renderReady();

    expect(
      within(metric("Medicines in stock"))
        .getByText("5")
    ).toBeInTheDocument();

    expect(
      metric("Medicines in stock")
    ).toHaveAttribute(
      "aria-busy",
      "false"
    );
  });

  test("displays low-stock medicine count", async () => {
    await renderReady();

    expect(
      within(metric("Low-stock medicines"))
        .getByText("5")
    ).toBeInTheDocument();
  });

  test("displays out-of-stock medicine count", async () => {
    await renderReady();

    expect(
      metric("Low-stock medicines")
    ).toHaveTextContent(
      "2 out of stock"
    );
  });

  test("counts expiring medicines only once each", async () => {
    await renderReady();

    // Paracetamol has three eligible batches,
    // but counts as one medicine.
    expect(
      within(metric("Medicines nearing expiry"))
        .getByText("3")
    ).toBeInTheDocument();
  });

  // ===========================================
  // NEW SALE AND NAVIGATION
  // ===========================================

  test("shows New Sale action for pharmacist", async () => {
    await renderReady();

    expect(
      screen.getByRole("heading", {
        name: "Ready to serve your next customer?",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: "New Sale",
      })
    ).toHaveAttribute(
      "href",
      "/sales/new"
    );
  });

  test("renders dashboard navigation shortcuts", async () => {
    await renderReady();

    expect(
      screen.getByRole("link", {
        name: "Available Inventory",
      })
    ).toHaveAttribute(
      "href",
      "/inventory"
    );

    expect(
      screen.getByRole("link", {
        name: "Low Stock",
      })
    ).toHaveAttribute(
      "href",
      "/low-stock"
    );

    expect(
      screen.getByRole("link", {
        name: "My Profile",
      })
    ).toHaveAttribute(
      "href",
      "/profile"
    );
  });

  test("renders stock and inventory panel links", async () => {
    await renderReady();

    expect(
      within(stockPanel()).getByRole("link", {
        name: "View all",
      })
    ).toHaveAttribute(
      "href",
      "/low-stock"
    );

    expect(
      within(expiryPanel()).getByRole("link", {
        name: "Inventory",
      })
    ).toHaveAttribute(
      "href",
      "/inventory"
    );
  });

  // ===========================================
  // LOW-STOCK ALERTS
  // ===========================================

  test("sorts low-stock medicines by available quantity", async () => {
    await renderReady();

    expect(stockNames()).toEqual([
      "Amoxicillin",
      "Insulin",
      "Gauze",
      "Vitamin D",
      "Zinc",
    ]);
  });

  test("sorts equal stock quantities alphabetically", async () => {
    await renderReady();

    // Both have zero stock.
    expect(stockNames().slice(0, 2)).toEqual([
      "Amoxicillin",
      "Insulin",
    ]);
  });

  test("displays manufacturer and reorder level for stock alerts", async () => {
    await renderReady();

    const firstItem = stockItems()[0];

    expect(firstItem).toHaveTextContent(
      "Amoxicillin"
    );

    expect(firstItem).toHaveTextContent(
      "Care Labs"
    );

    expect(
      within(firstItem).getByText("Available")
    ).toBeInTheDocument();

    expect(
      within(firstItem).getByText("0")
    ).toBeInTheDocument();

    expect(
      within(firstItem).getByText("Reorder level")
    ).toBeInTheDocument();

    expect(
      within(firstItem).getByText("6")
    ).toBeInTheDocument();
  });

  test("displays Out of stock and Low stock labels", async () => {
    await renderReady();

    expect(stockItems()[0]).toHaveTextContent(
      "Out of stock"
    );

    expect(stockItems()[1]).toHaveTextContent(
      "Out of stock"
    );

    expect(stockItems()[2]).toHaveTextContent(
      "Low stock"
    );
  });

  test("limits low-stock alert preview to five medicines", async () => {
    getLowStock.mockResolvedValue([
      ...lowStock,
      {
        medicine_id: 6,
        medicine_name: "Melatonin",
        manufacturer_name: "Nature Health",
        available_stock: 10,
        reorder_level: 12,
      },
    ]);

    await renderReady();

    expect(stockItems()).toHaveLength(5);

    expect(
      metric("Low-stock medicines")
    ).toHaveTextContent("6");

    expect(stockPanel()).toHaveTextContent(
      /Showing\s*5\s*of\s*6\s*medicines/
    );

    expect(stockNames()).not.toContain(
      "Melatonin"
    );
  });

  test("shows empty stock alert message when none are low", async () => {
    getLowStock.mockResolvedValue([]);

    await renderReady();

    expect(stockItems()).toHaveLength(0);

    expect(stockPanel()).toHaveTextContent(
      /No medicines are currently at or below their reorder level/
    );
  });

  test("shows zero low-stock and out-of-stock counts for empty data", async () => {
    getLowStock.mockResolvedValue([]);

    await renderReady();

    expect(
      within(metric("Low-stock medicines"))
        .getByText("0")
    ).toBeInTheDocument();

    expect(
      metric("Low-stock medicines")
    ).toHaveTextContent(
      "0 out of stock"
    );
  });

  // ===========================================
  // EXPIRY ALERTS
  // ===========================================

  test("shows available batches ordered by expiry", async () => {
    await renderReady();

    expect(expiryBatchNumbers()).toEqual([
      "PAR-0",
      "CET-1",
      "PAR-1",
      "PAR-9",
      "AMX-10",
    ]);
  });

  test("shows expiry alerts for today and tomorrow", async () => {
    await renderReady();

    expect(
      expiryPanel()
    ).toHaveTextContent("Expires today");

    expect(
      expiryPanel()
    ).toHaveTextContent("Expires tomorrow");
  });

  test("includes batches expiring on day ten", async () => {
    await renderReady();

    expect(
      expiryPanel()
    ).toHaveTextContent("AMX-10");

    expect(
      expiryPanel()
    ).toHaveTextContent("In 10 days");
  });

  test("excludes already expired batches", async () => {
    await renderReady();

    expect(expiryBatchNumbers()).not.toContain(
      "PAR-EXPIRED"
    );
  });

  test("excludes batches with zero available quantity", async () => {
    await renderReady();

    expect(expiryBatchNumbers()).not.toContain(
      "PAR-ZERO"
    );
  });

  test("excludes batches expiring after ten days", async () => {
    await renderReady();

    expect(expiryBatchNumbers()).not.toContain(
      "PAR-11"
    );

    expect(expiryBatchNumbers()).not.toContain(
      "VIT-30"
    );
  });

  test("displays medicine, manufacturer and available batch units", async () => {
    await renderReady();

    const firstItem = expiryItems()[0];

    expect(firstItem).toHaveTextContent(
      "Paracetamol"
    );

    expect(firstItem).toHaveTextContent(
      "ABC Pharma"
    );

    expect(firstItem).toHaveTextContent(
      "PAR-0"
    );

    expect(
      within(firstItem).getByText(
        "Available units"
      )
    ).toBeInTheDocument();

    expect(
      within(firstItem).getByText("12")
    ).toBeInTheDocument();
  });

  test("limits upcoming expiry preview to five batches", async () => {
    getAvailableInventory.mockResolvedValue([
      ...inventory,
      {
        medicine_id: 15,
        medicine_name: "Iron",
        manufacturer_name: "Care Labs",
        available_stock: 5,
        batches: [
          {
            batch_id: 501,
            batch_number: "IRON-2",
            stock_quantity: 5,
            days_to_expire: 2,
          },
        ],
      },
      {
        medicine_id: 16,
        medicine_name: "Magnesium",
        manufacturer_name: "Care Labs",
        available_stock: 8,
        batches: [
          {
            batch_id: 601,
            batch_number: "MAG-3",
            stock_quantity: 8,
            days_to_expire: 3,
          },
        ],
      },
    ]);

    await renderReady();

    expect(expiryItems()).toHaveLength(5);

    expect(expiryBatchNumbers()).toEqual([
      "PAR-0",
      "CET-1",
      "PAR-1",
      "IRON-2",
      "MAG-3",
    ]);

    expect(expiryPanel()).toHaveTextContent(
      /Showing\s*5\s*of\s*7\s*batches/
    );

    // Seven batches but only five medicines.
    expect(
      within(metric("Medicines nearing expiry"))
        .getByText("5")
    ).toBeInTheDocument();
  });

  test("shows empty expiry alerts when no batches expire soon", async () => {
    getAvailableInventory.mockResolvedValue([
      inventory[3],
      inventory[4],
    ]);

    await renderReady();

    expect(expiryItems()).toHaveLength(0);

    expect(
      metric("Medicines nearing expiry")
    ).toHaveTextContent("0");

    expect(expiryPanel()).toHaveTextContent(
      /No available batches are expiring within the next 10 days/
    );
  });

  test("handles inventory medicines with no batches", async () => {
    getAvailableInventory.mockResolvedValue([
      inventory[4],
    ]);

    await renderReady();

    expect(
      metric("Medicines in stock")
    ).toHaveTextContent("1");

    expect(
      metric("Medicines nearing expiry")
    ).toHaveTextContent("0");

    expect(expiryItems()).toHaveLength(0);
  });

  test("handles both services returning empty arrays", async () => {
    getAvailableInventory.mockResolvedValue([]);
    getLowStock.mockResolvedValue([]);

    await renderReady();

    expect(
      metric("Medicines in stock")
    ).toHaveTextContent("0");

    expect(
      metric("Low-stock medicines")
    ).toHaveTextContent("0");

    expect(
      metric("Medicines nearing expiry")
    ).toHaveTextContent("0");

    expect(stockItems()).toHaveLength(0);
    expect(expiryItems()).toHaveLength(0);
  });

  // ===========================================
  // INDEPENDENT API FAILURES
  // ===========================================

  test("handles inventory failure without losing low-stock information", async () => {
    getAvailableInventory.mockRejectedValue(
      new Error("Inventory API unavailable")
    );

    await renderReady();

    expect(
      metric("Medicines in stock")
    ).toHaveTextContent("Unavailable");

    expect(
      metric("Medicines nearing expiry")
    ).toHaveTextContent("Unavailable");

    expect(
      hasAlert("Inventory API unavailable")
    ).toBe(true);

    expect(
      metric("Low-stock medicines")
    ).toHaveTextContent("5");

    expect(stockItems()).toHaveLength(5);
  });

  test("handles low-stock failure without losing inventory", async () => {
    getLowStock.mockRejectedValue(
      new Error("Low-stock API unavailable")
    );

    await renderReady();

    expect(
      metric("Low-stock medicines")
    ).toHaveTextContent("Unavailable");

    expect(
      hasAlert("Low-stock API unavailable")
    ).toBe(true);

    expect(
      metric("Medicines in stock")
    ).toHaveTextContent("5");

    expect(
      metric("Medicines nearing expiry")
    ).toHaveTextContent("3");
  });

  test("displays both errors when both services fail", async () => {
    getAvailableInventory.mockRejectedValue(
      new Error("Inventory failed")
    );

    getLowStock.mockRejectedValue(
      new Error("Low stock failed")
    );

    await renderReady();

    expect(
      metric("Medicines in stock")
    ).toHaveTextContent("Unavailable");

    expect(
      metric("Low-stock medicines")
    ).toHaveTextContent("Unavailable");

    expect(
      metric("Medicines nearing expiry")
    ).toHaveTextContent("Unavailable");

    expect(hasAlert("Inventory failed")).toBe(true);
    expect(hasAlert("Low stock failed")).toBe(true);

    expect(
      screen.getAllByRole("button", {
        name: "Retry",
      })
    ).toHaveLength(2);
  });

  // ===========================================
  // FALLBACK API ERRORS
  // ===========================================

  test.each([
    [
      "inventory",
      "Unable to load available inventory.",
    ],
    [
      "lowStock",
      "Unable to load low-stock medicines.",
    ],
  ])(
    "shows fallback error for %s service",
    async (resource, message) => {
      if (resource === "inventory") {
        getAvailableInventory.mockRejectedValue(
          new Error("")
        );
      } else {
        getLowStock.mockRejectedValue(
          new Error("")
        );
      }

      await renderReady();

      expect(hasAlert(message)).toBe(true);
    }
  );

  // ===========================================
  // INVENTORY DATA VALIDATION
  // ===========================================

  test.each([
    [
      "zero available medicine stock",
      { available_stock: 0 },
      {},
    ],
    [
      "negative medicine stock",
      { available_stock: -1 },
      {},
    ],
    [
      "negative batch quantity",
      {},
      { stock_quantity: -1 },
    ],
    [
      "invalid batch expiry",
      {},
      { days_to_expire: NaN },
    ],
    [
      "non-finite batch quantity",
      {},
      { stock_quantity: Infinity },
    ],
  ])(
    "rejects inventory with %s",
    async (_description, medicineChanges, batchChanges) => {
      getAvailableInventory.mockResolvedValue([
        {
          ...inventory[0],
          ...medicineChanges,
          batches: [
            {
              ...inventory[0].batches[0],
              ...batchChanges,
            },
          ],
        },
      ]);

      await renderReady();

      expect(
        metric("Medicines in stock")
      ).toHaveTextContent("Unavailable");

      expect(
        metric("Medicines nearing expiry")
      ).toHaveTextContent("Unavailable");

      expect(
        hasAlert(
          "Some inventory quantities or expiry details could not be read."
        )
      ).toBe(true);

      // Other resource still works.
      expect(
        metric("Low-stock medicines")
      ).toHaveTextContent("5");
    }
  );

  // ===========================================
  // LOW-STOCK DATA VALIDATION
  // ===========================================

  test.each([
    [
      "negative available stock",
      { available_stock: -1 },
    ],
    [
      "non-finite available stock",
      { available_stock: Infinity },
    ],
    [
      "negative reorder level",
      { reorder_level: -1 },
    ],
    [
      "invalid reorder level",
      { reorder_level: NaN },
    ],
  ])(
    "rejects low-stock data with %s",
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
          "Some low-stock quantities could not be read."
        )
      ).toBe(true);

      // Inventory still works.
      expect(
        metric("Medicines in stock")
      ).toHaveTextContent("5");
    }
  );

  // ===========================================
  // RETRY AND REFRESH
  // ===========================================

  test("retries failed low-stock request", async () => {
    const user = userEvent.setup();

    getLowStock
      .mockRejectedValueOnce(
        new Error("Temporary low-stock failure")
      )
      .mockResolvedValueOnce(lowStock);

    await renderReady();

    expect(
      hasAlert("Temporary low-stock failure")
    ).toBe(true);

    await user.click(
      within(stockPanel()).getByRole(
        "button",
        { name: "Retry" }
      )
    );

    await waitFor(() => {
      expect(
        metric("Low-stock medicines")
      ).toHaveTextContent("5");
    });

    expect(getLowStock).toHaveBeenCalledTimes(2);

    expect(
      getAvailableInventory
    ).toHaveBeenCalledTimes(2);

    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  test("retries failed inventory request", async () => {
    const user = userEvent.setup();

    getAvailableInventory
      .mockRejectedValueOnce(
        new Error("Temporary inventory failure")
      )
      .mockResolvedValueOnce(inventory);

    await renderReady();

    expect(
      hasAlert("Temporary inventory failure")
    ).toBe(true);

    await user.click(
      within(expiryPanel()).getByRole(
        "button",
        { name: "Retry" }
      )
    );

    await waitFor(() => {
      expect(
        metric("Medicines in stock")
      ).toHaveTextContent("5");

      expect(
        metric("Medicines nearing expiry")
      ).toHaveTextContent("3");
    });

    expect(
      getAvailableInventory
    ).toHaveBeenCalledTimes(2);

    expect(
      getLowStock
    ).toHaveBeenCalledTimes(2);
  });

  test("refreshes both inventory services", async () => {
    const user = userEvent.setup();

    await renderReady();

    await user.click(refreshButton());

    await waitFor(() => {
      expect(
        getAvailableInventory
      ).toHaveBeenCalledTimes(2);

      expect(
        getLowStock
      ).toHaveBeenCalledTimes(2);
    });

    await screen.findByText(/^Last checked /);

    expect(refreshButton()).toBeEnabled();
  });

  test("updates dashboard metrics after refresh", async () => {
    const user = userEvent.setup();

    getAvailableInventory
      .mockResolvedValueOnce(inventory)
      .mockResolvedValueOnce([
        inventory[0],
      ]);

    getLowStock
      .mockResolvedValueOnce(lowStock)
      .mockResolvedValueOnce([]);

    await renderReady();

    expect(
      metric("Medicines in stock")
    ).toHaveTextContent("5");

    expect(
      metric("Low-stock medicines")
    ).toHaveTextContent("5");

    await user.click(refreshButton());

    await waitFor(() => {
      expect(
        within(metric("Medicines in stock"))
          .getByText("1")
      ).toBeInTheDocument();

      expect(
        within(metric("Low-stock medicines"))
          .getByText("0")
      ).toBeInTheDocument();
    });

    expect(
      within(metric("Medicines nearing expiry"))
        .getByText("1")
    ).toBeInTheDocument();

    expect(stockItems()).toHaveLength(0);
  });

  test("prevents refresh while loading", async () => {
    const user = userEvent.setup();
    const request = deferred();

    getAvailableInventory.mockReturnValue(
      request.promise
    );

    renderDashboard();

    expect(refreshButton()).toBeDisabled();

    await user.click(refreshButton());

    expect(
      getAvailableInventory
    ).toHaveBeenCalledTimes(1);

    expect(
      getLowStock
    ).toHaveBeenCalledTimes(1);

    await act(async () => {
      request.resolve(inventory);
    });

    expect(refreshButton()).toBeEnabled();
  });

  // ===========================================
  // ASYNC SAFETY
  // ===========================================

  test("ignores outdated API responses after authentication changes", async () => {
    const oldAuthRequest = vi.fn();
    const newAuthRequest = vi.fn();

    const oldResponse = deferred();

    getAvailableInventory.mockImplementation(
      (request) => {
        if (request === oldAuthRequest) {
          return oldResponse.promise;
        }

        return Promise.resolve([
          inventory[0],
        ]);
      }
    );

    getLowStock.mockImplementation(
      (request) => {
        if (request === oldAuthRequest) {
          return Promise.resolve(lowStock);
        }

        return Promise.resolve([]);
      }
    );

    useAuth.mockReturnValue({
      user: pharmacist,
      authenticatedRequest: oldAuthRequest,
    });

    const { rerender } = renderDashboard();

    expect(
      metric("Medicines in stock")
    ).toHaveTextContent("Loading...");

    // A different authenticated request becomes active.
    useAuth.mockReturnValue({
      user: pharmacist,
      authenticatedRequest: newAuthRequest,
    });

    rerender(
      <MemoryRouter>
        <PharmacistDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        within(metric("Medicines in stock"))
          .getByText("1")
      ).toBeInTheDocument();

      expect(
        within(metric("Low-stock medicines"))
          .getByText("0")
      ).toBeInTheDocument();
    });

    // Old session resolves after the new one.
    await act(async () => {
      oldResponse.resolve(inventory);
    });

    // Old data must not overwrite new session data.
    expect(
      within(metric("Medicines in stock"))
        .getByText("1")
    ).toBeInTheDocument();

    expect(
      within(metric("Low-stock medicines"))
        .getByText("0")
    ).toBeInTheDocument();

    expect(
      getAvailableInventory
    ).toHaveBeenCalledTimes(2);

    expect(
      getLowStock
    ).toHaveBeenCalledTimes(2);
  });
});
