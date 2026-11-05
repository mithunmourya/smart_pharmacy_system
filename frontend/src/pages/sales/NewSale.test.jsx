
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
  fireEvent,
  act,
  within,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import NewSale from "./NewSale";
import useAuth from "../../hooks/useAuth";
import { getAvailableInventory } from "../../services/inventory.service";
import { formatPrice } from "../../utils/batch";

// =============================================
// MOCK DEPENDENCIES
// =============================================

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

vi.mock("../../services/inventory.service", () => ({
  getAvailableInventory: vi.fn(),
}));

// Mock CustomerSelector because we'll test
// its own behavior separately.
vi.mock("../../components/sales/CustomerSelector", () => ({
  default: ({
    value,
    onChange,
    onBusyChange,
    disabled,
  }) => (
    <section aria-label="Mock customer selector">
      <p>Customer mode: {value.mode}</p>
      <p>
        Selected customer: {value.customer?.name ?? "None"}
      </p>

      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onChange({
            mode: "walk-in",
            customer: null,
          })
        }
      >
        Choose walk-in
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onChange({
            mode: "existing",
            customer: null,
          })
        }
      >
        Require customer
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onChange({
            mode: "existing",
            customer: {
              user_id: 7,
              name: "Ravi Kumar",
              email: "ravi@example.com",
            },
          })
        }
      >
        Select existing customer
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onChange({
            mode: "existing",
            customer: {
              user_id: "7",
              name: "Invalid Customer",
              email: "invalid@example.com",
            },
          })
        }
      >
        Select invalid customer
      </button>

      <button
        type="button"
        onClick={() => onBusyChange(true)}
      >
        Set customer busy
      </button>

      <button
        type="button"
        onClick={() => onBusyChange(false)}
      >
        Finish customer request
      </button>
    </section>
  ),
}));

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
}));

// =============================================
// TEST DATA
// =============================================

const inventory = [
  {
    medicine_id: 1,
    medicine_name: "Paracetamol",
    manufacturer_name: "ABC Pharma",
    category: "Tablet",
    batches: [
      {
        batch_id: 11,
        batch_number: "PAR-101",
        stock_quantity: 3,
        selling_price: 15.5,
        expiry_date: "2099-12-31",
        days_to_expire: 90,
      },
      {
        batch_id: 12,
        batch_number: "PAR-102",
        stock_quantity: 2,
        selling_price: 8.25,
        expiry_date: "2099-11-30",
        days_to_expire: 1,
      },
    ],
  },
  {
    medicine_id: 2,
    medicine_name: "Ibuprofen",
    manufacturer_name: "Zen Pharma",
    category: "Capsule",
    batches: [
      {
        batch_id: 21,
        batch_number: "IBU-201",
        stock_quantity: 5,
        selling_price: 12.75,
        expiry_date: "2099-10-31",
        days_to_expire: 50,
      },
    ],
  },
];

const mockRequest = vi.fn();

// =============================================
// TEST HELPERS
// =============================================

async function renderLoadedSale() {
  render(<NewSale />);

  await screen.findByText("3 of 3 batches");
}

function addButton(batchNumber, medicineName = "Paracetamol") {
  return screen.getByRole("button", {
    name: `Add ${medicineName}, batch ${batchNumber}`,
  });
}

async function addParacetamol(user) {
  await user.click(addButton("PAR-101"));
}

function quantityInput() {
  return screen.getByRole("spinbutton", {
    name: "Quantity",
  });
}

function changeQuantity(value) {
  fireEvent.change(quantityInput(), {
    target: {
      value: String(value),
    },
  });
}

function checkoutButton() {
  return screen.getByRole("button", {
    name: "Complete sale",
  });
}

async function completeSale(user) {
  await user.click(checkoutButton());
}

function totalAmountElement() {
  return screen.getByText("Estimated total").nextElementSibling;
}

// =============================================
// NEW SALE TESTS
// =============================================

