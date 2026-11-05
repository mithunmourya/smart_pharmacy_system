
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

import CustomerDashboard from "./CustomerDashboard";
import useAuth from "../../hooks/useAuth";

import {
  getMyPurchases,
} from "../../services/purchase.service";

// =============================================
// MOCK DEPENDENCIES
// =============================================

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

vi.mock("../../services/purchase.service", () => ({
  getMyPurchases: vi.fn(),
}));

// Mock only the shared table presentation.
// The dashboard still calculates its own
// totals, ordering, and recent purchases.

vi.mock("../../components/CompactInventoryUI", () => ({
  CompactTable: ({
    title,
    columns,
    children,
    loading,
    error,
    count,
    total,
    emptyMessage,
    onReload,
  }) => (
    <section aria-label={title}>
      <button
        type="button"
        onClick={onReload}
        disabled={loading}
      >
        Reload purchase history
      </button>

      {loading ? (
        <p>Loading purchase history...</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          <p>
            {count} of {total} purchases displayed
          </p>

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

// Mock the sale details modal.
// Its internal behavior belongs in its
// own test file.

vi.mock("../../components/sales/SaleDetailsModal", () => ({
  default: ({
    saleId,
    audience,
    onClose,
  }) => (
    <section
      role="dialog"
      aria-label="Purchase details"
    >
      <p>Selected purchase: {saleId}</p>
      <p>Audience: {audience}</p>

      <button
        type="button"
        onClick={onClose}
      >
        Close purchase details
      </button>
    </section>
  ),
}));

// =============================================
// CUSTOMER DATA
// =============================================

const customer = {
  user_id: 21,
  name: "Ravi Kumar",
  email: "ravi@example.com",
  role: "Customer",
};

const mockRequest = vi.fn();

// =============================================
// PURCHASE DATA
// =============================================

// Intentionally unsorted data.
// Two purchases share the same timestamp,
// allowing us to verify sale_id tie-breaking.

const purchases = [
  {
    sale_id: 12,
    total_amount: 100.10,
    payment_mode: "Cash",
    created_at: "2026-11-03T05:30:00.000Z",
  },
  {
    sale_id: 10,
    total_amount: 50.25,
    payment_mode: "Card",
    created_at: "2026-11-01T10:00:00.000Z",
  },
  {
    sale_id: 16,
    total_amount: 75.40,
    payment_mode: "UPI",
    created_at: "2026-11-04T03:00:00.000Z",
  },
  {
    sale_id: 15,
    total_amount: 12.25,
    payment_mode: "Cash",
    created_at: "2026-11-02T00:30:00.000Z",
  },
  {
    sale_id: 19,
    total_amount: 20,
    payment_mode: "UPI",
    created_at: "2026-11-04T03:00:00.000Z",
  },
  {
    sale_id: 5,
    total_amount: 34,
    payment_mode: "Card",
    created_at: "2026-10-31T13:00:00.000Z",
  },
  {
    sale_id: 20,
    total_amount: 1.10,
    payment_mode: "Cash",
    created_at: "2026-10-30T13:00:00.000Z",
  },
];

// Expected total: ₹293.10
// Expected purchase count: 7
// Latest purchase: #19
// Recent five: #19, #16, #12, #15, #10

const dateFormatter = new Intl.DateTimeFormat(
  "en-IN",
  {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }
);

const dateTimeFormatter = new Intl.DateTimeFormat(
  "en-IN",
  {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }
);

// =============================================
// HELPER FUNCTIONS
// =============================================

function renderDashboard() {
  return render(
    <MemoryRouter>
      <CustomerDashboard />
    </MemoryRouter>
  );
}

async function renderReady() {
  const result = renderDashboard();

  await waitFor(() => {
    expect(refreshButton()).toBeEnabled();
  });

  return result;
}

function metric(label) {
  return screen
    .getByRole("heading", { name: label })
    .closest("section");
}

function profile() {
  return screen
    .getByRole("heading", {
      name: "Your profile",
    })
    .closest("section");
}

function purchaseSection() {
  return screen
    .getByRole("heading", {
      name: "Recent purchases",
    })
    .closest("section");
}

function purchaseTable() {
  return screen.getByRole("table", {
    name: "Your purchase history",
  });
}

function purchaseRows() {
  return within(purchaseTable())
    .getAllByRole("row")
    .slice(1);
}

function displayedPurchaseIds() {
  return purchaseRows().map((row) =>
    row.cells[0].textContent.trim()
  );
}

function refreshButton() {
  return screen.getByRole("button", {
    name: "Refresh dashboard",
  });
}

function reloadTableButton() {
  return screen.getByRole("button", {
    name: "Reload purchase history",
  });
}

function purchaseDetailsButton(saleId) {
  return screen.getByRole("button", {
    name: `View medicines for purchase ${saleId}`,
  });
}

function deferred() {
  let resolve;
  let reject;

  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

// =============================================
// CUSTOMER DASHBOARD TESTS
// =============================================

describe("CustomerDashboard", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    useAuth.mockReturnValue({
      user: customer,
      authenticatedRequest: mockRequest,
    });

    getMyPurchases.mockResolvedValue(purchases);
  });

  // ===========================================
  // 1. PAGE RENDERING
  // ===========================================

  test("renders customer dashboard heading", async () => {
    await renderReady();

    expect(
      screen.getByRole("heading", {
        name: "Dashboard",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText("Your pharmacy")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 2. WELCOME MESSAGE
  // ===========================================

  test("displays authenticated customer name", async () => {
    await renderReady();

    expect(
      screen.getByText(
        /Welcome back, Ravi Kumar/
      )
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        /View your purchases and manage your account/
      )
    ).toBeInTheDocument();
  });

  // ===========================================
  // 3. AUTHENTICATED API REQUEST
  // ===========================================

  test("fetches purchases using authenticated request", async () => {
    await renderReady();

    expect(
      getMyPurchases
    ).toHaveBeenCalledWith(mockRequest);

    expect(
      getMyPurchases
    ).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 4. INITIAL LOADING STATE
  // ===========================================

  test("displays loading state while fetching purchases", async () => {
    const request = deferred();

    getMyPurchases.mockReturnValue(
      request.promise
    );

    renderDashboard();

    expect(
      metric("Total purchases")
    ).toHaveTextContent("Loading...");

    expect(
      metric("Total amount spent")
    ).toHaveTextContent("Loading...");

    expect(
      metric("Most recent purchase")
    ).toHaveTextContent("Loading...");

    expect(
      screen.getByText(
        "Loading purchase history..."
      )
    ).toBeInTheDocument();

    expect(refreshButton()).toBeDisabled();

    expect(
      refreshButton()
    ).toHaveTextContent("Refreshing...");

    await act(async () => {
      request.resolve(purchases);
    });

    expect(
      metric("Total purchases")
    ).toHaveTextContent("7");

    expect(refreshButton()).toBeEnabled();
  });

  // ===========================================
  // 5. LOADING ACCESSIBILITY
  // ===========================================

  test("marks summary cards busy during loading", async () => {
    const request = deferred();

    getMyPurchases.mockReturnValue(
      request.promise
    );

    renderDashboard();

    expect(
      metric("Total purchases")
    ).toHaveAttribute("aria-busy", "true");

    expect(
      metric("Total amount spent")
    ).toHaveAttribute("aria-busy", "true");

    expect(
      metric("Most recent purchase")
    ).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      request.resolve(purchases);
    });

    expect(
      metric("Total purchases")
    ).toHaveAttribute("aria-busy", "false");
  });

  // ===========================================
  // 6. TOTAL PURCHASE COUNT
  // ===========================================

  test("calculates total purchase count", async () => {
    await renderReady();

    expect(
      within(metric("Total purchases"))
        .getByText("7")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 7. TOTAL AMOUNT
  // ===========================================

  test("calculates total amount spent", async () => {
    await renderReady();

    expect(
      metric("Total amount spent")
    ).toHaveTextContent("₹293.10");
  });

  // ===========================================
  // 8. MOST RECENT PURCHASE
  // ===========================================

  test("displays most recent purchase information", async () => {
    await renderReady();

    const latest = metric(
      "Most recent purchase"
    );

    expect(latest).toHaveTextContent(
      "Purchase #19"
    );

    expect(latest).toHaveTextContent(
      "₹20.00"
    );

    expect(latest).toHaveTextContent(
      dateFormatter.format(
        new Date(
          "2026-11-04T03:00:00.000Z"
        )
      )
    );
  });

  // ===========================================
  // 9. LATEST PURCHASE NOT ARRAY ORDER
  // ===========================================

  test("finds latest purchase even when API data is unsorted", async () => {
    await renderReady();

    expect(
      metric("Most recent purchase")
    ).toHaveTextContent("Purchase #19");

    // First API record is purchase #12.
    expect(purchases[0].sale_id).toBe(12);
  });

  // ===========================================
  // 10. SORT PURCHASES BY DATE
  // ===========================================

  test("sorts recent purchases newest first", async () => {
    await renderReady();

    expect(
      displayedPurchaseIds()
    ).toEqual([
      "#19",
      "#16",
      "#12",
      "#15",
      "#10",
    ]);
  });

  // ===========================================
  // 11. SAME TIMESTAMP TIE-BREAKING
  // ===========================================

  test("sorts equal purchase dates by descending sale ID", async () => {
    await renderReady();

    // #19 and #16 have identical timestamps.
    expect(
      displayedPurchaseIds().slice(0, 2)
    ).toEqual([
      "#19",
      "#16",
    ]);
  });

  // ===========================================
  // 12. DISPLAY LIMIT
  // ===========================================

  test("limits recent purchases to five records", async () => {
    await renderReady();

    expect(purchaseRows()).toHaveLength(5);

    expect(
      purchaseSection()
    ).toHaveTextContent(
      "5 of 7 purchases displayed"
    );

    expect(
      displayedPurchaseIds()
    ).not.toContain("#5");

    expect(
      displayedPurchaseIds()
    ).not.toContain("#20");
  });

  // ===========================================
  // 13. RECENT PURCHASE TABLE VALUES
  // ===========================================

  test("displays payment mode and amount in recent purchases", async () => {
    await renderReady();

    const firstRow = purchaseRows()[0];

    expect(firstRow.cells[0]).toHaveTextContent(
      "#19"
    );

    expect(firstRow.cells[2]).toHaveTextContent(
      "UPI"
    );

    expect(firstRow.cells[3]).toHaveTextContent(
      "₹20.00"
    );
  });

  // ===========================================
  // 14. INDIA TIMEZONE
  // ===========================================

  test("formats purchase dates using India timezone", async () => {
    await renderReady();

    const firstRow = purchaseRows()[0];

    const expected = dateTimeFormatter.format(
      new Date(
        "2026-11-04T03:00:00.000Z"
      )
    );

    expect(
      firstRow.cells[1]
    ).toHaveTextContent(expected);
  });

  // ===========================================
  // 15. PURCHASE TABLE HEADERS
  // ===========================================

  test("renders purchase table columns", async () => {
    await renderReady();

    const table = purchaseTable();

    expect(
      within(table).getByRole("columnheader", {
        name: "Purchase ID",
      })
    ).toBeInTheDocument();

    expect(
      within(table).getByRole("columnheader", {
        name: "Date · IST",
      })
    ).toBeInTheDocument();

    expect(
      within(table).getByRole("columnheader", {
        name: "Payment",
      })
    ).toBeInTheDocument();

    expect(
      within(table).getByRole("columnheader", {
        name: "Amount",
      })
    ).toBeInTheDocument();

    expect(
      within(table).getByRole("columnheader", {
        name: "Actions",
      })
    ).toBeInTheDocument();
  });

  // ===========================================
  // 16. ALL PURCHASES VS RECENT PURCHASES
  // ===========================================

  test("counts all purchases even though only five are displayed", async () => {
    await renderReady();

    expect(
      metric("Total purchases")
    ).toHaveTextContent("7");

    expect(purchaseRows()).toHaveLength(5);

    expect(
      metric("Total amount spent")
    ).toHaveTextContent("₹293.10");
  });

  // ===========================================
  // 17. SINGLE PURCHASE
  // ===========================================

  test("handles a customer with one purchase", async () => {
    getMyPurchases.mockResolvedValue([
      purchases[0],
    ]);

    await renderReady();

    expect(
      metric("Total purchases")
    ).toHaveTextContent("1");

    expect(
      metric("Total amount spent")
    ).toHaveTextContent("₹100.10");

    expect(
      metric("Most recent purchase")
    ).toHaveTextContent("Purchase #12");

    expect(displayedPurchaseIds()).toEqual([
      "#12",
    ]);
  });

  // ===========================================
  // 18. EMPTY PURCHASE HISTORY
  // ===========================================

  test("handles a customer with no purchases", async () => {
    getMyPurchases.mockResolvedValue([]);

    await renderReady();

    expect(
      metric("Total purchases")
    ).toHaveTextContent("0");

    expect(
      metric("Total amount spent")
    ).toHaveTextContent("₹0.00");

    expect(
      metric("Most recent purchase")
    ).toHaveTextContent("No purchases yet");

    expect(
      screen.getByText(
        /Purchases linked to your account will appear here/
      )
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("table", {
        name: "Your purchase history",
      })
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 19. ZERO AMOUNT PURCHASE
  // ===========================================

  test("accepts a purchase with zero total amount", async () => {
    getMyPurchases.mockResolvedValue([
      {
        ...purchases[0],
        total_amount: 0,
      },
    ]);

    await renderReady();

    expect(
      metric("Total amount spent")
    ).toHaveTextContent("₹0.00");

    expect(
      metric("Total purchases")
    ).toHaveTextContent("1");

    expect(
      metric("Most recent purchase")
    ).toHaveTextContent("₹0.00");
  });

  // ===========================================
  // 20. NO UNNECESSARY REFETCH
  // ===========================================

  test("does not refetch purchases when rendering summary", async () => {
    await renderReady();

    expect(
      getMyPurchases
    ).toHaveBeenCalledTimes(1);

    expect(
      metric("Total purchases")
    ).toHaveTextContent("7");

    expect(
      metric("Total amount spent")
    ).toHaveTextContent("₹293.10");

    expect(
      getMyPurchases
    ).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // PURCHASE DETAILS MODAL
  // ===========================================

  test("opens selected purchase details with customer audience", async () => {
    const user = userEvent.setup();

    await renderReady();

    await user.click(
      purchaseDetailsButton(19)
    );

    const dialog = screen.getByRole("dialog", {
      name: "Purchase details",
    });

    expect(dialog).toHaveTextContent(
      "Selected purchase: 19"
    );

    expect(dialog).toHaveTextContent(
      "Audience: customer"
    );
  });

  test("opens details for the correct purchase ID", async () => {
    const user = userEvent.setup();

    await renderReady();

    await user.click(
      purchaseDetailsButton(12)
    );

    expect(
      screen.getByRole("dialog")
    ).toHaveTextContent(
      "Selected purchase: 12"
    );
  });

  test("closes purchase details when Close is clicked", async () => {
    const user = userEvent.setup();

    await renderReady();

    await user.click(
      purchaseDetailsButton(19)
    );

    expect(
      screen.getByRole("dialog")
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Close purchase details",
      })
    );

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();
  });

  test("can reopen purchase details after closing", async () => {
    const user = userEvent.setup();

    await renderReady();

    await user.click(
      purchaseDetailsButton(19)
    );

    await user.click(
      screen.getByRole("button", {
        name: "Close purchase details",
      })
    );

    await user.click(
      purchaseDetailsButton(16)
    );

    expect(
      screen.getByRole("dialog")
    ).toHaveTextContent(
      "Selected purchase: 16"
    );
  });

  // ===========================================
  // PROFILE INFORMATION
  // ===========================================

  test("displays customer profile details", async () => {
    await renderReady();

    const account = profile();

    expect(account).toHaveTextContent(
      "Full name"
    );

    expect(account).toHaveTextContent(
      "Ravi Kumar"
    );

    expect(account).toHaveTextContent(
      "Email address"
    );

    expect(account).toHaveTextContent(
      "ravi@example.com"
    );

    expect(account).toHaveTextContent(
      "Account role"
    );

    expect(account).toHaveTextContent(
      "Customer"
    );
  });

  test("generates initials from first two name parts", async () => {
    await renderReady();

    expect(
      within(profile()).getByText("RK")
    ).toBeInTheDocument();
  });

  test("generates uppercase initials from names containing spaces", async () => {
    useAuth.mockReturnValue({
      user: {
        ...customer,
        name: "  priya   sharma   reddy ",
      },
      authenticatedRequest: mockRequest,
    });

    await renderReady();

    expect(
      within(profile()).getByText("PS")
    ).toBeInTheDocument();
  });

  test("handles a customer with a single name", async () => {
    useAuth.mockReturnValue({
      user: {
        ...customer,
        name: "Anita",
      },
      authenticatedRequest: mockRequest,
    });

    await renderReady();

    expect(
      within(profile()).getByText("A")
    ).toBeInTheDocument();
  });

  test("uses fallback initial U for blank name", async () => {
    useAuth.mockReturnValue({
      user: {
        ...customer,
        name: " ",
      },
      authenticatedRequest: mockRequest,
    });

    await renderReady();

    expect(
      within(profile()).getByText("U")
    ).toBeInTheDocument();
  });

  // ===========================================
  // NAVIGATION
  // ===========================================

  test("links View all to purchase history", async () => {
    await renderReady();

    expect(
      screen.getByRole("link", {
        name: "View all",
      })
    ).toHaveAttribute(
      "href",
      "/my-purchases"
    );
  });

  test("links customer profile and password settings", async () => {
    await renderReady();

    expect(
      screen.getByRole("link", {
        name: "My Profile",
      })
    ).toHaveAttribute(
      "href",
      "/profile"
    );

    expect(
      screen.getByRole("link", {
        name: "Change Password",
      })
    ).toHaveAttribute(
      "href",
      "/settings/change-password"
    );
  });

  test("shows guidance about registered purchases", async () => {
    await renderReady();

    expect(
      screen.getByText(
        "Keep your purchase history together"
      )
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        /Purchases recorded as walk-in sales/
      )
    ).toBeInTheDocument();
  });

  // ===========================================
  // API ERRORS
  // ===========================================

  test("displays API error when purchase request fails", async () => {
    getMyPurchases.mockRejectedValue(
      new Error("Purchase service unavailable")
    );

    await renderReady();

    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Purchase service unavailable"
    );

    expect(
      metric("Total purchases")
    ).toHaveTextContent("Unavailable");

    expect(
      metric("Total amount spent")
    ).toHaveTextContent("Unavailable");

    expect(
      metric("Most recent purchase")
    ).toHaveTextContent("Unavailable");
  });

  test("displays fallback error when API message is empty", async () => {
    getMyPurchases.mockRejectedValue(
      new Error("")
    );

    await renderReady();

    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Unable to load your purchase history."
    );
  });

  test("removes loading state after API failure", async () => {
    getMyPurchases.mockRejectedValue(
      new Error("Network error")
    );

    await renderReady();

    expect(refreshButton()).toBeEnabled();

    expect(
      screen.queryByText(
        "Loading purchase history..."
      )
    ).not.toBeInTheDocument();

    expect(
      metric("Total purchases")
    ).toHaveAttribute("aria-busy", "false");
  });

  test("does not display stale purchases on API failure", async () => {
    getMyPurchases.mockRejectedValue(
      new Error("Server unavailable")
    );

    await renderReady();

    expect(
      screen.queryByRole("table", {
        name: "Your purchase history",
      })
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    expect(
      metric("Total amount spent")
    ).toHaveTextContent("Unavailable");
  });

  // ===========================================
  // INVALID API DATA
  // ===========================================

  test.each([
    [
      "zero sale ID",
      { sale_id: 0 },
    ],
    [
      "negative sale ID",
      { sale_id: -1 },
    ],
    [
      "non-integer sale ID",
      { sale_id: 1.5 },
    ],
    [
      "string sale ID",
      { sale_id: "12" },
    ],
    [
      "unsafe sale ID",
      { sale_id: Number.MAX_SAFE_INTEGER + 1 },
    ],
    [
      "negative total amount",
      { total_amount: -10 },
    ],
    [
      "NaN total amount",
      { total_amount: NaN },
    ],
    [
      "infinite total amount",
      { total_amount: Infinity },
    ],
    [
      "missing purchase date",
      { created_at: "" },
    ],
    [
      "invalid purchase date",
      { created_at: "invalid-date" },
    ],
  ])(
    "rejects purchase containing %s",
    async (_description, changes) => {
      getMyPurchases.mockResolvedValue([
        {
          ...purchases[0],
          ...changes,
        },
      ]);

      await renderReady();

      expect(
        screen.getByRole("alert")
      ).toHaveTextContent(
        "Some purchase details could not be read. Please try again."
      );

      expect(
        metric("Total purchases")
      ).toHaveTextContent("Unavailable");

      expect(
        metric("Total amount spent")
      ).toHaveTextContent("Unavailable");

      expect(
        metric("Most recent purchase")
      ).toHaveTextContent("Unavailable");
    }
  );

  // ===========================================
  // REFRESH
  // ===========================================

  test("refreshes purchase history when Refresh is clicked", async () => {
    const user = userEvent.setup();

    await renderReady();

    expect(
      getMyPurchases
    ).toHaveBeenCalledTimes(1);

    await user.click(refreshButton());

    await waitFor(() => {
      expect(
        getMyPurchases
      ).toHaveBeenCalledTimes(2);
    });

    expect(refreshButton()).toBeEnabled();
  });

  test("refreshes purchase history from the table reload button", async () => {
    const user = userEvent.setup();

    await renderReady();

    await user.click(reloadTableButton());

    await waitFor(() => {
      expect(
        getMyPurchases
      ).toHaveBeenCalledTimes(2);
    });
  });

  test("updates totals when refreshed purchases change", async () => {
    const user = userEvent.setup();

    const updatedPurchases = [
      {
        sale_id: 101,
        total_amount: 250.75,
        payment_mode: "UPI",
        created_at: "2026-11-04T08:00:00.000Z",
      },
      {
        sale_id: 102,
        total_amount: 49.25,
        payment_mode: "Cash",
        created_at: "2026-11-04T09:00:00.000Z",
      },
    ];

    getMyPurchases
      .mockResolvedValueOnce(purchases)
      .mockResolvedValueOnce(updatedPurchases);

    await renderReady();

    expect(
      metric("Total purchases")
    ).toHaveTextContent("7");

    await user.click(refreshButton());

    await waitFor(() => {
      expect(
        metric("Total amount spent")
      ).toHaveTextContent("₹300.00");
    });

    expect(
      metric("Total purchases")
    ).toHaveTextContent("2");

    expect(
      metric("Most recent purchase")
    ).toHaveTextContent("Purchase #102");

    expect(
      displayedPurchaseIds()
    ).toEqual([
      "#102",
      "#101",
    ]);
  });

  test("closes purchase details when refreshing", async () => {
    const user = userEvent.setup();

    await renderReady();

    await user.click(
      purchaseDetailsButton(19)
    );

    expect(
      screen.getByRole("dialog")
    ).toBeInTheDocument();

    await user.click(refreshButton());

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(
        getMyPurchases
      ).toHaveBeenCalledTimes(2);
    });
  });

  test("disables refresh while an API request is pending", async () => {
    const request = deferred();

    getMyPurchases.mockReturnValue(
      request.promise
    );

    renderDashboard();

    expect(refreshButton()).toBeDisabled();
    expect(reloadTableButton()).toBeDisabled();

    expect(
      getMyPurchases
    ).toHaveBeenCalledTimes(1);

    await act(async () => {
      request.resolve(purchases);
    });

    expect(refreshButton()).toBeEnabled();
    expect(reloadTableButton()).toBeEnabled();

    expect(
      getMyPurchases
    ).toHaveBeenCalledTimes(1);
  });

  test("retries successfully after an API failure", async () => {
    const user = userEvent.setup();

    getMyPurchases
      .mockRejectedValueOnce(
        new Error("Temporary API failure")
      )
      .mockResolvedValueOnce(purchases);

    await renderReady();

    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Temporary API failure"
    );

    await user.click(refreshButton());

    await waitFor(() => {
      expect(
        metric("Total amount spent")
      ).toHaveTextContent("₹293.10");
    });

    expect(
      metric("Total purchases")
    ).toHaveTextContent("7");

    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();

    expect(
      getMyPurchases
    ).toHaveBeenCalledTimes(2);
  });

  test("shows an error when a refresh request fails", async () => {
    const user = userEvent.setup();

    getMyPurchases
      .mockResolvedValueOnce(purchases)
      .mockRejectedValueOnce(
        new Error("Refresh failed")
      );

    await renderReady();

    expect(
      metric("Total purchases")
    ).toHaveTextContent("7");

    await user.click(refreshButton());

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Refresh failed");

    expect(
      metric("Total purchases")
    ).toHaveTextContent("Unavailable");

    expect(
      screen.queryByRole("table", {
        name: "Your purchase history",
      })
    ).not.toBeInTheDocument();
  });

  test("shows updated timestamp after successful loading", async () => {
    await renderReady();

    expect(
      screen.getByText(/^Updated .* IST$/)
    ).toBeInTheDocument();
  });

  test("does not show updated timestamp after API failure", async () => {
    getMyPurchases.mockRejectedValue(
      new Error("Request failed")
    );

    await renderReady();

    expect(
      screen.queryByText(/^Updated .* IST$/)
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // AUTHENTICATION CHANGES
  // ===========================================

  test("reloads purchases when authenticated request changes", async () => {
    const firstRequest = vi.fn();
    const secondRequest = vi.fn();

    useAuth.mockReturnValue({
      user: customer,
      authenticatedRequest: firstRequest,
    });

    const { rerender } = await renderReady();

    expect(
      getMyPurchases
    ).toHaveBeenCalledWith(firstRequest);

    useAuth.mockReturnValue({
      user: customer,
      authenticatedRequest: secondRequest,
    });

    rerender(
      <MemoryRouter>
        <CustomerDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        getMyPurchases
      ).toHaveBeenCalledWith(secondRequest);
    });

    expect(
      getMyPurchases
    ).toHaveBeenCalledTimes(2);
  });

  test("ignores stale purchase responses after authentication changes", async () => {
    const oldAuthRequest = vi.fn();
    const newAuthRequest = vi.fn();

    const oldResponse = deferred();

    const newPurchases = [
      {
        sale_id: 300,
        total_amount: 123.45,
        payment_mode: "UPI",
        created_at: "2026-11-04T12:00:00.000Z",
      },
    ];

    getMyPurchases.mockImplementation(
      (request) => {
        if (request === oldAuthRequest) {
          return oldResponse.promise;
        }

        return Promise.resolve(newPurchases);
      }
    );

    useAuth.mockReturnValue({
      user: customer,
      authenticatedRequest: oldAuthRequest,
    });

    const { rerender } = renderDashboard();

    expect(
      metric("Total purchases")
    ).toHaveTextContent("Loading...");

    // Switch authenticated request while
    // the previous request is still pending.
    useAuth.mockReturnValue({
      user: customer,
      authenticatedRequest: newAuthRequest,
    });

    rerender(
      <MemoryRouter>
        <CustomerDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        metric("Total amount spent")
      ).toHaveTextContent("₹123.45");
    });

    expect(
      displayedPurchaseIds()
    ).toEqual(["#300"]);

    // Previous request now finishes.
    await act(async () => {
      oldResponse.resolve(purchases);
    });

    // Old account data must not overwrite
    // the current authenticated session.
    expect(
      metric("Total amount spent")
    ).toHaveTextContent("₹123.45");

    expect(
      metric("Total purchases")
    ).toHaveTextContent("1");

    expect(
      displayedPurchaseIds()
    ).toEqual(["#300"]);

    expect(
      getMyPurchases
    ).toHaveBeenCalledTimes(2);
  });

  test("ignores stale errors after authentication changes", async () => {
    const oldAuthRequest = vi.fn();
    const newAuthRequest = vi.fn();

    const oldResponse = deferred();

    getMyPurchases.mockImplementation(
      (request) => {
        if (request === oldAuthRequest) {
          return oldResponse.promise;
        }

        return Promise.resolve([
          purchases[0],
        ]);
      }
    );

    useAuth.mockReturnValue({
      user: customer,
      authenticatedRequest: oldAuthRequest,
    });

    const { rerender } = renderDashboard();

    useAuth.mockReturnValue({
      user: customer,
      authenticatedRequest: newAuthRequest,
    });

    rerender(
      <MemoryRouter>
        <CustomerDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        metric("Total amount spent")
      ).toHaveTextContent("₹100.10");
    });

    // Previous request fails after the
    // new session has already loaded.
    await act(async () => {
      oldResponse.reject(
        new Error("Old session failed")
      );
    });

    expect(
      metric("Total amount spent")
    ).toHaveTextContent("₹100.10");

    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();

    expect(
      getMyPurchases
    ).toHaveBeenCalledTimes(2);
  });
});
