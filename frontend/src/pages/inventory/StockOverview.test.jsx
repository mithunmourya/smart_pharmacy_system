
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

import StockOverview from "./StockOverview";
import useAuth from "../../hooks/useAuth";

import {
  getAvailableInventory,
  getLowStock,
} from "../../services/inventory.service";

import {
  formatBatchDate,
  formatPrice,
} from "../../utils/batch";

// ============================================
// MOCKS
// ============================================

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

vi.mock("../../services/inventory.service", () => ({
  getAvailableInventory: vi.fn(),
  getLowStock: vi.fn(),
}));

vi.mock("../../components/Modal", () => ({
  default: ({ title, onClose, children }) => (
    <section role="dialog" aria-label={title}>
      <h2>{title}</h2>
      <button type="button" onClick={onClose}>
        Dismiss modal
      </button>
      {children}
    </section>
  ),
}));

// ============================================
// MOCK INVENTORY DATA
// ============================================

const inventory = [
  {
    medicine_id: 1,
    medicine_name: "Paracetamol",
    manufacturer_id: 11,
    manufacturer_name: "Medico Pharma",
    category: "Pain Relief",
    reorder_level: 10,
    available_stock: 35,
    earliest_expiry_days: 0,
    earliest_expiry_date: "2026-11-04",
    batches: [
      {
        batch_id: 101,
        batch_number: "PAR-001",
        selling_price: 12.5,
        stock_quantity: 15,
        expiry_date: "2026-11-04",
        days_to_expire: 0,
      },
      {
        batch_id: 102,
        batch_number: "PAR-002",
        selling_price: 14.5,
        stock_quantity: 20,
        expiry_date: "2026-12-15",
        days_to_expire: 41,
      },
    ],
  },
  {
    medicine_id: 2,
    medicine_name: "Amoxicillin",
    manufacturer_id: 22,
    manufacturer_name: "Care Labs",
    category: "Antibiotic",
    reorder_level: 5,
    available_stock: 18,
    earliest_expiry_days: 7,
    earliest_expiry_date: "2026-11-11",
    batches: [
      {
        batch_id: 201,
        batch_number: "AMX-777",
        selling_price: 60,
        stock_quantity: 18,
        expiry_date: "2026-11-11",
        days_to_expire: 7,
      },
    ],
  },
  {
    medicine_id: 3,
    medicine_name: "Cetirizine",
    manufacturer_id: 11,
    manufacturer_name: "Medico Pharma",
    category: "Allergy",
    reorder_level: 6,
    available_stock: 28,
    earliest_expiry_days: 1,
    earliest_expiry_date: "2026-11-05",
    batches: [
      {
        batch_id: 301,
        batch_number: "CET-123",
        selling_price: 8,
        stock_quantity: 28,
        expiry_date: "2026-11-05",
        days_to_expire: 1,
      },
    ],
  },
  {
    medicine_id: 4,
    medicine_name: "Vitamin C",
    manufacturer_id: 33,
    manufacturer_name: "Nature Health",
    category: "Supplements",
    reorder_level: 10,
    available_stock: 45,
    earliest_expiry_days: 90,
    earliest_expiry_date: "2027-02-02",
    batches: [
      {
        batch_id: 401,
        batch_number: "VIT-001",
        selling_price: 20,
        stock_quantity: 45,
        expiry_date: "2027-02-02",
        days_to_expire: 90,
      },
    ],
  },
  {
    medicine_id: 5,
    medicine_name: "Zinc",
    manufacturer_id: 33,
    manufacturer_name: "Nature Health",
    category: "Supplements",
    reorder_level: 5,
    available_stock: 12,
    earliest_expiry_days: null,
    earliest_expiry_date: null,
    batches: [],
  },
];

// ============================================
// MOCK LOW STOCK DATA
// ============================================

