
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

import SaleDetailsModal from "./SaleDetailsModal";
import useAuth from "../../hooks/useAuth";
import { getSaleById } from "../../services/sales.service";
import { getMyPurchaseById } from "../../services/purchase.service";
import { formatPrice } from "../../utils/batch";

// =============================================
// MOCK DEPENDENCIES
// =============================================

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

vi.mock("../../services/sales.service", () => ({
  getSaleById: vi.fn(),
}));

vi.mock("../../services/purchase.service", () => ({
  getMyPurchaseById: vi.fn(),
}));

// =============================================
// TEST DATA
// =============================================

const sale = {
  sale_id: 101,
  customer_name: "Ravi Kumar",
  pharmacist_name: "Meena",
  payment_mode: "UPI",
  total_amount: 49.75,
  created_at: "2026-01-10T10:00:00.000Z",

  items: [
    {
      sale_item_id: 1,
      medicine_name: "Paracetamol",
      manufacturer_name: "ABC Pharma",
      batch_number: "PAR-101",
      quantity: 2,
      selling_price: 12.5,
      subtotal: 25,
    },
    {
      sale_item_id: 2,
      medicine_name: "Ibuprofen",
      manufacturer_name: "Zen Pharma",
      batch_number: "IBU-201",
      quantity: 1,
      selling_price: 24.75,
      subtotal: 24.75,
    },
  ],
};

const mockRequest = vi.fn();
const onClose = vi.fn();

// =============================================
// HELPER FUNCTIONS
// =============================================

function renderModal({
  saleId = 101,
  audience = "admin",
} = {}) {
  return render(
    <SaleDetailsModal
      saleId={saleId}
      audience={audience}
      onClose={onClose}
    />
  );
}

function medicineRows() {
  const region = screen.getByRole("region", {
    name: "Medicines for sale 101",
  });

  return within(region)
    .getAllByRole("row")
    .slice(1);
}

function displayedTotal() {
  return screen.getByText(
    "Total amount"
  ).nextElementSibling;
}

function displayedUnits() {
  return screen.getByText(
    "Total units"
  ).nextElementSibling;
}

// =============================================
// SALE DETAILS MODAL TESTS
// =============================================

