
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
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import SalesHistory from "./SalesHistory";
import useAuth from "../../hooks/useAuth";
import { getSales } from "../../services/sales.service";
import { formatPrice } from "../../utils/batch";

// =============================================
// MOCK DEPENDENCIES
// =============================================

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

// Keep the actual PAYMENT_MODES constant.
vi.mock("../../services/sales.service", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    getSales: vi.fn(),
  };
});

// SaleDetailsModal is tested separately.
vi.mock("../../components/sales/SaleDetailsModal", () => ({
  default: ({ saleId, audience, onClose }) => (
    <div
      role="dialog"
      aria-label={`Sale details ${saleId}`}
    >
      <p>Sale ID: {saleId}</p>
      <p>Audience: {audience}</p>

      <button type="button" onClick={onClose}>
        Close details
      </button>
    </div>
  ),
}));

// Mock shared UI so we're testing
// the logic inside SalesHistory.jsx.
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
      return <p role="status">Loading sales...</p>;
    }

    if (error) {
      return (
        <section>
          <p role="alert">{error}</p>

          <button type="button" onClick={onReload}>
            Reload sales
          </button>
        </section>
      );
    }

    return (
      <section>
        <button type="button" onClick={onReload}>
          Reload sales
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
              ? "No matching sales"
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

const sales = [
  {
    sale_id: 101,
    customer_name: "Walk-in customer",
    pharmacist_name: "Ravi",
    payment_mode: "Cash",
    total_amount: 100.25,
    created_at: "2026-01-10T10:00:00.000Z",
  },
  {
    sale_id: 102,
    customer_name: "Anita",
    pharmacist_name: "Ravi",
    payment_mode: "UPI",
    total_amount: 50.5,
    created_at: "2026-03-15T10:00:00.000Z",
  },
  {
    sale_id: 103,
    customer_name: "Bala",
    pharmacist_name: "Meena",
    payment_mode: "Card",
    total_amount: 70,
    created_at: "2026-02-01T10:00:00.000Z",
  },
  {
    sale_id: 104,
    customer_name: "Sonia",
    pharmacist_name: "Meena",
    payment_mode: "Cash",
    total_amount: 25.1,
    created_at: "2026-04-01T10:00:00.000Z",
  },
  {
    sale_id: 105,
    customer_name: "Ajay",
    pharmacist_name: "Ravi",
    payment_mode: "Card",
    total_amount: 10,
    created_at: null,
  },
];

const mockRequest = vi.fn();

// =============================================
// HELPER FUNCTIONS
// =============================================

function renderSalesHistory() {
  return render(<SalesHistory />);
}

async function waitForSales(count = 5) {
  await screen.findByText(`${count} Sales`);
}

function displayedSaleIds() {
  const table = screen.getByRole("table", {
    name: "Recorded sales",
  });

  return Array.from(
    table.querySelectorAll("tbody tr")
  ).map((row) => row.cells[0].textContent.trim());
}

function searchInput() {
  return screen.getByRole("searchbox", {
    name: "Search sales",
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

// =============================================
// SALES HISTORY TESTS
// =============================================

describe("SalesHistory", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    useAuth.mockReturnValue({
      authenticatedRequest: mockRequest,
    });

    getSales.mockResolvedValue(sales);
  });

  // ===========================================
  // 1. INITIAL LOADING
  // ===========================================

  test("shows loading state while fetching sales", async () => {
    // Arrange
    let resolveSales;

    getSales.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSales = resolve;
        })
    );

    // Act
    renderSalesHistory();

    // Assert
    expect(
      screen.getByText("Loading sales...")
    ).toBeInTheDocument();

    // Complete loading
    await act(async () => {
      resolveSales(sales);
    });

    expect(
      screen.getByText("5 Sales")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 2. LOAD SALES
  // ===========================================

  test("loads sales using authenticated request", async () => {
    // Arrange & Act
    renderSalesHistory();

    await waitForSales();

    // Assert
    expect(getSales).toHaveBeenCalledWith(
      mockRequest
    );

    expect(getSales).toHaveBeenCalledTimes(1);

    expect(displayedSaleIds()).toHaveLength(5);
  });

  // ===========================================
  // 3. SUMMARY COUNTS AND TOTAL
  // ===========================================

  test("displays total sales count and amount", async () => {
    renderSalesHistory();

    await waitForSales();

    // 100.25 + 50.50 + 70 + 25.10 + 10
    // = 255.85

    expect(
      screen.getByText("5 Sales")
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        `${formatPrice(255.85)} Total sales amount`
      )
    ).toBeInTheDocument();
  });

  // ===========================================
  // 4. EMPTY SALES LIST
  // ===========================================

  test("shows empty message when no sales exist", async () => {
    // Arrange
    getSales.mockResolvedValue([]);

    // Act
    renderSalesHistory();

    // Assert
    expect(
      await screen.findByText(
        "No sales have been recorded yet."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByText("0 Sales")
    ).toBeInTheDocument();

    expect(displayedSaleIds()).toEqual([]);
  });

  // ===========================================
  // 5. API ERROR
  // ===========================================

  test("shows API error when sales fail to load", async () => {
    // Arrange
    getSales.mockRejectedValue(
      new Error("Network error")
    );

    // Act
    renderSalesHistory();

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Network error");
  });

  // ===========================================
  // 6. FALLBACK ERROR
  // ===========================================

  test("shows fallback error message", async () => {
    // Arrange
    getSales.mockRejectedValue(
      new Error("")
    );

    // Act
    renderSalesHistory();

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to load sales."
    );
  });

  // ===========================================
  // 7. RETRY AFTER ERROR
  // ===========================================

  test("reloads sales after an API failure", async () => {
    // Arrange
    const user = userEvent.setup();

    getSales
      .mockRejectedValueOnce(new Error("Server unavailable"))
      .mockResolvedValueOnce(sales);

    renderSalesHistory();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Server unavailable");

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Reload sales",
      })
    );

    // Assert
    await waitForSales();

    expect(getSales).toHaveBeenCalledTimes(2);

    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 8. MANUAL RELOAD
  // ===========================================

  test("reloads sales when refresh is requested", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSalesHistory();
    await waitForSales();

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Reload sales",
      })
    );

    // Assert
    await waitFor(() => {
      expect(getSales).toHaveBeenCalledTimes(2);
    });

    expect(displayedSaleIds()).toHaveLength(5);
  });

  // ===========================================
  // 9. SEARCH BY SALE ID
  // ===========================================

  test("searches sales by sale ID", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSalesHistory();
    await waitForSales();

    // Act
    await user.type(searchInput(), "103");

    // Assert
    expect(displayedSaleIds()).toEqual([
      "#103",
    ]);
  });

  // ===========================================
  // 10. SEARCH BY CUSTOMER
  // ===========================================

  test("searches customers without case sensitivity", async () => {
    const user = userEvent.setup();

    renderSalesHistory();
    await waitForSales();

    // Act
    await user.type(
      searchInput(),
      "  ANITA  "
    );

    // Assert
    expect(displayedSaleIds()).toEqual([
      "#102",
    ]);
  });

  // ===========================================
  // 11. SEARCH BY PHARMACIST
  // ===========================================

  test("searches sales by pharmacist name", async () => {
    const user = userEvent.setup();

    renderSalesHistory();
    await waitForSales();

    // Act
    await user.type(
      searchInput(),
      "ravi"
    );

    // Assert
    expect(displayedSaleIds()).toEqual([
      "#102",
      "#101",
      "#105",
    ]);
  });

  // ===========================================
  // 12. SEARCH WITH NO RESULTS
  // ===========================================

  test("shows no matching sales for unknown search", async () => {
    const user = userEvent.setup();

    renderSalesHistory();
    await waitForSales();

    // Act
    await user.type(
      searchInput(),
      "Unknown customer"
    );

    // Assert
    expect(displayedSaleIds()).toEqual([]);

    expect(
      screen.getByText("No matching sales")
    ).toBeInTheDocument();

    expect(
      screen.getByText("0 Matching sales")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 13-15. PAYMENT MODE FILTER
  // ===========================================

  test.each([
    ["Cash", ["#104", "#101"]],
    ["Card", ["#103", "#105"]],
    ["UPI", ["#102"]],
  ])(
    "filters sales by %s payment",
    async (payment, expectedIds) => {
      // Arrange
      const user = userEvent.setup();

      renderSalesHistory();
      await waitForSales();

      // Act
      await user.selectOptions(
        paymentFilter(),
        payment
      );

      // Assert
      expect(displayedSaleIds()).toEqual(
        expectedIds
      );
    }
  );

  // ===========================================
  // 16. COMBINED SEARCH AND PAYMENT FILTER
  // ===========================================

  test("applies search and payment filters together", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSalesHistory();
    await waitForSales();

    // Act
    await user.type(
      searchInput(),
      "ravi"
    );

    await user.selectOptions(
      paymentFilter(),
      "Card"
    );

    // Assert
    expect(displayedSaleIds()).toEqual([
      "#105",
    ]);
  });

  // ===========================================
  // 17. CLEAR FILTERS
  // ===========================================

  test("clears search and payment filters", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSalesHistory();
    await waitForSales();

    await user.type(
      searchInput(),
      "ravi"
    );

    await user.selectOptions(
      paymentFilter(),
      "Card"
    );

    expect(displayedSaleIds()).toEqual([
      "#105",
    ]);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Clear filters",
      })
    );

    // Assert
    expect(searchInput()).toHaveValue("");

    expect(paymentFilter()).toHaveValue("");

    expect(displayedSaleIds()).toHaveLength(5);

    expect(
      screen.getByText("5 Sales")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 18. FILTERED SUMMARY
  // ===========================================

  test("updates count and total for filtered sales", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSalesHistory();
    await waitForSales();

    // Act
    await user.selectOptions(
      paymentFilter(),
      "Cash"
    );

    // Cash: 100.25 + 25.10 = 125.35

    // Assert
    expect(
      screen.getByText("2 Matching sales")
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        `${formatPrice(125.35)} Matching total`
      )
    ).toBeInTheDocument();
  });

  // ===========================================
  // 19. DEFAULT DATE SORTING
  // ===========================================

  test("sorts newest sales first by default", async () => {
    // Arrange & Act
    renderSalesHistory();

    await waitForSales();

    // Assert
    expect(displayedSaleIds()).toEqual([
      "#104",
      "#102",
      "#103",
      "#101",
      "#105",
    ]);
  });

  // ===========================================
  // 20. DATE SORT DIRECTION
  // ===========================================

  test("toggles date sorting and keeps missing dates last", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSalesHistory();
    await waitForSales();

    // Act: Ascending dates
    await user.click(sortButton("Created"));

    // Assert
    expect(displayedSaleIds()).toEqual([
      "#101",
      "#103",
      "#102",
      "#104",
      "#105",
    ]);

    // Act: Descending dates
    await user.click(sortButton("Created"));

    // Assert
    expect(displayedSaleIds()).toEqual([
      "#104",
      "#102",
      "#103",
      "#101",
      "#105",
    ]);
  });

  // ===========================================
  // 21. SORT BY SALE ID
  // ===========================================

  test("sorts sale IDs numerically", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSalesHistory();
    await waitForSales();

    // Act: Ascending
    await user.click(sortButton("Sale ID"));

    // Assert
    expect(displayedSaleIds()).toEqual([
      "#101",
      "#102",
      "#103",
      "#104",
      "#105",
    ]);

    // Act: Descending
    await user.click(sortButton("Sale ID"));

    // Assert
    expect(displayedSaleIds()).toEqual([
      "#105",
      "#104",
      "#103",
      "#102",
      "#101",
    ]);
  });

  // ===========================================
  // 22. SORT BY TOTAL AMOUNT
  // ===========================================

  test("sorts sale amounts numerically", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSalesHistory();
    await waitForSales();

    // Act: Lowest first
    await user.click(sortButton("Total"));

    // Assert
    expect(displayedSaleIds()).toEqual([
      "#105",
      "#104",
      "#102",
      "#103",
      "#101",
    ]);

    // Act: Highest first
    await user.click(sortButton("Total"));

    // Assert
    expect(displayedSaleIds()).toEqual([
      "#101",
      "#103",
      "#102",
      "#104",
      "#105",
    ]);
  });

  // ===========================================
  // 23. SORT BY CUSTOMER
  // ===========================================

  test("sorts customer names alphabetically", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSalesHistory();
    await waitForSales();

    // Act
    await user.click(sortButton("Customer"));

    // Assert
    expect(displayedSaleIds()).toEqual([
      "#105", // Ajay
      "#102", // Anita
      "#103", // Bala
      "#104", // Sonia
      "#101", // Walk-in customer
    ]);
  });

  // ===========================================
  // 24. SORT BY PHARMACIST
  // ===========================================

  test("sorts pharmacist names alphabetically", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSalesHistory();
    await waitForSales();

    // Act
    await user.click(sortButton("Pharmacist"));

    // Assert
    expect(displayedSaleIds()).toEqual([
      "#104", // Meena
      "#103", // Meena
      "#105", // Ravi
      "#102", // Ravi
      "#101", // Ravi
    ]);
  });

  // ===========================================
  // 25. SORT BY PAYMENT MODE
  // ===========================================

  test("sorts sales by payment mode", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSalesHistory();
    await waitForSales();

    // Act
    await user.click(sortButton("Payment"));

    // Assert
    expect(displayedSaleIds()).toEqual([
  "#105", // Card
  "#103", // Card
  "#104", // Cash
  "#101", // Cash
  "#102", // UPI
]);

    // Note: "Card" alphabetically precedes "Cash".
    // The exact expected order is verified below.
  });

  // ===========================================
  // 26. OPEN SALE DETAILS
  // ===========================================

  test("opens details modal for a selected sale", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSalesHistory();
    await waitForSales();

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "View details for sale 102",
      })
    );

    // Assert
    expect(
      screen.getByRole("dialog", {
        name: "Sale details 102",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText("Audience: admin")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 27. CLOSE SALE DETAILS
  // ===========================================

  test("closes details modal", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSalesHistory();
    await waitForSales();

    await user.click(
      screen.getByRole("button", {
        name: "View details for sale 101",
      })
    );

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Close details",
      })
    );

    // Assert
    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    expect(getSales).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 28. OPEN DETAILS FOR ANOTHER SALE
  // ===========================================

  test("can open details for another sale after closing", async () => {
    const user = userEvent.setup();

    renderSalesHistory();
    await waitForSales();

    // Act: First sale
    await user.click(
      screen.getByRole("button", {
        name: "View details for sale 101",
      })
    );

    await user.click(
      screen.getByRole("button", {
        name: "Close details",
      })
    );

    // Act: Another sale
    await user.click(
      screen.getByRole("button", {
        name: "View details for sale 104",
      })
    );

    // Assert
    expect(
      screen.getByRole("dialog", {
        name: "Sale details 104",
      })
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("dialog", {
        name: "Sale details 101",
      })
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 29. RELOAD CLOSES DETAILS MODAL
  // ===========================================

  test("closes details modal when sales are reloaded", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSalesHistory();
    await waitForSales();

    await user.click(
      screen.getByRole("button", {
        name: "View details for sale 102",
      })
    );

    expect(
      screen.getByRole("dialog")
    ).toBeInTheDocument();

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Reload sales",
      })
    );

    // Assert
    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(getSales).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================
  // 30. RELOAD UPDATED SALES
  // ===========================================

  test("displays updated data after reloading sales", async () => {
    // Arrange
    const user = userEvent.setup();

    const newSale = {
      sale_id: 106,
      customer_name: "New Customer",
      pharmacist_name: "Ravi",
      payment_mode: "UPI",
      total_amount: 40,
      created_at: "2026-05-01T10:00:00.000Z",
    };

    getSales
      .mockResolvedValueOnce(sales)
      .mockResolvedValueOnce([
        ...sales,
        newSale,
      ]);

    renderSalesHistory();
    await waitForSales();

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Reload sales",
      })
    );

    // Assert
    await screen.findByText("6 Sales");

    expect(getSales).toHaveBeenCalledTimes(2);

    expect(displayedSaleIds()[0]).toBe("#106");

    expect(displayedSaleIds()).toHaveLength(6);
  });

  // ===========================================
  // 31. MISSING DATE DISPLAY
  // ===========================================

  test("displays fallback for missing sale date", async () => {
    renderSalesHistory();
    await waitForSales();

    const table = screen.getByRole("table", {
      name: "Recorded sales",
    });

    expect(
      table.textContent
    ).toContain("—");

    expect(displayedSaleIds().at(-1)).toBe("#105");
  });

  // ===========================================
  // 32. WHITESPACE SEARCH
  // ===========================================

  test("ignores whitespace-only search", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSalesHistory();
    await waitForSales();

    // Act
    await user.type(searchInput(), "   ");

    // Assert
    expect(displayedSaleIds()).toHaveLength(5);

    expect(
      screen.getByText("5 Sales")
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: "Clear filters",
      })
    ).not.toBeInTheDocument();
  });
});