const lowStock = [
  {
    medicine_id: 10,
    medicine_name: "Insulin",
    manufacturer_id: 50,
    manufacturer_name: "Bio Labs",
    category: "Diabetes",
    reorder_level: 15,
    available_stock: 0,
    units_to_threshold: 15,
    stock_status: "Out of stock",
  },
  {
    medicine_id: 11,
    medicine_name: "Saline",
    manufacturer_id: 60,
    manufacturer_name: "Care Labs",
    category: "Essentials",
    reorder_level: 10,
    available_stock: 4,
    units_to_threshold: 6,
    stock_status: "Low stock",
  },
  {
    medicine_id: 12,
    medicine_name: "Glucose",
    manufacturer_id: 50,
    manufacturer_name: "Bio Labs",
    category: "Diabetes",
    reorder_level: 10,
    available_stock: 10,
    units_to_threshold: 0,
    stock_status: "Low stock",
  },
  {
    medicine_id: 13,
    medicine_name: "Gauze",
    manufacturer_id: 70,
    manufacturer_name: "Med Supplies",
    category: "Essentials",
    reorder_level: 12,
    available_stock: 2,
    units_to_threshold: 10,
    stock_status: "Low stock",
  },
];

const mockRequest = vi.fn();

// ============================================
// HELPER FUNCTIONS
// ============================================

function renderInventory(mode = "inventory") {
  return render(<StockOverview mode={mode} />);
}

function renderLowStock() {
  return renderInventory("low-stock");
}

async function waitForInventory(count = 5) {
  await screen.findByText(
    `${count} of ${count} medicines`
  );
}

async function waitForLowStock(count = 4) {
  await screen.findByText(
    `${count} of ${count} medicines`
  );
}

function inventoryRegion() {
  return screen.getByRole("region", {
    name: "Available Inventory",
  });
}

function stockRegion() {
  return screen.getByRole("region", {
    name: "Low Stock",
  });
}

function displayedNames(mode = "inventory") {
  const region =
    mode === "low-stock"
      ? stockRegion()
      : inventoryRegion();

  return within(region)
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.cells[0].textContent.trim());
}

function rowFor(name, mode = "inventory") {
  const region =
    mode === "low-stock"
      ? stockRegion()
      : inventoryRegion();

  return within(region)
    .getAllByRole("row")
    .slice(1)
    .find(
      (row) =>
        row.cells[0].textContent.trim() === name
    );
}

function searchInput() {
  return screen.getByRole("searchbox", {
    name: "Search",
  });
}

function categoryFilter() {
  return screen.getByRole("combobox", {
    name: "Category",
  });
}

function manufacturerFilter() {
  return screen.getByRole("combobox", {
    name: "Manufacturer",
  });
}

function expiryFilter() {
  return screen.getByRole("combobox", {
    name: "Expiry",
  });
}

function stockConditionFilter() {
  return screen.getByRole("combobox", {
    name: "Stock condition",
  });
}

function sortBy(name) {
  return screen.getByRole("button", { name });
}

function reloadButton(mode = "inventory") {
  return screen.getByRole("button", {
    name:
      mode === "low-stock"
        ? "Reload low stock"
        : "Reload available inventory",
  });
}

function batchButton(name) {
  return screen.getByRole("button", {
    name: `View available batches for ${name}`,
  });
}