describe("NewSale", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    useAuth.mockReturnValue({
      authenticatedRequest: mockRequest,
    });

    getAvailableInventory.mockResolvedValue(inventory);

    // Successful backend response by default.
    mockRequest.mockResolvedValue({
      data: {
        sale_id: 501,
        total_amount: 15.5,
      },
    });
  });

  // ===========================================
  // 1. INITIAL LOADING
  // ===========================================

  test("shows loading state while fetching inventory", async () => {
    let resolveInventory;

    getAvailableInventory.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInventory = resolve;
        })
    );

    // Act
    render(<NewSale />);

    // Assert
    expect(
      screen.getByText("Loading available stock...")
    ).toBeInTheDocument();

    expect(checkoutButton()).toBeDisabled();

    // Finish loading.
    await act(async () => {
      resolveInventory(inventory);
    });

    expect(
      screen.getByText("3 of 3 batches")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 2. LOAD INVENTORY
  // ===========================================

  test("loads and displays available inventory", async () => {
    // Act
    await renderLoadedSale();

    // Assert
    expect(
      getAvailableInventory
    ).toHaveBeenCalledWith(mockRequest);

    expect(addButton("PAR-101")).toBeInTheDocument();
    expect(addButton("PAR-102")).toBeInTheDocument();

    expect(
      addButton("IBU-201", "Ibuprofen")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 3. EARLIEST EXPIRY FIRST
  // ===========================================

  test("sorts available batches by days to expiry", async () => {
    await renderLoadedSale();

    const table = screen.getByLabelText(
      "Available batches table"
    );

    const rows = within(table)
      .getAllByRole("row")
      .slice(1);

    expect(rows[0]).toHaveTextContent("PAR-102");
    expect(rows[1]).toHaveTextContent("IBU-201");
    expect(rows[2]).toHaveTextContent("PAR-101");
  });

  // ===========================================
  // 4. EXPIRY WARNING
  // ===========================================

  test("shows warning for batches expiring soon", async () => {
    await renderLoadedSale();

    expect(
      screen.getByText("Expires in 1 days")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 5. EMPTY INVENTORY
  // ===========================================

  test("shows message when no stock is available", async () => {
    getAvailableInventory.mockResolvedValue([]);

    render(<NewSale />);

    expect(
      await screen.findByText(
        "No stock is currently available for sale."
      )
    ).toBeInTheDocument();

    expect(checkoutButton()).toBeDisabled();
  });

  // ===========================================
  // 6. INVENTORY API ERROR
  // ===========================================

  test("displays inventory loading error", async () => {
    getAvailableInventory.mockRejectedValue(
      new Error("Network error")
    );

    render(<NewSale />);

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Network error");

    expect(checkoutButton()).toBeDisabled();
  });

  // ===========================================
  // 7. INVENTORY FALLBACK ERROR
  // ===========================================

  test("shows fallback inventory error", async () => {
    getAvailableInventory.mockRejectedValue(
      new Error("")
    );

    render(<NewSale />);

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to load available inventory."
    );
  });

  // ===========================================
  // 8. RELOAD INVENTORY
  // ===========================================

  test("reloads inventory after an error", async () => {
    const user = userEvent.setup();

    getAvailableInventory
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(inventory);

    render(<NewSale />);

    await screen.findByRole("alert");

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Reload available stock",
      })
    );

    // Assert
    await screen.findByText("3 of 3 batches");

    expect(
      getAvailableInventory
    ).toHaveBeenCalledTimes(2);

    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 9-12. INVENTORY SEARCH
  // ===========================================

  test.each([
    ["paracetamol", 2],
    ["ABC PHARMA", 2],
    ["PAR-101", 1],
    ["capsule", 1],
  ])(
    "searches inventory for %s",
    async (search, expectedCount) => {
      const user = userEvent.setup();

      await renderLoadedSale();

      // Act
      await user.type(
        screen.getByRole("searchbox", {
          name: "Search available stock",
        }),
        search
      );

      // Assert
      expect(
        screen.getByText(
          `${expectedCount} of 3 batches`
        )
      ).toBeInTheDocument();
    }
  );

  // ===========================================
  // 13. NO SEARCH RESULTS
  // ===========================================

  test("shows message when no batches match search", async () => {
    const user = userEvent.setup();

    await renderLoadedSale();

    // Act
    await user.type(
      screen.getByRole("searchbox", {
        name: "Search available stock",
      }),
      "Unknown Medicine"
    );

    // Assert
    expect(
      screen.getByText(
        "No batches match your search."
      )
    ).toBeInTheDocument();
  });

  // ===========================================
  // 14. ADD BATCH TO CART
  // ===========================================

  test("adds a medicine batch to the cart", async () => {
    const user = userEvent.setup();

    await renderLoadedSale();

    // Act
    await addParacetamol(user);

    // Assert
    expect(quantityInput()).toHaveValue(1);

    expect(
      screen.getByText("1 Selected batches")
    ).toBeInTheDocument();

    expect(totalAmountElement()).toHaveTextContent(
      formatPrice(15.5)
    );

    expect(checkoutButton()).toBeEnabled();
  });

  // ===========================================
  // 15. INCREMENT EXISTING BATCH
  // ===========================================

  test("increments quantity instead of duplicating a cart row", async () => {
    const user = userEvent.setup();

    await renderLoadedSale();

    // Act
    await addParacetamol(user);
    await addParacetamol(user);

    // Assert
    expect(quantityInput()).toHaveValue(2);

    expect(
      screen.getByText("1 Selected batches")
    ).toBeInTheDocument();

    expect(totalAmountElement()).toHaveTextContent(
      formatPrice(31)
    );
  });

  // ===========================================
  // 16. LIMIT ADDITIONS TO AVAILABLE STOCK
  // ===========================================

  test("stops adding a batch when stock limit is reached", async () => {
    const user = userEvent.setup();

    await renderLoadedSale();

    // PAR-102 has only 2 units.
    await user.click(addButton("PAR-102"));
    await user.click(addButton("PAR-102"));

    // Assert
    expect(quantityInput()).toHaveValue(2);

    expect(addButton("PAR-102")).toBeDisabled();

    expect(
      screen.getByText("At limit")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 17. MULTIPLE BATCHES AND TOTAL
  // ===========================================

  test("calculates total quantity and price for multiple batches", async () => {
    const user = userEvent.setup();

    await renderLoadedSale();

    // Act
    await addParacetamol(user);
    await addParacetamol(user);

    await user.click(addButton("PAR-102"));

    // 2 × 15.50 + 1 × 8.25 = 39.25

    // Assert
    expect(
      screen.getByText("2 Selected batches")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Total units").nextElementSibling
    ).toHaveTextContent("3");

    expect(totalAmountElement()).toHaveTextContent(
      formatPrice(39.25)
    );
  });

  // ===========================================
  // 18. REMOVE BATCH
  // ===========================================

  test("removes a batch from the cart", async () => {
    const user = userEvent.setup();

    await renderLoadedSale();

    await addParacetamol(user);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Remove Paracetamol, batch PAR-101",
      })
    );

    // Assert
    expect(
      screen.getByText(
        "Add a medicine batch to start this sale."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByText("0 Selected batches")
    ).toBeInTheDocument();

    expect(checkoutButton()).toBeDisabled();
  });

  // ===========================================
  // 19. CLEAR ENTIRE CART
  // ===========================================

  test("clears all cart items", async () => {
    const user = userEvent.setup();

    await renderLoadedSale();

    await addParacetamol(user);
    await user.click(addButton("PAR-102"));

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Clear cart",
      })
    );

    // Assert
    expect(
      screen.getByText("0 Selected batches")
    ).toBeInTheDocument();

    expect(checkoutButton()).toBeDisabled();

    expect(
      screen.getByRole("button", {
        name: "Clear cart",
      })
    ).toBeDisabled();
  });

  // ===========================================
  // 20-23. INVALID CART QUANTITIES
  // ===========================================

  test.each([
    ["", "Enter a whole number greater than zero."],
    ["0", "Enter a whole number greater than zero."],
    ["-2", "Enter a whole number greater than zero."],
    ["1.5", "Enter a whole number greater than zero."],
    ["4", "Only 3 units are available."],
  ])(
    "rejects invalid quantity %j",
    async (quantity, expectedError) => {
      const user = userEvent.setup();

      await renderLoadedSale();

      await addParacetamol(user);

      // Act
      changeQuantity(quantity);

      // Assert
      expect(
        screen.getByText(expectedError)
      ).toBeInTheDocument();

      expect(checkoutButton()).toBeDisabled();

      expect(
        mockRequest
      ).not.toHaveBeenCalled();
    }
  );

  // ===========================================
  // 25. CORRECT INVALID QUANTITY
  // ===========================================

  test("allows checkout after quantity is corrected", async () => {
    const user = userEvent.setup();

    await renderLoadedSale();

    await addParacetamol(user);

    // Arrange: Invalid quantity
    changeQuantity("10");

    expect(checkoutButton()).toBeDisabled();

    // Act: Correct quantity
    changeQuantity("2");

    // Assert
    expect(
      screen.queryByText(
        "Only 3 units are available."
      )
    ).not.toBeInTheDocument();

    expect(checkoutButton()).toBeEnabled();

    expect(totalAmountElement()).toHaveTextContent(
      formatPrice(31)
    );
  });

  // ===========================================
  // 26. BATCH REMOVED FROM INVENTORY
  // ===========================================

  test("blocks checkout if a cart batch becomes unavailable", async () => {
    const user = userEvent.setup();

    getAvailableInventory
      .mockResolvedValueOnce(inventory)
      .mockResolvedValueOnce([inventory[1]]);

    await renderLoadedSale();

    await addParacetamol(user);

    // Act: Refresh stock
    await user.click(
      screen.getByRole("button", {
        name: "Reload available stock",
      })
    );

    // Assert
    expect(
      await screen.findByText(
        "This batch is no longer available. Remove it."
      )
    ).toBeInTheDocument();

    expect(checkoutButton()).toBeDisabled();
  });

  // ===========================================
  // 27. STOCK REDUCED AFTER REFRESH
  // ===========================================

  test("revalidates cart quantities against refreshed stock", async () => {
    const user = userEvent.setup();

    const reducedInventory = [
      {
        ...inventory[0],
        batches: inventory[0].batches.map((batch) =>
          batch.batch_id === 11
            ? { ...batch, stock_quantity: 1 }
            : batch
        ),
      },
      inventory[1],
    ];

    getAvailableInventory
      .mockResolvedValueOnce(inventory)
      .mockResolvedValueOnce(reducedInventory);

    await renderLoadedSale();

    await addParacetamol(user);

    changeQuantity("2");

    expect(checkoutButton()).toBeEnabled();

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Reload available stock",
      })
    );

    // Assert
    expect(
      await screen.findByText(
        "Only 1 units are available."
      )
    ).toBeInTheDocument();

    expect(checkoutButton()).toBeDisabled();
  });

  // ===========================================
  // 28. CHECKOUT WITH EMPTY CART
  // ===========================================

  test("prevents checkout with an empty cart", async () => {
    await renderLoadedSale();

    expect(checkoutButton()).toBeDisabled();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 29. CUSTOMER NOT SELECTED
  // ===========================================

  test("requires a customer for non-walk-in checkout", async () => {
    const user = userEvent.setup();

    await renderLoadedSale();

    await addParacetamol(user);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Require customer",
      })
    );

    // Assert
    expect(
      screen.getByText(
        "Select a customer above or choose Walk-in to continue."
      )
    ).toBeInTheDocument();

    expect(checkoutButton()).toBeDisabled();

    // Forced form submission still rejects it.
    fireEvent.submit(checkoutButton().closest("form"));

    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Select a customer, create an account, or choose Walk-in before checkout."
    );

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 30. CUSTOMER REQUEST IN PROGRESS
  // ===========================================

  test("blocks checkout while customer request is busy", async () => {
    const user = userEvent.setup();

    await renderLoadedSale();

    await addParacetamol(user);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Set customer busy",
      })
    );

    // Assert
    expect(checkoutButton()).toBeDisabled();

    expect(
      screen.getByText(
        "Wait for the customer request to finish."
      )
    ).toBeInTheDocument();

    // Act: Customer request completes.
    await user.click(
      screen.getByRole("button", {
        name: "Finish customer request",
      })
    );

    expect(checkoutButton()).toBeEnabled();
  });

  // ===========================================
  // 31. INVALID CUSTOMER ID
  // ===========================================

  test("rejects a selected customer with an invalid ID type", async () => {
    const user = userEvent.setup();

    await renderLoadedSale();

    await addParacetamol(user);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Select invalid customer",
      })
    );

    // Assert: String IDs are not accepted.
    expect(checkoutButton()).toBeDisabled();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 32. DEFAULT PAYMENT METHOD
  // ===========================================

  test("defaults to Cash and offers supported payment modes", async () => {
    await renderLoadedSale();

    const payment = screen.getByRole("combobox", {
      name: "Payment mode",
    });

    expect(payment).toHaveValue("Cash");

    expect(
      within(payment).getAllByRole("option")
    ).toHaveLength(3);

    expect(
      within(payment).getByRole("option", {
        name: "Card",
      })
    ).toBeInTheDocument();

    expect(
      within(payment).getByRole("option", {
        name: "UPI",
      })
    ).toBeInTheDocument();
  });

  // ===========================================
  // 33. SUCCESSFUL WALK-IN SALE
  // ===========================================

  test("creates a successful walk-in sale", async () => {
    const user = userEvent.setup();

    await renderLoadedSale();

    await addParacetamol(user);

    // Act
    await completeSale(user);

    // Assert actual service request
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/sales",
        {
          method: "POST",
          body: {
            customer_id: null,
            payment_mode: "Cash",
            items: [
              {
                batch_id: 11,
                quantity: 1,
              },
            ],
          },
        }
      );
    });

    expect(
      await screen.findByText(
        "Sale completed successfully"
      )
    ).toBeInTheDocument();

    expect(
      screen.getByText(/Sale #501/)
    ).toBeInTheDocument();

    expect(
      screen.getByText("Confirmed total").nextElementSibling
    ).toHaveTextContent(formatPrice(15.5));

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 34. EXISTING CUSTOMER + UPI PAYMENT
  // ===========================================

  test("creates a sale for an existing customer using UPI", async () => {
    const user = userEvent.setup();

    mockRequest.mockResolvedValue({
      data: {
        sale_id: 502,
        total_amount: 31,
      },
    });

    await renderLoadedSale();

    // Arrange
    await user.click(
      screen.getByRole("button", {
        name: "Select existing customer",
      })
    );

    await addParacetamol(user);
    await addParacetamol(user);

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Payment mode",
      }),
      "UPI"
    );

    // Act
    await completeSale(user);

    // Assert
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/sales",
        {
          method: "POST",
          body: {
            customer_id: 7,
            payment_mode: "UPI",
            items: [
              {
                batch_id: 11,
                quantity: 2,
              },
            ],
          },
        }
      );
    });

    expect(
      await screen.findByText(
        "Sale completed successfully"
      )
    ).toBeInTheDocument();

    expect(
      screen.getByText(/Customer: Ravi Kumar/)
    ).toBeInTheDocument();
  });

  // ===========================================
  // 35. MULTIPLE BATCHES IN SALE REQUEST
  // ===========================================

  test("submits all selected batches with quantities", async () => {
    const user = userEvent.setup();

    mockRequest.mockResolvedValue({
      data: {
        sale_id: 503,
        total_amount: 39.25,
      },
    });

    await renderLoadedSale();

    // Arrange
    await addParacetamol(user);
    await addParacetamol(user);

    await user.click(addButton("PAR-102"));

    // Act
    await completeSale(user);

    // Assert
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/sales",
        {
          method: "POST",
          body: {
            customer_id: null,
            payment_mode: "Cash",
            items: [
              { batch_id: 11, quantity: 2 },
              { batch_id: 12, quantity: 1 },
            ],
          },
        }
      );
    });
  });

  // ===========================================
  // 36. LOCK CART AFTER SUCCESS
  // ===========================================

  test("locks the completed sale against further changes", async () => {
    const user = userEvent.setup();

    await renderLoadedSale();

    await addParacetamol(user);

    await completeSale(user);

    await screen.findByText(
      "Sale completed successfully"
    );

    // Assert
    expect(addButton("PAR-101")).toBeDisabled();

    expect(
      screen.getByRole("button", {
        name: "Clear cart",
      })
    ).toBeDisabled();

    expect(
      screen.getByRole("button", {
        name: "Sale completed",
      })
    ).toBeDisabled();

    expect(
      screen.getByRole("button", {
        name: "Reload available stock",
      })
    ).toBeDisabled();
  });

  // ===========================================
  // 37. START A NEW SALE
  // ===========================================

  test("resets cart, customer and payment after successful sale", async () => {
    const user = userEvent.setup();

    await renderLoadedSale();

    await user.click(
      screen.getByRole("button", {
        name: "Select existing customer",
      })
    );

    await addParacetamol(user);

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Payment mode",
      }),
      "Card"
    );

    await completeSale(user);

    await screen.findByText(
      "Sale completed successfully"
    );

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Start new sale",
      })
    );

    // Assert
    expect(
      screen.getByText("Customer mode: walk-in")
    ).toBeInTheDocument();

    expect(
      screen.getByRole("combobox", {
        name: "Payment mode",
      })
    ).toHaveValue("Cash");

    expect(
      screen.getByText(
        "Add a medicine batch to start this sale."
      )
    ).toBeInTheDocument();

    expect(
      screen.queryByText(
        "Sale completed successfully"
      )
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(
        getAvailableInventory
      ).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================
  // 38. KNOWN API ERROR
  // ===========================================

  test("shows a known sale failure and refreshes inventory", async () => {
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      Object.assign(
        new Error("Insufficient stock"),
        { status: 409 }
      )
    );

    await renderLoadedSale();

    await addParacetamol(user);

    // Act
    await completeSale(user);

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Insufficient stock");

    await waitFor(() => {
      expect(
        getAvailableInventory
      ).toHaveBeenCalledTimes(2);
    });

    expect(
      screen.queryByText(
        "Sale completed successfully"
      )
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 39-40. AUTHENTICATION ERRORS
  // ===========================================

  test.each([401, 403])(
    "does not reload inventory for HTTP %s",
    async (status) => {
      const user = userEvent.setup();

      mockRequest.mockRejectedValueOnce(
        Object.assign(
          new Error("Access denied"),
          { status }
        )
      );

      await renderLoadedSale();

      await addParacetamol(user);

      // Act
      await completeSale(user);

      // Assert
      expect(
        await screen.findByRole("alert")
      ).toHaveTextContent("Access denied");

      expect(
        getAvailableInventory
      ).toHaveBeenCalledTimes(1);
    }
  );

  // ===========================================
  // 41. UNKNOWN NETWORK OUTCOME
  // ===========================================

  test("locks checkout when network failure leaves outcome unknown", async () => {
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      new Error("Failed to fetch")
    );

    await renderLoadedSale();

    await addParacetamol(user);

    // Act
    await completeSale(user);

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "We could not confirm whether this sale was saved."
    );

    expect(
      screen.getByRole("button", {
        name: "Start a new cart",
      })
    ).toBeDisabled();

    expect(addButton("PAR-101")).toBeDisabled();

    // Do not automatically retry a sale
    // that might already have been recorded.
    expect(mockRequest).toHaveBeenCalledTimes(1);

    expect(
      getAvailableInventory
    ).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 42-43. SERVER ERROR / TIMEOUT
  // ===========================================

  test.each([500, 408])(
    "treats HTTP %s as an uncertain sale outcome",
    async (status) => {
      const user = userEvent.setup();

      mockRequest.mockRejectedValueOnce(
        Object.assign(
          new Error("Request failed"),
          { status }
        )
      );

      await renderLoadedSale();

      await addParacetamol(user);

      // Act
      await completeSale(user);

      // Assert
      expect(
        await screen.findByRole("alert")
      ).toHaveTextContent(
        "We could not confirm whether this sale was saved."
      );

      expect(
        screen.getByRole("button", {
          name: "Start a new cart",
        })
      ).toBeDisabled();

      expect(mockRequest).toHaveBeenCalledTimes(1);
    }
  );

  // ===========================================
  // 44. ADMIN VERIFICATION REQUIRED
  // ===========================================

  test("requires admin verification before resetting uncertain sale", async () => {
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      new Error("Connection lost")
    );

    await renderLoadedSale();

    await addParacetamol(user);

    await completeSale(user);

    await screen.findByRole("alert");

    const newCartButton = screen.getByRole("button", {
      name: "Start a new cart",
    });

    // Initially blocked
    expect(newCartButton).toBeDisabled();

    // Act: Confirm admin verification
    await user.click(
      screen.getByRole("checkbox", {
        name: /I have checked with an admin/,
      })
    );

    // Assert
    expect(newCartButton).toBeEnabled();

    // Act: Start fresh cart
    await user.click(newCartButton);

    expect(
      screen.getByText("0 Selected batches")
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        getAvailableInventory
      ).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================
  // 45. INVALID SALE RESPONSE
  // ===========================================

  test("treats an invalid success response as unconfirmed", async () => {
    const user = userEvent.setup();

    // Server response missing sale_id.
    mockRequest.mockResolvedValueOnce({
      data: {
        total_amount: 15.5,
      },
    });

    await renderLoadedSale();

    await addParacetamol(user);

    // Act
    await completeSale(user);

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "We could not confirm whether this sale was saved."
    );

    expect(
      screen.queryByText(
        "Sale completed successfully"
      )
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 46. DUPLICATE CHECKOUT PREVENTION
  // ===========================================

  test("prevents duplicate checkout requests while submitting", async () => {
    const user = userEvent.setup();

    let resolveSale;

    mockRequest.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSale = resolve;
        })
    );

    await renderLoadedSale();

    await addParacetamol(user);

    // Act
    await completeSale(user);

    // Assert loading state
    expect(
      screen.getByRole("button", {
        name: "Completing sale...",
      })
    ).toBeDisabled();

    expect(addButton("PAR-101")).toBeDisabled();

    // Force another submission.
    fireEvent.submit(
      screen
        .getByRole("button", {
          name: "Completing sale...",
        })
        .closest("form")
    );

    // Still only one HTTP request.
    expect(mockRequest).toHaveBeenCalledTimes(1);

    // Complete original request.
    await act(async () => {
      resolveSale({
        data: {
          sale_id: 501,
          total_amount: 15.5,
        },
      });
    });

    expect(
      screen.getByText(
        "Sale completed successfully"
      )
    ).toBeInTheDocument();
  });

  // ===========================================
  // 47. CLEAR SALE ERROR WHEN CART CHANGES
  // ===========================================

  test("clears a previous sale error when quantity changes", async () => {
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      Object.assign(
        new Error("Insufficient stock"),
        { status: 400 }
      )
    );

    await renderLoadedSale();

    await addParacetamol(user);

    await completeSale(user);

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Insufficient stock");

    await waitFor(() => {
      expect(
        getAvailableInventory
      ).toHaveBeenCalledTimes(2);
    });

    // Act
    changeQuantity("2");

    // Assert
    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 48. CUSTOMER CHANGE CLEARS ERROR
  // ===========================================

  test("clears previous sale error when customer changes", async () => {
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      Object.assign(
        new Error("Sale rejected"),
        { status: 400 }
      )
    );

    await renderLoadedSale();

    await addParacetamol(user);

    await completeSale(user);

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Sale rejected");

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Select existing customer",
      })
    );

    // Assert
    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();

    expect(
      screen.getByText("Selected customer: Ravi Kumar")
    ).toBeInTheDocument();
  });
});
