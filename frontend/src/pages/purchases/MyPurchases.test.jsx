
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
  waitFor,
  act,
  within,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import MyPurchases from "./MyPurchases";
import useAuth from "../../hooks/useAuth";
import { getMyPurchases } from "../../services/purchase.service";
import { formatPrice } from "../../utils/batch";

// =============================================
// MOCK DEPENDENCIES
// =============================================

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

vi.mock("../../services/purchase.service", () => ({
  getMyPurchases: vi.fn(),
}));

// SaleDetailsModal has already been tested.
// Here we test how MyPurchases opens it.
vi.mock("../../components/sales/SaleDetailsModal", () => ({
  default: ({ saleId, audience, onClose }) => (
    <div
      role="dialog"
      aria-label={`Purchase medicines ${saleId}`}
    >
      <p>Purchase ID: {saleId}</p>
      <p>Audience: {audience}</p>

      <button type="button" onClick={onClose}>
        Close details
      </button>
    </div>
  ),
}));

// Mock shared UI components so these tests
// focus on MyPurchases.jsx business logic.
vi.mock("../../components/CompactInventoryUI", () => ({
  CompactHeader: ({
    title,
    description,
    summary,
    children,
  }) => (
    <header>
      <h1>{title}</h1>
      <p>{description}</p>
      <div>{summary}</div>
      {children}
    </header>
  ),

  SummaryBadge: ({ count, children }) => (
    <span>
      {count} {children}
    </span>
  ),

  FilterField: ({
    id,
    label,
    children,
    type = "text",
    ...props
  }) => (
    <div>
      <label htmlFor={id}>{label}</label>

      {children ? (
        <select id={id} {...props}>
          {children}
        </select>
      ) : (
        <input id={id} type={type} {...props} />
      )}
    </div>
  ),

  CompactTable: ({
    title,
    columns,
    onSort,
    onReload,
    loading,
    error,
    count,
    hasFilters,
    onClearFilters,
    emptyMessage,
    children,
  }) => {
    if (loading) {
      return <p role="status">Loading purchases...</p>;
    }

    if (error) {
      return (
        <section>
          <p role="alert">{error}</p>

          <button type="button" onClick={onReload}>
            Reload purchases
          </button>
        </section>
      );
    }

    return (
      <section>
        <button type="button" onClick={onReload}>
          Reload purchases
        </button>

        {hasFilters && (
          <button
            type="button"
            onClick={onClearFilters}
          >
            Clear filters
          </button>
        )}

        {count === 0 && (
          <p>
            {hasFilters
              ? "No matching purchases"
              : emptyMessage}
          </p>
        )}

        <table aria-label={title}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>
                  {column.sortable === false ? (
                    column.label
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSort(column.key)}
                    >
                      {column.label}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>{children}</tbody>
        </table>
      </section>
    );
  },
}));

// =============================================
// TEST DATA
// =============================================

const purchases = [
  {
    sale_id: 101,
    payment_mode: "Cash",
    total_amount: 100.25,
    pharmacist_name: "Ravi",
    created_at: "2026-01-10T10:00:00.000Z",
  },
  {
    sale_id: 102,
    payment_mode: "UPI",
    total_amount: 50.5,
    pharmacist_name: "Meena",
    created_at: "2026-03-15T10:00:00.000Z",
  },
  {
    sale_id: 103,
    payment_mode: "Card",
    total_amount: 70,
    pharmacist_name: "Ravi",
    created_at: "2026-02-01T10:00:00.000Z",
  },
  {
    sale_id: 104,
    payment_mode: "Cash",
    total_amount: 25.1,
    pharmacist_name: "Meena",
    created_at: "2026-04-01T10:00:00.000Z",
  },
  {
    sale_id: 105,
    payment_mode: "Card",
    total_amount: 10,
    pharmacist_name: "Ravi",
    created_at: null,
  },
];

const mockRequest = vi.fn();

// =============================================
// HELPER FUNCTIONS
// =============================================

function renderPurchases() {
  return render(<MyPurchases />);
}

async function waitForPurchases(count = 5) {
  await screen.findByText(`${count} Purchases`);
}

function displayedPurchaseIds() {
  const table = screen.getByRole("table", {
    name: "Purchase history",
  });

  return Array.from(
    table.querySelectorAll("tbody tr")
  ).map((row) => row.cells[0].textContent.trim());
}

function searchInput() {
  return screen.getByRole("searchbox", {
    name: "Search purchases",
  });
}

function paymentFilter() {
  return screen.getByRole("combobox", {
    name: "Payment mode",
  });
}

function sortButton(name) {
  return screen.getByRole("button", { name });
}

function viewButton(id) {
  return screen.getByRole("button", {
    name: `View medicines for purchase ${id}`,
  });
}

// =============================================
// MY PURCHASES TESTS
// =============================================

describe("MyPurchases", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    useAuth.mockReturnValue({
      authenticatedRequest: mockRequest,
    });

    getMyPurchases.mockResolvedValue(purchases);
  });

  // ===========================================
  // 1. INITIAL LOADING
  // ===========================================

  test("shows loading state while fetching purchases", async () => {
    let resolvePurchases;

    getMyPurchases.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePurchases = resolve;
        })
    );

    renderPurchases();

    expect(
      screen.getByText("Loading purchases...")
    ).toBeInTheDocument();

    await act(async () => {
      resolvePurchases(purchases);
    });

    expect(
      screen.getByText("5 Purchases")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 2. LOAD PURCHASES
  // ===========================================

  test("fetches and displays purchase history", async () => {
    renderPurchases();

    await waitForPurchases();

    expect(getMyPurchases).toHaveBeenCalledWith(
      mockRequest
    );

    expect(getMyPurchases).toHaveBeenCalledTimes(1);

    expect(displayedPurchaseIds()).toHaveLength(5);
  });

  // ===========================================
  // 3. TOTAL PURCHASE SUMMARY
  // ===========================================

  test("shows purchase count and total amount spent", async () => {
    renderPurchases();
    await waitForPurchases();

    // 100.25 + 50.50 + 70 + 25.10 + 10
    // = 255.85

    expect(
      screen.getByText("5 Purchases")
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        `${formatPrice(255.85)} Total spent`
      )
    ).toBeInTheDocument();
  });

  // ===========================================
  // 4. EMPTY PURCHASE HISTORY
  // ===========================================

  test("shows empty message when customer has no purchases", async () => {
    getMyPurchases.mockResolvedValue([]);

    renderPurchases();

    expect(
      await screen.findByText(
        "No purchases are linked to your account yet."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByText("0 Purchases")
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        `${formatPrice(0)} Total spent`
      )
    ).toBeInTheDocument();

    expect(displayedPurchaseIds()).toEqual([]);
  });

  // ===========================================
  // 5. API ERROR
  // ===========================================

  test("shows API error when purchase history fails", async () => {
    getMyPurchases.mockRejectedValue(
      new Error("Network error")
    );

    renderPurchases();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Network error");
  });

  // ===========================================
  // 6. FALLBACK ERROR
  // ===========================================

  test("shows fallback error message", async () => {
    getMyPurchases.mockRejectedValue(
      new Error("")
    );

    renderPurchases();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to load your purchases."
    );
  });

  // ===========================================
  // 7. RETRY AFTER ERROR
  // ===========================================

  test("retries fetching purchases after an error", async () => {
    const user = userEvent.setup();

    getMyPurchases
      .mockRejectedValueOnce(
        new Error("Server unavailable")
      )
      .mockResolvedValueOnce(purchases);

    renderPurchases();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Server unavailable");

    await user.click(
      screen.getByRole("button", {
        name: "Reload purchases",
      })
    );

    await waitForPurchases();

    expect(getMyPurchases).toHaveBeenCalledTimes(2);

    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 8. MANUAL RELOAD
  // ===========================================

  test("reloads purchases when Refresh is requested", async () => {
    const user = userEvent.setup();

    renderPurchases();
    await waitForPurchases();

    await user.click(
      screen.getByRole("button", {
        name: "Reload purchases",
      })
    );

    await waitFor(() => {
      expect(getMyPurchases).toHaveBeenCalledTimes(2);
    });

    expect(displayedPurchaseIds()).toHaveLength(5);
  });

  // ===========================================
  // 9. SEARCH BY PURCHASE ID
  // ===========================================

  test("searches purchases by ID", async () => {
    const user = userEvent.setup();

    renderPurchases();
    await waitForPurchases();

    await user.type(searchInput(), "103");

    expect(displayedPurchaseIds()).toEqual([
      "#103",
    ]);
  });

  // ===========================================
  // 10-11. SEARCH WITH # PREFIX
  // ===========================================

  test.each([
    "#102",
    "  #102  ",
  ])(
    "searches purchases using ID format %j",
    async (query) => {
      const user = userEvent.setup();

      renderPurchases();
      await waitForPurchases();

      await user.type(searchInput(), query);

      expect(displayedPurchaseIds()).toEqual([
        "#102",
      ]);
    }
  );

  // ===========================================
  // 12. PARTIAL PURCHASE ID
  // ===========================================

  test("supports partial purchase ID search", async () => {
    const user = userEvent.setup();

    renderPurchases();
    await waitForPurchases();

    await user.type(searchInput(), "04");

    expect(displayedPurchaseIds()).toEqual([
      "#104",
    ]);
  });

  // ===========================================
  // 13. SEARCH WITH NO RESULTS
  // ===========================================

  test("shows no matching purchases message", async () => {
    const user = userEvent.setup();

    renderPurchases();
    await waitForPurchases();

    await user.type(searchInput(), "9999");

    expect(displayedPurchaseIds()).toEqual([]);

    expect(
      screen.getByText("No matching purchases")
    ).toBeInTheDocument();

    expect(
      screen.getByText("0 Matching purchases")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 14. WHITESPACE SEARCH
  // ===========================================

  test("ignores whitespace-only search", async () => {
    const user = userEvent.setup();

    renderPurchases();
    await waitForPurchases();

    await user.type(searchInput(), "   ");

    expect(displayedPurchaseIds()).toHaveLength(5);

    expect(
      screen.getByText("5 Purchases")
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: "Clear filters",
      })
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 15-17. PAYMENT MODE FILTER
  // ===========================================

  test.each([
    ["Cash", ["#104", "#101"]],
    ["Card", ["#103", "#105"]],
    ["UPI", ["#102"]],
  ])(
    "filters purchases by %s payment",
    async (mode, expectedIds) => {
      const user = userEvent.setup();

      renderPurchases();
      await waitForPurchases();

      await user.selectOptions(
        paymentFilter(),
        mode
      );

      expect(displayedPurchaseIds()).toEqual(
        expectedIds
      );
    }
  );

  // ===========================================
  // 18. COMBINED FILTERS
  // ===========================================

  test("combines purchase ID and payment filters", async () => {
    const user = userEvent.setup();

    renderPurchases();
    await waitForPurchases();

    await user.type(searchInput(), "10");

    await user.selectOptions(
      paymentFilter(),
      "UPI"
    );

    expect(displayedPurchaseIds()).toEqual([
      "#102",
    ]);

    expect(
      screen.getByText("1 Matching purchases")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 19. CLEAR FILTERS
  // ===========================================

  test("clears purchase search and payment filters", async () => {
    const user = userEvent.setup();

    renderPurchases();
    await waitForPurchases();

    await user.type(searchInput(), "102");

    await user.selectOptions(
      paymentFilter(),
      "UPI"
    );

    expect(displayedPurchaseIds()).toEqual([
      "#102",
    ]);

    await user.click(
      screen.getByRole("button", {
        name: "Clear filters",
      })
    );

    expect(searchInput()).toHaveValue("");

    expect(paymentFilter()).toHaveValue("");

    expect(displayedPurchaseIds()).toHaveLength(5);

    expect(
      screen.getByText("5 Purchases")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 20. FILTERED TOTAL AMOUNT
  // ===========================================

  test("calculates total spent for filtered purchases", async () => {
    const user = userEvent.setup();

    renderPurchases();
    await waitForPurchases();

    await user.selectOptions(
      paymentFilter(),
      "Cash"
    );

    // Cash: 100.25 + 25.10 = 125.35

    expect(
      screen.getByText("2 Matching purchases")
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        `${formatPrice(125.35)} Matching total`
      )
    ).toBeInTheDocument();
  });

  // ===========================================
  // 21. EMPTY FILTERED TOTAL
  // ===========================================

  test("shows zero total when no purchases match", async () => {
    const user = userEvent.setup();

    renderPurchases();
    await waitForPurchases();

    await user.type(searchInput(), "999");

    expect(
      screen.getByText("0 Matching purchases")
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        `${formatPrice(0)} Matching total`
      )
    ).toBeInTheDocument();
  });

  // ===========================================
  // 22. FILTERS DO NOT CALL API AGAIN
  // ===========================================

  test("filters purchases locally without refetching", async () => {
    const user = userEvent.setup();

    renderPurchases();
    await waitForPurchases();

    await user.type(searchInput(), "102");

    await user.selectOptions(
      paymentFilter(),
      "UPI"
    );

    expect(displayedPurchaseIds()).toEqual([
      "#102",
    ]);

    expect(getMyPurchases).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 23. DEFAULT SORTING
  // ===========================================

  test("sorts newest purchases first by default", async () => {
    renderPurchases();
    await waitForPurchases();

    expect(displayedPurchaseIds()).toEqual([
      "#104",
      "#102",
      "#103",
      "#101",
      "#105",
    ]);
  });

  // ===========================================
  // 24. SORT BY PURCHASE DATE
  // ===========================================

  test("toggles purchase date sort direction", async () => {
    const user = userEvent.setup();

    renderPurchases();
    await waitForPurchases();

    // Ascending
    await user.click(
      sortButton("Purchased on")
    );

    expect(displayedPurchaseIds()).toEqual([
      "#101",
      "#103",
      "#102",
      "#104",
      "#105",
    ]);

    // Descending
    await user.click(
      sortButton("Purchased on")
    );

    expect(displayedPurchaseIds()).toEqual([
      "#104",
      "#102",
      "#103",
      "#101",
      "#105",
    ]);
  });

  // ===========================================
  // 25. MISSING DATE SORTING
  // ===========================================

  test("keeps purchases with missing dates at the bottom", async () => {
    const user = userEvent.setup();

    renderPurchases();
    await waitForPurchases();

    // Descending
    expect(displayedPurchaseIds().at(-1)).toBe(
      "#105"
    );

    // Ascending
    await user.click(
      sortButton("Purchased on")
    );

    expect(displayedPurchaseIds().at(-1)).toBe(
      "#105"
    );
  });

  // ===========================================
  // 26. SORT BY PURCHASE ID
  // ===========================================

  test("sorts purchase IDs numerically", async () => {
    const user = userEvent.setup();

    renderPurchases();
    await waitForPurchases();

    // Ascending
    await user.click(
      sortButton("Purchase ID")
    );

    expect(displayedPurchaseIds()).toEqual([
      "#101",
      "#102",
      "#103",
      "#104",
      "#105",
    ]);

    // Descending
    await user.click(
      sortButton("Purchase ID")
    );

    expect(displayedPurchaseIds()).toEqual([
      "#105",
      "#104",
      "#103",
      "#102",
      "#101",
    ]);
  });

  // ===========================================
  // 27. SORT BY TOTAL AMOUNT
  // ===========================================

  test("sorts purchase amounts numerically", async () => {
    const user = userEvent.setup();

    renderPurchases();
    await waitForPurchases();

    // Ascending
    await user.click(sortButton("Total"));

    expect(displayedPurchaseIds()).toEqual([
      "#105",
      "#104",
      "#102",
      "#103",
      "#101",
    ]);

    // Descending
    await user.click(sortButton("Total"));

    expect(displayedPurchaseIds()).toEqual([
      "#101",
      "#103",
      "#102",
      "#104",
      "#105",
    ]);
  });

  // ===========================================
  // 28. SORT BY PAYMENT
  // ===========================================

  test("sorts purchases alphabetically by payment mode", async () => {
    const user = userEvent.setup();

    renderPurchases();
    await waitForPurchases();

    // Ascending: Card -> Cash -> UPI
    await user.click(sortButton("Payment"));

    expect(displayedPurchaseIds()).toEqual([
      "#105", // Card
      "#103", // Card
      "#104", // Cash
      "#101", // Cash
      "#102", // UPI
    ]);

    // Descending: UPI -> Cash -> Card
    await user.click(sortButton("Payment"));

    expect(displayedPurchaseIds()).toEqual([
      "#102", // UPI
      "#104", // Cash
      "#101", // Cash
      "#105", // Card
      "#103", // Card
    ]);
  });

  // ===========================================
  // 29. DATE DISPLAY
  // ===========================================

  test("formats dates and handles missing purchase dates", async () => {
    renderPurchases();
    await waitForPurchases();

    const validRow = viewButton(101).closest("tr");
    const missingDateRow = viewButton(105).closest("tr");

    expect(validRow.cells[1]).toHaveTextContent(
      /Jan 2026/
    );

    expect(missingDateRow.cells[1]).toHaveTextContent(
      "—"
    );
  });

  // ===========================================
  // 30. OPEN PURCHASE DETAILS
  // ===========================================

  test("opens purchased medicines modal", async () => {
    const user = userEvent.setup();

    renderPurchases();
    await waitForPurchases();

    await user.click(viewButton(102));

    expect(
      screen.getByRole("dialog", {
        name: "Purchase medicines 102",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText("Purchase ID: 102")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Audience: customer")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 31. CLOSE PURCHASE DETAILS
  // ===========================================

  test("closes purchased medicines modal", async () => {
    const user = userEvent.setup();

    renderPurchases();
    await waitForPurchases();

    await user.click(viewButton(101));

    await user.click(
      screen.getByRole("button", {
        name: "Close details",
      })
    );

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    expect(getMyPurchases).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 32. VIEW ANOTHER PURCHASE
  // ===========================================

  test("opens another purchase after closing the first", async () => {
    const user = userEvent.setup();

    renderPurchases();
    await waitForPurchases();

    await user.click(viewButton(101));

    await user.click(
      screen.getByRole("button", {
        name: "Close details",
      })
    );

    await user.click(viewButton(104));

    expect(
      screen.getByRole("dialog", {
        name: "Purchase medicines 104",
      })
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("dialog", {
        name: "Purchase medicines 101",
      })
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 33. RELOAD CLOSES MODAL
  // ===========================================

  test("closes purchase details when history reloads", async () => {
    const user = userEvent.setup();

    renderPurchases();
    await waitForPurchases();

    await user.click(viewButton(102));

    expect(
      screen.getByRole("dialog")
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Reload purchases",
      })
    );

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(getMyPurchases).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================
  // 34. RELOAD UPDATED PURCHASE DATA
  // ===========================================

  test("displays newly returned purchases after reload", async () => {
    const user = userEvent.setup();

    const newPurchase = {
      sale_id: 106,
      payment_mode: "UPI",
      total_amount: 40,
      pharmacist_name: "Meena",
      created_at: "2026-05-01T10:00:00.000Z",
    };

    getMyPurchases
      .mockResolvedValueOnce(purchases)
      .mockResolvedValueOnce([
        ...purchases,
        newPurchase,
      ]);

    renderPurchases();
    await waitForPurchases();

    await user.click(
      screen.getByRole("button", {
        name: "Reload purchases",
      })
    );

    await screen.findByText("6 Purchases");

    expect(getMyPurchases).toHaveBeenCalledTimes(2);

    expect(displayedPurchaseIds()).toHaveLength(6);

    expect(displayedPurchaseIds()[0]).toBe("#106");

    expect(
      screen.getByText(
        `${formatPrice(295.85)} Total spent`
      )
    ).toBeInTheDocument();
  });

  // ===========================================
  // 35. FILTERS PERSIST AFTER RELOAD
  // ===========================================

  test("preserves purchase filters after refreshing", async () => {
    const user = userEvent.setup();

    renderPurchases();
    await waitForPurchases();

    await user.type(searchInput(), "102");

    await user.selectOptions(
      paymentFilter(),
      "UPI"
    );

    await user.click(
      screen.getByRole("button", {
        name: "Reload purchases",
      })
    );

    await waitFor(() => {
      expect(getMyPurchases).toHaveBeenCalledTimes(2);
    });

    await screen.findByText("1 Matching purchases");

    expect(searchInput()).toHaveValue("102");

    expect(paymentFilter()).toHaveValue("UPI");

    expect(displayedPurchaseIds()).toEqual([
      "#102",
    ]);
  });

  // ===========================================
  // 36. IGNORE STALE API RESPONSE
  // ===========================================

  test("ignores an outdated response when authenticated request changes", async () => {
    // Arrange
    const firstRequest = vi.fn();
    const secondRequest = vi.fn();

    let resolveOldRequest;

    const updatedPurchases = [
      {
        sale_id: 999,
        payment_mode: "Cash",
        total_amount: 99,
        created_at: "2026-05-01T10:00:00.000Z",
      },
    ];

    getMyPurchases.mockImplementation((request) => {
      if (request === firstRequest) {
        return new Promise((resolve) => {
          resolveOldRequest = resolve;
        });
      }

      return Promise.resolve(updatedPurchases);
    });

    useAuth.mockReturnValue({
      authenticatedRequest: firstRequest,
    });

    const { rerender } = renderPurchases();

    // Act: Switch to a new authenticated request
    // before the first request finishes.
    useAuth.mockReturnValue({
      authenticatedRequest: secondRequest,
    });

    rerender(<MyPurchases />);

    // New request completes first.
    await screen.findByText("1 Purchases");

    expect(displayedPurchaseIds()).toEqual([
      "#999",
    ]);

    // Old request finishes afterward.
    await act(async () => {
      resolveOldRequest(purchases);
    });

    // Assert: Old data must not overwrite new data.
    expect(
      screen.getByText("1 Purchases")
    ).toBeInTheDocument();

    expect(displayedPurchaseIds()).toEqual([
      "#999",
    ]);

    expect(getMyPurchases).toHaveBeenCalledTimes(2);
  });
});