describe("SaleDetailsModal", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    useAuth.mockReturnValue({
      authenticatedRequest: mockRequest,
    });

    getSaleById.mockResolvedValue(sale);
    getMyPurchaseById.mockResolvedValue(sale);
  });

  // ===========================================
  // 1. INITIAL LOADING
  // ===========================================

  test("shows loading state while fetching sale details", async () => {
    // Arrange
    let resolveDetails;

    getSaleById.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDetails = resolve;
        })
    );

    // Act
    renderModal();

    // Assert
    expect(
      screen.getByRole("status")
    ).toHaveTextContent(
      "Loading medicine details..."
    );

    expect(
      screen.queryByText("Paracetamol")
    ).not.toBeInTheDocument();

    // Finish loading
    await act(async () => {
      resolveDetails(sale);
    });

    expect(
      screen.getByText("Sale #101")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 2. FETCH ADMIN SALE DETAILS
  // ===========================================

  test("fetches sale details using admin service", async () => {
    // Arrange & Act
    renderModal();

    await screen.findByText("Sale #101");

    // Assert
    expect(getSaleById).toHaveBeenCalledWith(
      mockRequest,
      101
    );

    expect(getSaleById).toHaveBeenCalledTimes(1);

    expect(
      getMyPurchaseById
    ).not.toHaveBeenCalled();
  });

  // ===========================================
  // 3. ADMIN MODAL INFORMATION
  // ===========================================

  test("displays complete sale information for admin", async () => {
    // Arrange
    renderModal();

    // Assert
    expect(
      await screen.findByText("Sale #101")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Customer")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Ravi Kumar")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Pharmacist")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Meena")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Payment mode")
    ).toBeInTheDocument();

    expect(
      screen.getByText("UPI")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 4. DISPLAY MEDICINES
  // ===========================================

  test("displays all medicine items in the sale", async () => {
    // Arrange
    renderModal();

    await screen.findByText("Sale #101");

    // Assert
    const rows = medicineRows();

    expect(rows).toHaveLength(2);

    expect(rows[0]).toHaveTextContent(
      "Paracetamol"
    );

    expect(rows[0]).toHaveTextContent(
      "ABC Pharma"
    );

    expect(rows[0]).toHaveTextContent(
      "PAR-101"
    );

    expect(rows[1]).toHaveTextContent(
      "Ibuprofen"
    );

    expect(rows[1]).toHaveTextContent(
      "Zen Pharma"
    );

    expect(rows[1]).toHaveTextContent(
      "IBU-201"
    );
  });

  // ===========================================
  // 5. QUANTITY CALCULATION
  // ===========================================

  test("calculates total units from all medicine items", async () => {
    // Arrange
    renderModal();

    await screen.findByText("Sale #101");

    // 2 Paracetamol + 1 Ibuprofen = 3

    // Assert
    expect(displayedUnits()).toHaveTextContent(
      "3"
    );
  });

  // ===========================================
  // 6. UNIT PRICE AND SUBTOTAL
  // ===========================================

  test("displays recorded medicine prices and subtotals", async () => {
    // Arrange
    renderModal();

    await screen.findByText("Sale #101");

    const rows = medicineRows();

    // Assert first medicine
    expect(rows[0]).toHaveTextContent(
      formatPrice(12.5)
    );

    expect(rows[0]).toHaveTextContent(
      formatPrice(25)
    );

    // Assert second medicine
    expect(rows[1]).toHaveTextContent(
      formatPrice(24.75)
    );
  });

  // ===========================================
  // 7. TOTAL SALE AMOUNT
  // ===========================================

  test("displays the recorded total sale amount", async () => {
    // Arrange
    renderModal();

    await screen.findByText("Sale #101");

    // Assert
    expect(displayedTotal()).toHaveTextContent(
      formatPrice(49.75)
    );
  });

  // ===========================================
  // 8. SAME MEDICINE IN MULTIPLE BATCHES
  // ===========================================

  test("displays the same medicine from different batches separately", async () => {
    // Arrange
    getSaleById.mockResolvedValue({
      ...sale,
      items: [
        {
          ...sale.items[0],
          sale_item_id: 1,
          batch_number: "PAR-101",
          quantity: 2,
        },
        {
          ...sale.items[0],
          sale_item_id: 3,
          batch_number: "PAR-102",
          quantity: 3,
        },
      ],
    });

    // Act
    renderModal();

    await screen.findByText("Sale #101");

    // Assert
    const rows = medicineRows();

    expect(rows).toHaveLength(2);

    expect(rows[0]).toHaveTextContent(
      "PAR-101"
    );

    expect(rows[1]).toHaveTextContent(
      "PAR-102"
    );

    expect(displayedUnits()).toHaveTextContent(
      "5"
    );
  });

  // ===========================================
  // 9. EMPTY MEDICINE ITEMS
  // ===========================================

  test("shows a message when sale contains no medicine details", async () => {
    // Arrange
    getSaleById.mockResolvedValue({
      ...sale,
      items: [],
    });

    // Act
    renderModal();

    await screen.findByText("Sale #101");

    // Assert
    expect(
      screen.getByText(
        "No medicine details are available for this sale."
      )
    ).toBeInTheDocument();

    expect(displayedUnits()).toHaveTextContent(
      "0"
    );

    expect(
      screen.queryByRole("region", {
        name: "Medicines for sale 101",
      })
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 10. VALID DATE
  // ===========================================

  test("formats the sale date for display", async () => {
    // Arrange
    renderModal();

    // Act
    const heading = await screen.findByText(
      "Sale #101"
    );

    // Assert
    expect(
      heading.nextElementSibling
    ).toHaveTextContent(/Jan 2026/);
  });

  // ===========================================
  // 11-12. INVALID OR MISSING DATE
  // ===========================================

  test.each([
    null,
    "invalid-date",
  ])(
    "displays fallback for invalid date %j",
    async (createdAt) => {
      // Arrange
      getSaleById.mockResolvedValue({
        ...sale,
        created_at: createdAt,
      });

      // Act
      renderModal();

      const heading = await screen.findByText(
        "Sale #101"
      );

      // Assert
      expect(
        heading.nextElementSibling
      ).toHaveTextContent("—");
    }
  );

  // ===========================================
  // 13. ADMIN API ERROR
  // ===========================================

  test("displays API error when sale details fail to load", async () => {
    // Arrange
    getSaleById.mockRejectedValueOnce(
      new Error("Network error")
    );

    // Act
    renderModal();

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Network error");

    expect(
      screen.getByRole("button", {
        name: "Retry",
      })
    ).toBeInTheDocument();
  });

  // ===========================================
  // 14. FALLBACK API ERROR
  // ===========================================

  test("displays fallback error when no message is provided", async () => {
    // Arrange
    getSaleById.mockRejectedValueOnce(
      new Error("")
    );

    // Act
    renderModal();

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to load medicine details."
    );
  });

  // ===========================================
  // 15. RETRY AFTER FAILURE
  // ===========================================

  test("retries fetching sale details after failure", async () => {
    // Arrange
    const user = userEvent.setup();

    getSaleById
      .mockRejectedValueOnce(
        new Error("Server unavailable")
      )
      .mockResolvedValueOnce(sale);

    renderModal();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Server unavailable"
    );

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Retry",
      })
    );

    // Assert
    expect(
      await screen.findByText("Sale #101")
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();

    expect(getSaleById).toHaveBeenCalledTimes(2);
  });

  // ===========================================
  // 16. CLOSE AFTER SUCCESS
  // ===========================================

  test("calls onClose when Close is clicked", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal();

    await screen.findByText("Sale #101");

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Close",
        exact: true,
      })
    );

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 17. CLOSE AFTER ERROR
  // ===========================================

  test("allows closing the modal after an API failure", async () => {
    // Arrange
    const user = userEvent.setup();

    getSaleById.mockRejectedValueOnce(
      new Error("Network error")
    );

    renderModal();

    await screen.findByRole("alert");

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Close",
        exact: true,
      })
    );

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 18. CUSTOMER PURCHASE DETAILS
  // ===========================================

  test("uses purchase service for customer audience", async () => {
    // Arrange & Act
    renderModal({
      audience: "customer",
    });

    // Assert
    expect(
      await screen.findByText("Purchase #101")
    ).toBeInTheDocument();

    expect(
      getMyPurchaseById
    ).toHaveBeenCalledWith(
      mockRequest,
      101
    );

    expect(
      getSaleById
    ).not.toHaveBeenCalled();
  });

  // ===========================================
  // 19. CUSTOMER VIEW INFORMATION
  // ===========================================

  test("shows customer-specific purchase details", async () => {
    // Arrange
    renderModal({
      audience: "customer",
    });

    await screen.findByText("Purchase #101");

    // Assert
    expect(
      screen.getByText("Served by")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Meena")
    ).toBeInTheDocument();

    expect(
      screen.getByText("UPI")
    ).toBeInTheDocument();

    // Customer view should not expose the
    // admin-only customer field.
    expect(
      screen.queryByText("Customer", {
        exact: true,
      })
    ).not.toBeInTheDocument();

    expect(
      screen.queryByText("Ravi Kumar")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 20. CUSTOMER PURCHASED MEDICINES
  // ===========================================

  test("displays purchased medicines for customer", async () => {
    // Arrange
    renderModal({
      audience: "customer",
    });

    await screen.findByText("Purchase #101");

    // Assert
    expect(medicineRows()).toHaveLength(2);

    expect(
      screen.getByText("Paracetamol")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Ibuprofen")
    ).toBeInTheDocument();

    expect(displayedUnits()).toHaveTextContent(
      "3"
    );

    expect(displayedTotal()).toHaveTextContent(
      formatPrice(49.75)
    );
  });

  // ===========================================
  // 21. CUSTOMER EMPTY PURCHASE ITEMS
  // ===========================================

  test("handles customer purchases with no medicine items", async () => {
    // Arrange
    getMyPurchaseById.mockResolvedValue({
      ...sale,
      items: [],
    });

    // Act
    renderModal({
      audience: "customer",
    });

    await screen.findByText("Purchase #101");

    // Assert
    expect(
      screen.getByText(
        "No medicine details are available for this sale."
      )
    ).toBeInTheDocument();

    expect(displayedUnits()).toHaveTextContent(
      "0"
    );
  });

  // ===========================================
  // 22. CUSTOMER API ERROR
  // ===========================================

  test("displays customer purchase API errors", async () => {
    // Arrange
    getMyPurchaseById.mockRejectedValueOnce(
      new Error("Purchase not found")
    );

    // Act
    renderModal({
      audience: "customer",
    });

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Purchase not found"
    );

    expect(
      getSaleById
    ).not.toHaveBeenCalled();
  });

  // ===========================================
  // 23. CUSTOMER FALLBACK ERROR
  // ===========================================

  test("shows fallback message for customer purchase failure", async () => {
    // Arrange
    getMyPurchaseById.mockRejectedValueOnce(
      new Error("")
    );

    // Act
    renderModal({
      audience: "customer",
    });

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to load medicine details."
    );
  });

  // ===========================================
  // 24. CUSTOMER RETRY
  // ===========================================

  test("retries customer purchase details after failure", async () => {
    // Arrange
    const user = userEvent.setup();

    getMyPurchaseById
      .mockRejectedValueOnce(
        new Error("Temporary error")
      )
      .mockResolvedValueOnce(sale);

    renderModal({
      audience: "customer",
    });

    await screen.findByRole("alert");

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Retry",
      })
    );

    // Assert
    expect(
      await screen.findByText("Purchase #101")
    ).toBeInTheDocument();

    expect(
      getMyPurchaseById
    ).toHaveBeenCalledTimes(2);
  });

  // ===========================================
  // 25. CHANGE SALE ID
  // ===========================================

  test("fetches new details when saleId changes", async () => {
    // Arrange
    const otherSale = {
      ...sale,
      sale_id: 202,
      total_amount: 99,
    };

    getSaleById.mockImplementation(
      async (_request, id) =>
        id === 202 ? otherSale : sale
    );

    const { rerender } = renderModal();

    await screen.findByText("Sale #101");

    // Act
    rerender(
      <SaleDetailsModal
        saleId={202}
        audience="admin"
        onClose={onClose}
      />
    );

    // Assert
    expect(
      await screen.findByText("Sale #202")
    ).toBeInTheDocument();

    expect(getSaleById).toHaveBeenLastCalledWith(
      mockRequest,
      202
    );

    expect(
      screen.getByText("Total amount")
        .nextElementSibling
    ).toHaveTextContent(formatPrice(99));
  });

  // ===========================================
  // 26. SWITCH AUDIENCE
  // ===========================================

  test("switches service when audience changes", async () => {
    // Arrange
    const { rerender } = renderModal();

    await screen.findByText("Sale #101");

    // Act
    rerender(
      <SaleDetailsModal
        saleId={101}
        audience="customer"
        onClose={onClose}
      />
    );

    // Assert
    expect(
      await screen.findByText("Purchase #101")
    ).toBeInTheDocument();

    expect(getSaleById).toHaveBeenCalledTimes(1);

    expect(
      getMyPurchaseById
    ).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 27. IGNORE STALE API RESPONSE
  // ===========================================

  test("ignores outdated sale response after saleId changes", async () => {
    // Arrange
    let resolveFirstRequest;

    getSaleById.mockImplementation(
      (_request, id) => {
        if (id === 101) {
          return new Promise((resolve) => {
            resolveFirstRequest = resolve;
          });
        }

        return Promise.resolve({
          ...sale,
          sale_id: 202,
        });
      }
    );

    const { rerender } = renderModal();

    expect(
      screen.getByText(
        "Loading medicine details..."
      )
    ).toBeInTheDocument();

    // Act: Change sale before first request finishes.
    rerender(
      <SaleDetailsModal
        saleId={202}
        audience="admin"
        onClose={onClose}
      />
    );

    await screen.findByText("Sale #202");

    // Old request finishes later.
    await act(async () => {
      resolveFirstRequest(sale);
    });

    // Assert: New details must remain displayed.
    expect(
      screen.getByText("Sale #202")
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Sale #101")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 28. NO UNNECESSARY REFETCH
  // ===========================================

  test("does not refetch when props remain unchanged", async () => {
    // Arrange
    const { rerender } = renderModal();

    await screen.findByText("Sale #101");

    expect(getSaleById).toHaveBeenCalledTimes(1);

    // Act
    rerender(
      <SaleDetailsModal
        saleId={101}
        audience="admin"
        onClose={onClose}
      />
    );

    // Assert
    expect(getSaleById).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 29. CLOSE DURING LOADING
  // ===========================================

  test("allows closing while sale details are loading", async () => {
    // Arrange
    const user = userEvent.setup();

    let resolveRequest;

    getSaleById.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );

    const { unmount } = renderModal();

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Close",
        exact: true,
      })
    );

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);

    // Simulate the parent removing the modal.
    unmount();

    // Finish the pending request.
    await act(async () => {
      resolveRequest(sale);
    });

    // The closed component must not reappear.
    expect(
      screen.queryByText("Sale #101")
    ).not.toBeInTheDocument();
  });
});