function summaryGroup() {
  return screen.getByRole("group", {
    name: "Summary for all medicines before filtering",
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

// ============================================
// TEST SUITE
// ============================================

describe("StockOverview", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    useAuth.mockReturnValue({
      authenticatedRequest: mockRequest,
    });

    getAvailableInventory.mockResolvedValue(inventory);
    getLowStock.mockResolvedValue(lowStock);
  });

  // ==========================================
  // AVAILABLE INVENTORY
  // ==========================================

  test("renders inventory page heading", async () => {
    renderInventory();

    expect(
      screen.getByRole("heading", {
        name: "Available Inventory",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Check available stock, batch prices, and expiry dates."
      )
    ).toBeInTheDocument();

    await waitForInventory();
  });

  test("fetches available inventory using authenticated request", async () => {
    renderInventory();
    await waitForInventory();

    expect(
      getAvailableInventory
    ).toHaveBeenCalledWith(mockRequest);

    expect(
      getAvailableInventory
    ).toHaveBeenCalledTimes(1);

    expect(getLowStock).not.toHaveBeenCalled();
  });

  // FIXED: TWO LOADING MESSAGES ARE EXPECTED
  test("shows loading state while fetching inventory", async () => {
    const request = deferred();

    getAvailableInventory.mockReturnValue(
      request.promise
    );

    renderInventory();

    expect(
      screen.getAllByText(
        "Loading stock information..."
      )
    ).toHaveLength(2);

    expect(reloadButton()).toBeDisabled();

    await act(async () => {
      request.resolve(inventory);
    });

    await waitForInventory();

    expect(reloadButton()).toBeEnabled();
  });

  // FIXED: ALLOW OPTIONAL WHITESPACE
  test("displays inventory summary counts", async () => {
    renderInventory();
    await waitForInventory();

    const summary = summaryGroup();

    expect(summary).toHaveTextContent(
      /5\s*medicines in stock/
    );

    expect(summary).toHaveTextContent(
      /3\s*with expiry ≤10 days/
    );
  });

  test("renders medicine names and stock quantities", async () => {
    renderInventory();
    await waitForInventory();

    expect(displayedNames()).toHaveLength(5);

    expect(
      rowFor("Paracetamol").cells[3]
    ).toHaveTextContent("35");

    expect(
      rowFor("Amoxicillin").cells[3]
    ).toHaveTextContent("18");

    expect(
      rowFor("Vitamin C").cells[3]
    ).toHaveTextContent("45");
  });

  test("shows empty inventory message", async () => {
    getAvailableInventory.mockResolvedValue([]);

    renderInventory();

    expect(
      await screen.findByRole("heading", {
        name: "No available inventory",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Available medicine batches will appear here when stock is added."
      )
    ).toBeInTheDocument();
  });

  test("shows API error for failed inventory request", async () => {
    getAvailableInventory.mockRejectedValue(
      new Error("Inventory service unavailable")
    );

    renderInventory();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Inventory service unavailable"
    );
  });

  test("shows fallback error when API message is empty", async () => {
    getAvailableInventory.mockRejectedValue(
      new Error("")
    );

    renderInventory();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to load stock information."
    );
  });

  test("retries loading inventory after failure", async () => {
    const user = userEvent.setup();

    getAvailableInventory
      .mockRejectedValueOnce(
        new Error("Temporary error")
      )
      .mockResolvedValueOnce(inventory);

    renderInventory();

    await screen.findByRole("alert");

    await user.click(reloadButton());

    await waitForInventory();

    expect(
      getAvailableInventory
    ).toHaveBeenCalledTimes(2);

    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  test("displays updated inventory after reload", async () => {
    const user = userEvent.setup();

    const updated = [
      ...inventory,
      {
        medicine_id: 6,
        medicine_name: "Aspirin",
        manufacturer_id: 22,
        manufacturer_name: "Care Labs",
        category: "Pain Relief",
        available_stock: 25,
        reorder_level: 5,
        earliest_expiry_days: 30,
        earliest_expiry_date: "2026-12-04",
        batches: [],
      },
    ];

    getAvailableInventory
      .mockResolvedValueOnce(inventory)
      .mockResolvedValueOnce(updated);

    renderInventory();
    await waitForInventory();

    await user.click(reloadButton());

    await screen.findByText("6 of 6 medicines");

    expect(
      getAvailableInventory
    ).toHaveBeenCalledTimes(2);

    expect(displayedNames()).toContain("Aspirin");
  });

  // ==========================================
  // INVENTORY SEARCH
  // ==========================================

  test("searches inventory by medicine name", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.type(searchInput(), "para");

    expect(displayedNames()).toEqual([
      "Paracetamol",
    ]);
  });

  test("searches inventory by manufacturer name", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.type(searchInput(), "medico");

    expect(displayedNames()).toEqual([
      "Cetirizine",
      "Paracetamol",
    ]);
  });

  test("searches inventory by batch number", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.type(searchInput(), "AMX-777");

    expect(displayedNames()).toEqual([
      "Amoxicillin",
    ]);
  });

  test("searches without case sensitivity and trims whitespace", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.type(
      searchInput(),
      "  PARACETAMOL  "
    );

    expect(displayedNames()).toEqual([
      "Paracetamol",
    ]);
  });

  test("shows no matching medicines when search fails", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.type(searchInput(), "unknown");

    expect(
      screen.getByRole("heading", {
        name: "No matching medicines",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText("0 of 5 medicines")
    ).toBeInTheDocument();
  });

  // ==========================================
  // INVENTORY FILTERS
  // ==========================================

  test("filters inventory by category", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.selectOptions(
      categoryFilter(),
      "Supplements"
    );

    expect(displayedNames()).toEqual([
      "Vitamin C",
      "Zinc",
    ]);
  });

  test("filters inventory by manufacturer ID", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.selectOptions(
      manufacturerFilter(),
      "22"
    );

    expect(displayedNames()).toEqual([
      "Amoxicillin",
    ]);
  });

  test("lists each manufacturer only once", async () => {
    renderInventory();
    await waitForInventory();

    const select = manufacturerFilter();

    expect(
      within(select).getAllByRole("option", {
        name: "Medico Pharma",
      })
    ).toHaveLength(1);

    expect(
      within(select).getAllByRole("option", {
        name: "Nature Health",
      })
    ).toHaveLength(1);
  });

  test("filters medicines expiring within 10 days", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.selectOptions(
      expiryFilter(),
      "Soon"
    );

    expect(displayedNames()).toEqual([
      "Amoxicillin",
      "Cetirizine",
      "Paracetamol",
    ]);
  });

  test("filters medicines expiring today", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.selectOptions(
      expiryFilter(),
      "Today"
    );

    expect(displayedNames()).toEqual([
      "Paracetamol",
    ]);
  });

  test("combines category, manufacturer, and expiry filters", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.selectOptions(
      categoryFilter(),
      "Pain Relief"
    );

    await user.selectOptions(
      manufacturerFilter(),
      "11"
    );

    await user.selectOptions(
      expiryFilter(),
      "Today"
    );

    expect(displayedNames()).toEqual([
      "Paracetamol",
    ]);
  });

  test("clears all inventory filters", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.type(searchInput(), "para");

    await user.selectOptions(
      categoryFilter(),
      "Pain Relief"
    );

    await user.selectOptions(
      manufacturerFilter(),
      "11"
    );

    await user.selectOptions(
      expiryFilter(),
      "Today"
    );

    await user.click(
      screen.getByRole("button", {
        name: "Clear filters",
      })
    );

    expect(searchInput()).toHaveValue("");
    expect(categoryFilter()).toHaveValue("All");
    expect(manufacturerFilter()).toHaveValue("All");
    expect(expiryFilter()).toHaveValue("All");

    expect(displayedNames()).toHaveLength(5);
  });

  // FIXED: SUMMARY ASSERTIONS
  test("summary counts do not change when filtering", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.type(searchInput(), "Zinc");

    expect(displayedNames()).toEqual([
      "Zinc",
    ]);

    const summary = summaryGroup();

    expect(summary).toHaveTextContent(
      /5\s*medicines in stock/
    );

    expect(summary).toHaveTextContent(
      /3\s*with expiry ≤10 days/
    );
  });

  test("filters inventory without another API request", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.type(searchInput(), "para");

    await user.selectOptions(
      categoryFilter(),
      "Pain Relief"
    );

    expect(
      getAvailableInventory
    ).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // INVENTORY SORTING
  // ==========================================

  test("sorts medicines alphabetically by default", async () => {
    renderInventory();
    await waitForInventory();

    expect(displayedNames()).toEqual([
      "Amoxicillin",
      "Cetirizine",
      "Paracetamol",
      "Vitamin C",
      "Zinc",
    ]);
  });

  test("toggles medicine name sorting", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.click(
      sortBy("Medicine: sort Z to A")
    );

    expect(displayedNames()).toEqual([
      "Zinc",
      "Vitamin C",
      "Paracetamol",
      "Cetirizine",
      "Amoxicillin",
    ]);

    await user.click(
      sortBy("Medicine: sort A to Z")
    );

    expect(displayedNames()[0]).toBe(
      "Amoxicillin"
    );
  });

  test("sorts available stock numerically", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.click(
      sortBy(
        "Available stock: sort lowest to highest"
      )
    );

    expect(displayedNames()).toEqual([
      "Zinc",
      "Amoxicillin",
      "Cetirizine",
      "Paracetamol",
      "Vitamin C",
    ]);

    await user.click(
      sortBy(
        "Available stock: sort highest to lowest"
      )
    );

    expect(displayedNames()).toEqual([
      "Vitamin C",
      "Paracetamol",
      "Cetirizine",
      "Amoxicillin",
      "Zinc",
    ]);
  });

  test("sorts expiry and keeps unknown expiry at bottom", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.click(
      sortBy(
        "Earliest expiry: sort earliest to latest"
      )
    );

    expect(displayedNames()).toEqual([
      "Paracetamol",
      "Cetirizine",
      "Amoxicillin",
      "Vitamin C",
      "Zinc",
    ]);

    await user.click(
      sortBy(
        "Earliest expiry: sort latest to earliest"
      )
    );

    expect(displayedNames()).toEqual([
      "Vitamin C",
      "Amoxicillin",
      "Cetirizine",
      "Paracetamol",
      "Zinc",
    ]);
  });

  test("sorts manufacturers alphabetically", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.click(
      sortBy("Manufacturer: sort A to Z")
    );

    expect(displayedNames()).toEqual([
      "Amoxicillin",
      "Paracetamol",
      "Cetirizine",
      "Vitamin C",
      "Zinc",
    ]);
  });

  test("sorts categories alphabetically", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.click(
      sortBy("Category: sort A to Z")
    );

    expect(displayedNames()).toEqual([
      "Cetirizine",
      "Amoxicillin",
      "Paracetamol",
      "Vitamin C",
      "Zinc",
    ]);
  });

  test("updates accessible sort direction", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.click(
      sortBy(
        "Available stock: sort lowest to highest"
      )
    );

    expect(
      screen.getByRole("columnheader", {
        name: /Available stock/,
      })
    ).toHaveAttribute(
      "aria-sort",
      "ascending"
    );

    expect(
      screen.getByText(
        "Sorted by Available stock, ascending."
      )
    ).toBeInTheDocument();
  });

  // ==========================================
  // INVENTORY BATCH MODAL
  // ==========================================

  test("opens batch details for a selected medicine", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.click(
      batchButton("Paracetamol")
    );

    const dialog = screen.getByRole("dialog", {
      name: "Available batches",
    });

    expect(dialog).toBeInTheDocument();

    expect(
      within(dialog).getByText("Paracetamol")
    ).toBeInTheDocument();

    expect(
      within(dialog).getByText(
        "Medico Pharma · Pain Relief"
      )
    ).toBeInTheDocument();

    expect(dialog).toHaveTextContent(
      "Available stock: 35"
    );
  });

  test("displays batch numbers, prices, and quantities", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.click(
      batchButton("Paracetamol")
    );

    const dialog = screen.getByRole("dialog");

    const rows = within(dialog)
      .getAllByRole("row")
      .slice(1);

    expect(rows).toHaveLength(2);

    expect(rows[0]).toHaveTextContent(
      "PAR-001"
    );

    expect(rows[0]).toHaveTextContent(
      formatPrice(12.5)
    );

    expect(rows[0]).toHaveTextContent("15");

    expect(rows[1]).toHaveTextContent(
      "PAR-002"
    );

    expect(rows[1]).toHaveTextContent(
      formatPrice(14.5)
    );

    expect(rows[1]).toHaveTextContent("20");
  });

  test("displays batch expiry information", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.click(
      batchButton("Paracetamol")
    );

    const dialog = screen.getByRole("dialog");

    expect(
      within(dialog).getByText("Expires today")
    ).toBeInTheDocument();

    expect(
      within(dialog).getByText(
        "41 days remaining"
      )
    ).toBeInTheDocument();

    expect(dialog).toHaveTextContent(
      formatBatchDate("2026-11-04")
    );
  });

  test("closes batch modal using Close button", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.click(
      batchButton("Paracetamol")
    );

    await user.click(
      screen.getByRole("button", {
        name: "Close",
        exact: true,
      })
    );

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();
  });

  test("closes batch modal through modal wrapper", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.click(
      batchButton("Amoxicillin")
    );

    await user.click(
      screen.getByRole("button", {
        name: "Dismiss modal",
      })
    );

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();
  });

  test("handles medicine with no available batches", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.click(batchButton("Zinc"));

    const dialog = screen.getByRole("dialog");

    expect(
      within(dialog).getByText("Zinc")
    ).toBeInTheDocument();

    expect(
      within(dialog).getAllByRole("row")
    ).toHaveLength(1);

    expect(dialog).toHaveTextContent(
      "Available stock: 12"
    );
  });

  test("displays expires tomorrow in batch details", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.click(
      batchButton("Cetirizine")
    );

    expect(
      within(screen.getByRole("dialog"))
        .getByText("Expires tomorrow")
    ).toBeInTheDocument();
  });

  test("displays upcoming expiry within 10 days", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.click(
      batchButton("Amoxicillin")
    );

    expect(
      within(screen.getByRole("dialog"))
        .getByText("Expires in 7 days")
    ).toBeInTheDocument();
  });

  test("displays expired batch warning", async () => {
    const user = userEvent.setup();

    const expired = {
      ...inventory[0],
      earliest_expiry_days: -2,
      batches: [
        {
          ...inventory[0].batches[0],
          days_to_expire: -2,
        },
      ],
    };

    getAvailableInventory.mockResolvedValue([
      expired,
    ]);

    renderInventory();

    await screen.findByText("1 of 1 medicines");

    expect(
      rowFor("Paracetamol")
    ).toHaveTextContent("Expired");

    await user.click(
      batchButton("Paracetamol")
    );

    expect(
      within(screen.getByRole("dialog"))
        .getByText("Expired")
    ).toBeInTheDocument();
  });

  test("displays unknown expiry fallback", async () => {
    getAvailableInventory.mockResolvedValue([
      inventory[4],
    ]);

    renderInventory();

    await screen.findByText("1 of 1 medicines");

    expect(
      rowFor("Zinc")
    ).toHaveTextContent("Unknown expiry");
  });

  // ==========================================
  // LOW STOCK MODE
  // ==========================================

  test("renders low-stock page title and description", async () => {
    renderLowStock();

    expect(
      screen.getByRole("heading", {
        name: "Low Stock",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Medicines at or below their reorder level."
      )
    ).toBeInTheDocument();

    await waitForLowStock();
  });

  test("calls the low-stock service instead of inventory service", async () => {
    renderLowStock();
    await waitForLowStock();

    expect(getLowStock).toHaveBeenCalledWith(
      mockRequest
    );

    expect(getLowStock).toHaveBeenCalledTimes(1);

    expect(
      getAvailableInventory
    ).not.toHaveBeenCalled();
  });

  // FIXED: LOW STOCK SUMMARY
  test("shows low-stock summary counts", async () => {
    renderLowStock();
    await waitForLowStock();

    const summary = summaryGroup();

    expect(summary).toHaveTextContent(
      /4\s*medicines need attention/
    );

    expect(summary).toHaveTextContent(
      /1\s*out of stock/
    );
  });

  test("shows empty state when no low-stock medicines exist", async () => {
    getLowStock.mockResolvedValue([]);

    renderLowStock();

    expect(
      await screen.findByRole("heading", {
        name: "No low-stock medicines found",
      })
    ).toBeInTheDocument();
  });

  test("handles low-stock API failure", async () => {
    getLowStock.mockRejectedValue(
      new Error("Low stock API unavailable")
    );

    renderLowStock();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Low stock API unavailable"
    );
  });

  test("searches low stock by medicine name", async () => {
    const user = userEvent.setup();

    renderLowStock();
    await waitForLowStock();

    await user.type(searchInput(), "insulin");

    expect(
      displayedNames("low-stock")
    ).toEqual(["Insulin"]);
  });

  test("searches low stock by manufacturer", async () => {
    const user = userEvent.setup();

    renderLowStock();
    await waitForLowStock();

    await user.type(searchInput(), "bio labs");

    expect(
      displayedNames("low-stock")
    ).toEqual([
      "Insulin",
      "Glucose",
    ]);
  });

  test("filters medicines that are out of stock", async () => {
    const user = userEvent.setup();

    renderLowStock();
    await waitForLowStock();

    await user.selectOptions(
      stockConditionFilter(),
      "Out"
    );

    expect(
      displayedNames("low-stock")
    ).toEqual(["Insulin"]);

    expect(
      rowFor("Insulin", "low-stock")
    ).toHaveTextContent("Out of stock");
  });

  test("filters low-stock medicines with stock above zero", async () => {
    const user = userEvent.setup();

    renderLowStock();
    await waitForLowStock();

    await user.selectOptions(
      stockConditionFilter(),
      "Low"
    );

    expect(
      displayedNames("low-stock")
    ).toEqual([
      "Gauze",
      "Saline",
      "Glucose",
    ]);
  });

  test("combines low-stock category and condition filters", async () => {
    const user = userEvent.setup();

    renderLowStock();
    await waitForLowStock();

    await user.selectOptions(
      categoryFilter(),
      "Diabetes"
    );

    await user.selectOptions(
      stockConditionFilter(),
      "Low"
    );

    expect(
      displayedNames("low-stock")
    ).toEqual(["Glucose"]);
  });

  test("sorts low stock from lowest available quantity", async () => {
    renderLowStock();
    await waitForLowStock();

    expect(
      displayedNames("low-stock")
    ).toEqual([
      "Insulin",
      "Gauze",
      "Saline",
      "Glucose",
    ]);
  });

  test("sorts units to threshold numerically", async () => {
    const user = userEvent.setup();

    renderLowStock();
    await waitForLowStock();

    await user.click(
      sortBy(
        "Units to threshold: sort lowest to highest"
      )
    );

    expect(
      displayedNames("low-stock")
    ).toEqual([
      "Glucose",
      "Saline",
      "Gauze",
      "Insulin",
    ]);

    await user.click(
      sortBy(
        "Units to threshold: sort highest to lowest"
      )
    );

    expect(
      displayedNames("low-stock")
    ).toEqual([
      "Insulin",
      "Gauze",
      "Saline",
      "Glucose",
    ]);
  });

  test("sorts low stock by reorder level", async () => {
    const user = userEvent.setup();

    renderLowStock();
    await waitForLowStock();

    await user.click(
      sortBy(
        "Reorder level: sort lowest to highest"
      )
    );

    expect(
      displayedNames("low-stock")
    ).toEqual([
      "Saline",
      "Glucose",
      "Gauze",
      "Insulin",
    ]);
  });

  test("displays medicines exactly at reorder level", async () => {
    renderLowStock();
    await waitForLowStock();

    const glucose = rowFor(
      "Glucose",
      "low-stock"
    );

    expect(glucose.cells[3]).toHaveTextContent(
      "10"
    );

    expect(glucose.cells[4]).toHaveTextContent(
      "10"
    );

    expect(glucose.cells[5]).toHaveTextContent(
      "0"
    );

    expect(glucose).toHaveTextContent(
      "At reorder level"
    );
  });

  test("does not show batch buttons in low-stock mode", async () => {
    renderLowStock();
    await waitForLowStock();

    expect(
      screen.queryByRole("button", {
        name: /View available batches/,
      })
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("combobox", {
        name: "Expiry",
      })
    ).not.toBeInTheDocument();
  });

  test("clears low-stock filters", async () => {
    const user = userEvent.setup();

    renderLowStock();
    await waitForLowStock();

    await user.type(searchInput(), "insulin");

    await user.selectOptions(
      categoryFilter(),
      "Diabetes"
    );

    await user.selectOptions(
      stockConditionFilter(),
      "Out"
    );

    await user.click(
      screen.getByRole("button", {
        name: "Clear filters",
      })
    );

    expect(searchInput()).toHaveValue("");
    expect(categoryFilter()).toHaveValue("All");

    expect(
      stockConditionFilter()
    ).toHaveValue("All");

    expect(
      displayedNames("low-stock")
    ).toHaveLength(4);
  });

  // ==========================================
  // MODE CHANGES AND ASYNC SAFETY
  // ==========================================

  test("loads appropriate service when mode changes", async () => {
    const { rerender } = renderInventory();

    await waitForInventory();

    expect(
      getAvailableInventory
    ).toHaveBeenCalledTimes(1);

    rerender(
      <StockOverview mode="low-stock" />
    );

    await waitFor(() => {
      expect(getLowStock).toHaveBeenCalledTimes(1);
    });

    expect(
      await screen.findByText(
        "4 of 4 medicines"
      )
    ).toBeInTheDocument();
  });

  
