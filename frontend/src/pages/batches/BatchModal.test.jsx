
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
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import BatchModal from "./BatchModal";
import useAuth from "../../hooks/useAuth";
import { getBatch } from "../../services/batch.service";
import {
  MAX_STOCK,
  todayDate,
  tomorrowDate,
} from "../../utils/batch";

// =============================================
// MOCK DEPENDENCIES
// =============================================

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

// Mock only getBatch.
// Keep the real create, update, stock,
// deactivate and restore service functions.
vi.mock("../../services/batch.service", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    getBatch: vi.fn(),
  };
});

// =============================================
// TEST DATA
// =============================================

const medicine = {
  medicine_id: 1,
  name: "Paracetamol",
  manufacturer: "ABC Pharma",
  medicine_is_active: true,
  manufacturer_is_active: true,
};

const batch = {
  batch_id: 7,
  medicine_id: 1,
  batch_number: "PAR-007",
  purchase_price: 8.5,
  selling_price: 12,
  stock_quantity: 20,
  expiry_date: "2099-12-31",
  is_active: true,
  created_at: "2026-01-01",
};

const mockRequest = vi.fn();
const onClose = vi.fn();
const onSuccess = vi.fn();

// =============================================
// HELPER FUNCTIONS
// =============================================

function renderModal(
  action = "create",
  selectedMedicine = medicine,
  selectedBatch = batch
) {
  return render(
    <BatchModal
      action={action}
      medicine={selectedMedicine}
      batch={action === "create" ? null : selectedBatch}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

function changeField(label, value) {
  fireEvent.change(
    screen.getByLabelText(label),
    {
      target: {
        value: String(value),
      },
    }
  );
}

function fillCreateForm() {
  changeField("Batch number", "  PAR-101  ");
  changeField("Purchase price", "10.50");
  changeField("Selling price", "15.75");
  changeField("Initial stock quantity", "20");
  changeField("Expiry date", tomorrowDate());
}

function submitButton(name) {
  return screen.getByRole("button", { name });
}

// =============================================
// BATCH MODAL TESTS
// =============================================

describe("BatchModal", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    useAuth.mockReturnValue({
      user: {
        user_id: 1,
        role: "Admin",
      },
      authenticatedRequest: mockRequest,
    });

    mockRequest.mockResolvedValue({
      message: "Saved successfully.",
    });

    getBatch.mockResolvedValue(batch);
  });

  // ===========================================
  // 1. RENDER CREATE FORM
  // ===========================================

  test("renders the create batch form", () => {
    // Arrange & Act
    renderModal();

    // Assert
    expect(
      screen.getByLabelText("Batch number")
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Purchase price")
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Selling price")
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Initial stock quantity")
    ).toHaveValue(0);

    expect(
      screen.getByLabelText("Expiry date")
    ).toBeInTheDocument();

    expect(
      submitButton("Add Batch")
    ).toBeEnabled();

    expect(getBatch).not.toHaveBeenCalled();
  });

  // ===========================================
  // 2. CREATE BATCH
  // ===========================================

  test("creates a batch with correct API data", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal();
    fillCreateForm();

    // Act
    await user.click(submitButton("Add Batch"));

    // Assert
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/batches",
        {
          method: "POST",
          body: {
            batch_number: "PAR-101",
            purchase_price: 10.5,
            selling_price: 15.75,
            expiry_date: tomorrowDate(),
            medicine_id: 1,
            stock_quantity: 20,
          },
        }
      );

      expect(onSuccess).toHaveBeenCalledWith(
        "Saved successfully."
      );
    });

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 3. REQUIRED FIELDS
  // ===========================================

  test("rejects missing required batch details", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal();

    // Act
    await user.click(submitButton("Add Batch"));

    // Assert
    expect(
      screen.getByText("Enter the batch number.")
    ).toBeInTheDocument();

    expect(
      screen.getAllByText(
        /Enter a price from 0 to 99999999.99/
      )
    ).toHaveLength(2);

    expect(
      screen.getByText("Choose a future expiry date.")
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Batch number")
    ).toHaveFocus();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 4. WHITESPACE BATCH NUMBER
  // ===========================================

  test("rejects whitespace-only batch number", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal();
    fillCreateForm();

    // Act
    changeField("Batch number", "    ");

    await user.click(submitButton("Add Batch"));

    // Assert
    expect(
      screen.getByText("Enter the batch number.")
    ).toBeInTheDocument();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 5. MAXIMUM BATCH NUMBER LENGTH
  // ===========================================

  test("sets maximum batch number length to 50", () => {
    // Arrange
    renderModal();

    // Assert
    expect(
      screen.getByLabelText("Batch number")
    ).toHaveAttribute("maxlength", "50");
  });

  // ===========================================
  // 6. BATCH NUMBER TOO LONG
  // ===========================================

  test("rejects batch number longer than 50 characters", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal();
    fillCreateForm();

    // Simulate an overlength value directly.
    changeField("Batch number", "A".repeat(51));

    // Act
    await user.click(submitButton("Add Batch"));

    // Assert
    expect(
      screen.getByText("Use 50 characters or fewer.")
    ).toBeInTheDocument();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 7-10. INVALID PURCHASE PRICES
  // ===========================================

  test.each([
    "",
    "-1",
    "1.234",
    "100000000",
  ])(
    "rejects invalid purchase price %j",
    async (price) => {
      // Arrange
      const user = userEvent.setup();

      renderModal();
      fillCreateForm();

      // Act
      changeField("Purchase price", price);

      await user.click(submitButton("Add Batch"));

      // Assert
      expect(
        screen.getByText(
          /Enter a price from 0 to 99999999.99/
        )
      ).toBeInTheDocument();

      expect(mockRequest).not.toHaveBeenCalled();
    }
  );

  // ===========================================
  // 11. INVALID SELLING PRICE
  // ===========================================

  test("rejects an invalid selling price", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal();
    fillCreateForm();

    // Act
    changeField("Selling price", "-1");

    await user.click(submitButton("Add Batch"));

    // Assert
    expect(
      screen.getByText(
        /Enter a price from 0 to 99999999.99/
      )
    ).toBeInTheDocument();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 12. SELLING PRICE LOWER THAN PURCHASE
  // ===========================================

  test("rejects selling price lower than purchase price", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal();
    fillCreateForm();

    // Act
    changeField("Selling price", "9.99");

    await user.click(submitButton("Add Batch"));

    // Assert
    expect(
      screen.getByText(
        "Selling price cannot be less than purchase price."
      )
    ).toBeInTheDocument();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 13. EXPIRY DATE MUST BE FUTURE
  // ===========================================

  test("rejects today's expiry date", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal();
    fillCreateForm();

    // Act
    changeField("Expiry date", todayDate());

    await user.click(submitButton("Add Batch"));

    // Assert
    expect(
      screen.getByText("Choose a future expiry date.")
    ).toBeInTheDocument();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 14-17. INVALID INITIAL STOCK
  // ===========================================

  test.each([
    "",
    "-1",
    "1.5",
    String(MAX_STOCK + 1),
  ])(
    "rejects invalid initial stock %j",
    async (stock) => {
      // Arrange
      const user = userEvent.setup();

      renderModal();
      fillCreateForm();

      // Act
      changeField("Initial stock quantity", stock);

      await user.click(submitButton("Add Batch"));

      // Assert
      expect(
        screen.getByText(
          `Enter a whole number from 0 to ${MAX_STOCK}.`
        )
      ).toBeInTheDocument();

      expect(mockRequest).not.toHaveBeenCalled();
    }
  );

  // ===========================================
  // 18. INACTIVE MEDICINE
  // ===========================================

  test("blocks batch creation for inactive medicine", () => {
    // Arrange
    renderModal("create", {
      ...medicine,
      medicine_is_active: false,
    });

    // Assert
    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Restore this medicine before adding a batch."
    );

    expect(
      submitButton("Add Batch")
    ).toBeDisabled();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 19. NON-ADMIN USER
  // ===========================================

  test("prevents non-admin users from creating batches", () => {
    // Arrange
    useAuth.mockReturnValue({
      user: {
        user_id: 2,
        role: "Pharmacist",
      },
      authenticatedRequest: mockRequest,
    });

    renderModal();

    // Assert button restriction
    expect(
      submitButton("Add Batch")
    ).toBeDisabled();

    // Act: Force form submission
    fireEvent.submit(
      submitButton("Add Batch").closest("form")
    );

    // Assert
    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Only administrators can manage batches."
    );

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 20. FETCH EXISTING BATCH
  // ===========================================

  test("loads existing batch details for editing", async () => {
    // Arrange & Act
    renderModal("edit");

    // Assert
    expect(
      await screen.findByLabelText("Batch number")
    ).toHaveValue("PAR-007");

    expect(
      screen.getByLabelText("Purchase price")
    ).toHaveValue(8.5);

    expect(
      screen.getByLabelText("Selling price")
    ).toHaveValue(12);

    expect(
      screen.getByLabelText("Expiry date")
    ).toHaveValue("2099-12-31");

    expect(
      submitButton("Save Changes")
    ).toBeDisabled();

    expect(getBatch).toHaveBeenCalledWith(
      mockRequest,
      7
    );
  });

  // ===========================================
  // 21. EDIT BATCH
  // ===========================================

  test("updates existing batch details", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal("edit");

    await screen.findByLabelText("Batch number");

    // Act
    changeField("Batch number", "  PAR-008  ");
    changeField("Purchase price", "9.50");
    changeField("Selling price", "14.50");

    await user.click(
      submitButton("Save Changes")
    );

    // Assert
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/batches/7",
        {
          method: "PUT",
          body: {
            batch_number: "PAR-008",
            purchase_price: 9.5,
            selling_price: 14.5,
            expiry_date: "2099-12-31",
          },
        }
      );

      expect(onSuccess).toHaveBeenCalledWith(
        "Saved successfully."
      );
    });
  });

  // ===========================================
  // 22. INACTIVE BATCH EDIT
  // ===========================================

  test("blocks editing an inactive batch", async () => {
    // Arrange
    getBatch.mockResolvedValue({
      ...batch,
      is_active: false,
    });

    renderModal("edit");

    await screen.findByLabelText("Batch number");

    // Assert
    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Restore this batch before changing its details or stock."
    );

    expect(
      submitButton("Save Changes")
    ).toBeDisabled();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 23. LOADING BATCH DETAILS
  // ===========================================

  test("shows loading state while fetching batch details", async () => {
    // Arrange
    let resolveDetails;

    getBatch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDetails = resolve;
        })
    );

    // Act
    renderModal("edit");

    // Assert loading
    expect(
      screen.getByText(
        "Loading current batch details..."
      )
    ).toBeInTheDocument();

    // Finish loading
    await act(async () => {
      resolveDetails(batch);
    });

    // Assert
    expect(
      screen.getByLabelText("Batch number")
    ).toHaveValue("PAR-007");
  });

  // ===========================================
  // 24. FETCH ERROR AND RETRY
  // ===========================================

  test("retries loading batch details after failure", async () => {
    // Arrange
    const user = userEvent.setup();

    getBatch
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(batch);

    renderModal("edit");

    // Assert error
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Network error");

    // Act
    await user.click(
      submitButton("Try again")
    );

    // Assert
    expect(
      await screen.findByLabelText("Batch number")
    ).toHaveValue("PAR-007");

    expect(getBatch).toHaveBeenCalledTimes(2);
  });

  // ===========================================
  // 25. ADD STOCK
  // ===========================================

  test("adds stock to an existing batch", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal("stock");

    await screen.findByLabelText("Quantity to add");

    // Act
    changeField("Quantity to add", "5");

    // Assert expected stock
    expect(
      screen.getByRole("status")
    ).toHaveTextContent(
      "Expected stock after adjustment: 25"
    );

    await user.click(
      submitButton("Confirm Adjustment")
    );

    // Assert API request
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/batches/7/stock",
        {
          method: "PATCH",
          body: {
            quantity: 5,
          },
        }
      );

      expect(onSuccess).toHaveBeenCalledWith(
        "Saved successfully."
      );
    });
  });

  // ===========================================
  // 26. REMOVE STOCK
  // ===========================================

  test("removes stock from an existing batch", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal("stock");

    await screen.findByLabelText("Quantity to add");

    // Act
    await user.selectOptions(
      screen.getByLabelText("Adjustment"),
      "remove"
    );

    changeField("Quantity to remove", "5");

    // Assert expected stock
    expect(
      screen.getByRole("status")
    ).toHaveTextContent(
      "Expected stock after adjustment: 15"
    );

    await user.click(
      submitButton("Confirm Adjustment")
    );

    // Assert
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/batches/7/stock",
        {
          method: "PATCH",
          body: {
            quantity: -5,
          },
        }
      );
    });
  });

  // ===========================================
  // 27-29. INVALID ADJUSTMENT QUANTITIES
  // ===========================================

  test.each([
    "",
    "0",
    "1.5",
  ])(
    "rejects invalid adjustment quantity %j",
    async (quantity) => {
      // Arrange
      const user = userEvent.setup();

      renderModal("stock");

      await screen.findByLabelText("Quantity to add");

      // Act
      changeField("Quantity to add", quantity);

      await user.click(
        submitButton("Confirm Adjustment")
      );

      // Assert
      expect(
        screen.getByText(
          `Enter a whole number from 1 to ${MAX_STOCK}.`
        )
      ).toBeInTheDocument();

      expect(mockRequest).not.toHaveBeenCalled();
    }
  );

  // ===========================================
  // 30. REMOVE MORE THAN CURRENT STOCK
  // ===========================================

  test("prevents removing more than available stock", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal("stock");

    await screen.findByLabelText("Quantity to add");

    // Act
    await user.selectOptions(
      screen.getByLabelText("Adjustment"),
      "remove"
    );

    changeField("Quantity to remove", "21");

    await user.click(
      submitButton("Confirm Adjustment")
    );

    // Assert
    expect(
      screen.getByText(
        "You cannot remove more than the current stock."
      )
    ).toBeInTheDocument();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 31. PREVENT STOCK OVERFLOW
  // ===========================================

  test("prevents stock exceeding MAX_STOCK", async () => {
    // Arrange
    const user = userEvent.setup();

    getBatch.mockResolvedValue({
      ...batch,
      stock_quantity: MAX_STOCK,
    });

    renderModal("stock");

    await screen.findByLabelText("Quantity to add");

    // Act
    changeField("Quantity to add", "1");

    await user.click(
      submitButton("Confirm Adjustment")
    );

    // Assert
    expect(
      screen.getByText(
        "The resulting stock exceeds the supported limit."
      )
    ).toBeInTheDocument();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 32. INACTIVE BATCH STOCK ADJUSTMENT
  // ===========================================

  test("blocks stock changes for inactive batches", async () => {
    // Arrange
    getBatch.mockResolvedValue({
      ...batch,
      is_active: false,
    });

    renderModal("stock");

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Restore this batch before changing its details or stock."
    );

    expect(
      submitButton("Confirm Adjustment")
    ).toBeDisabled();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 33. DEACTIVATE BATCH
  // ===========================================

 
test("deactivates an active batch", async () => {
  // Arrange
  const user = userEvent.setup();

  renderModal("deactivate");

  // Wait for the batch details to be fetched.
  await waitFor(() => {
    expect(getBatch).toHaveBeenCalledWith(
      mockRequest,
      7
    );
  });

  // Wait until the dialog is accessible.
  const deactivateButton = await screen.findByRole(
    "button",
    { name: "Deactivate" }
  );

  expect(deactivateButton).toBeEnabled();

  // Act
  await user.click(deactivateButton);

  // Assert
  await waitFor(() => {
    expect(mockRequest).toHaveBeenCalledWith(
      "/batches/7/deactivate",
      {
        method: "PATCH",
      }
    );

    expect(onSuccess).toHaveBeenCalledWith(
      "Saved successfully."
    );
  });

  expect(mockRequest).toHaveBeenCalledTimes(1);
});


  // ===========================================
  // 34. RESTORE BATCH
  // ===========================================

  test("restores an inactive batch", async () => {
    // Arrange
    const user = userEvent.setup();

    getBatch.mockResolvedValue({
      ...batch,
      is_active: false,
    });

    renderModal("restore");

    await screen.findByText(
      /Restore this batch/
    );

    // Act
    await user.click(
      submitButton("Restore")
    );

    // Assert
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/batches/7/restore",
        {
          method: "PATCH",
        }
      );

      expect(onSuccess).toHaveBeenCalledWith(
        "Saved successfully."
      );
    });
  });

  // ===========================================
  // 35. DEACTIVATE ALREADY INACTIVE BATCH
  // ===========================================

  test("prevents deactivating an inactive batch", async () => {
    // Arrange
    getBatch.mockResolvedValue({
      ...batch,
      is_active: false,
    });

    renderModal("deactivate");

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "This batch is already inactive."
    );

    expect(
      submitButton("Deactivate")
    ).toBeDisabled();
  });

  // ===========================================
  // 36. RESTORE ALREADY ACTIVE BATCH
  // ===========================================

  test("prevents restoring an active batch", async () => {
    // Arrange
    renderModal("restore");

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "This batch is already active."
    );

    expect(
      submitButton("Restore")
    ).toBeDisabled();
  });

  // ===========================================
  // 37. API ERROR
  // ===========================================

  test("displays an API error when creation fails", async () => {
    // Arrange
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      new Error("Server unavailable")
    );

    renderModal();
    fillCreateForm();

    // Act
    await user.click(submitButton("Add Batch"));

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Server unavailable");

    expect(onSuccess).not.toHaveBeenCalled();
  });

  // ===========================================
  // 38. FALLBACK API ERROR
  // ===========================================

  test("displays fallback error message", async () => {
    // Arrange
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      new Error("")
    );

    renderModal();
    fillCreateForm();

    // Act
    await user.click(submitButton("Add Batch"));

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to save changes. Please try again."
    );
  });

  // ===========================================
  // 39. CLEAR API ERROR
  // ===========================================

  test("clears API error when a field changes", async () => {
    // Arrange
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      new Error("Network error")
    );

    renderModal();
    fillCreateForm();

    await user.click(submitButton("Add Batch"));

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Network error");

    // Act
    changeField("Batch number", "PAR-102");

    // Assert
    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 40. DEFAULT SUCCESS MESSAGE
  // ===========================================

  test("uses default success message", async () => {
    // Arrange
    const user = userEvent.setup();

    mockRequest.mockResolvedValueOnce({});

    renderModal();
    fillCreateForm();

    // Act
    await user.click(submitButton("Add Batch"));

    // Assert
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        "Changes saved successfully."
      );
    });
  });

  // ===========================================
  // 41. LOADING & DUPLICATE SUBMISSIONS
  // ===========================================

  test("prevents duplicate submissions while saving", async () => {
    // Arrange
    const user = userEvent.setup();

    let resolveRequest;

    mockRequest.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );

    renderModal();
    fillCreateForm();

    // Act
    await user.click(submitButton("Add Batch"));

    // Assert loading state
    expect(
      submitButton("Saving...")
    ).toBeDisabled();

    expect(
      submitButton("Cancel")
    ).toBeDisabled();

    expect(
      screen.getByLabelText("Batch number")
    ).toBeDisabled();

    // Attempt a duplicate submission.
    fireEvent.submit(
      submitButton("Saving...").closest("form")
    );

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    // Complete the request.
    await act(async () => {
      resolveRequest({
        message: "Batch created",
      });
    });

    expect(onSuccess).toHaveBeenCalledWith(
      "Batch created"
    );
  });

  // ===========================================
  // 42. CANCEL BUTTON
  // ===========================================

  test("calls onClose when Cancel is clicked", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal();

    // Act
    await user.click(
      submitButton("Cancel")
    );

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);

    expect(mockRequest).not.toHaveBeenCalled();
  });
});