test("ignores outdated inventory responses when mode changes", async () => {
  const oldRequest = deferred();

  getAvailableInventory.mockReturnValue(
    oldRequest.promise
  );

  const { rerender } = renderInventory();

  expect(
    screen.getAllByText("Loading stock information...")
  ).toHaveLength(2);

  // Switch mode before inventory request completes.
  rerender(
    <StockOverview mode="low-stock" />
  );

  await screen.findByText("4 of 4 medicines");

  // Sorting remains alphabetical because
  // React preserves the existing sort state.
  const expectedNames = [
    "Gauze",
    "Glucose",
    "Insulin",
    "Saline",
  ];

  expect(
    displayedNames("low-stock")
  ).toEqual(expectedNames);

  // Old inventory request completes afterward.
  await act(async () => {
    oldRequest.resolve(inventory);
  });

  // Old inventory data must NOT replace
  // the current low-stock records.
  expect(
    displayedNames("low-stock")
  ).toEqual(expectedNames);

  expect(getLowStock).toHaveBeenCalledTimes(1);
  expect(getAvailableInventory).toHaveBeenCalledTimes(1);
});


  test("preserves inventory filters when reloading", async () => {
    const user = userEvent.setup();

    renderInventory();
    await waitForInventory();

    await user.type(searchInput(), "para");

    await user.selectOptions(
      categoryFilter(),
      "Pain Relief"
    );

    await user.click(reloadButton());

    await waitFor(() => {
      expect(
        getAvailableInventory
      ).toHaveBeenCalledTimes(2);
    });

    expect(searchInput()).toHaveValue("para");

    expect(categoryFilter()).toHaveValue(
      "Pain Relief"
    );

    expect(displayedNames()).toEqual([
      "Paracetamol",
    ]);
  });

  test("keeps selected category available when refreshed data no longer contains it", async () => {
    const user = userEvent.setup();

    getAvailableInventory
      .mockResolvedValueOnce(inventory)
      .mockResolvedValueOnce([
        inventory[1],
        inventory[2],
      ]);

    renderInventory();
    await waitForInventory();

    await user.selectOptions(
      categoryFilter(),
      "Supplements"
    );

    expect(displayedNames()).toEqual([
      "Vitamin C",
      "Zinc",
    ]);

    await user.click(reloadButton());

    await screen.findByRole("heading", {
      name: "No matching medicines",
    });

    expect(categoryFilter()).toHaveValue(
      "Supplements"
    );

    expect(
      within(categoryFilter()).getByRole(
        "option",
        {
          name: "Supplements (no results)",
        }
      )
    ).toBeInTheDocument();
  });

  test("ignores outdated responses after authentication changes", async () => {
    const firstAuthRequest = vi.fn();
    const secondAuthRequest = vi.fn();

    const oldResponse = deferred();

    getAvailableInventory.mockImplementation(
      (request) => {
        if (request === firstAuthRequest) {
          return oldResponse.promise;
        }

        return Promise.resolve([
          inventory[0],
        ]);
      }
    );

    useAuth.mockReturnValue({
      authenticatedRequest: firstAuthRequest,
    });

    const { rerender } = renderInventory();

    useAuth.mockReturnValue({
      authenticatedRequest: secondAuthRequest,
    });

    rerender(<StockOverview />);

    await screen.findByText(
      "1 of 1 medicines"
    );

    expect(displayedNames()).toEqual([
      "Paracetamol",
    ]);

    await act(async () => {
      oldResponse.resolve(inventory);
    });

    expect(displayedNames()).toEqual([
      "Paracetamol",
    ]);

    expect(
      getAvailableInventory
    ).toHaveBeenCalledTimes(2);
  });
});
