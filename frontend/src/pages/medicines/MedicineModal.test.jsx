
import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import MedicineModal from "./MedicineModal";
import useAuth from "../../hooks/useAuth";
import { getManufacturers } from "../../services/manufacturer.service";

// =============================================
// MOCK DEPENDENCIES
// =============================================

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

vi.mock("../../services/manufacturer.service", () => ({
  getManufacturers: vi.fn(),
}));

// =============================================
// TEST DATA
// =============================================

const manufacturers = [
  {
    manufacturer_id: 1,
    name: "Acme Pharma",
    is_active: true,
  },
  {
    manufacturer_id: 2,
    name: "Inactive Pharma",
    is_active: false,
  },
];

const medicine = {
  medicine_id: 10,
  name: "Paracetamol",
  manufacturer_id: 1,
  manufacturer: "Acme Pharma",
  manufacturer_is_active: true,
  category: "Tablet",
  reorder_level: 10,
  medicine_is_active: true,
};

const mockRequest = vi.fn();
const onClose = vi.fn();
const onSuccess = vi.fn();

// =============================================
// HELPER FUNCTIONS
// =============================================

function renderModal(action = "create", selectedMedicine) {
  return render(
    <MedicineModal
      action={action}
      medicine={selectedMedicine}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

async function fillCreateForm(user) {
  await screen.findByRole("option", {
    name: "Acme Pharma",
  });

  await user.type(
    screen.getByLabelText("Medicine name"),
    "  Ibuprofen  "
  );

  await user.selectOptions(
    screen.getByLabelText("Manufacturer"),
    "1"
  );

  await user.selectOptions(
    screen.getByLabelText("Category"),
    "Tablet"
  );
}

// =============================================
// MEDICINE MODAL TESTS
// =============================================

describe("MedicineModal", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    useAuth.mockReturnValue({
      user: { user_id: 1, role: "Admin" },
      authenticatedRequest: mockRequest,
    });

    getManufacturers.mockResolvedValue(manufacturers);

    mockRequest.mockResolvedValue({
      message: "Saved successfully.",
    });
  });

  // ===========================================
  // 1. RENDER CREATE FORM
  // ===========================================

  test("renders the create form and loads manufacturers", async () => {
    // Arrange & Act
    renderModal();

    // Assert
    expect(
      screen.getByLabelText("Medicine name")
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Manufacturer")
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Category")
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Reorder level")
    ).toHaveValue(10);

    expect(
      await screen.findByRole("option", {
        name: "Acme Pharma",
      })
    ).toBeInTheDocument();

    expect(getManufacturers).toHaveBeenCalledWith(
      mockRequest
    );

    expect(
      screen.getByRole("button", {
        name: "Add Medicine",
      })
    ).toBeEnabled();
  });

  // ===========================================
  // 2. CREATE MEDICINE
  // ===========================================

  test("creates a medicine with trimmed name and numeric fields", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal();

    await fillCreateForm(user);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Add Medicine",
      })
    );

    // Assert
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/medicines",
        {
          method: "POST",
          body: {
            name: "Ibuprofen",
            manufacturer_id: 1,
            category: "Tablet",
            reorder_level: 10,
          },
        }
      );

      expect(onSuccess).toHaveBeenCalledWith(
        "Saved successfully."
      );
    });
  });

  // ===========================================
  // 3. REQUIRED FIELD VALIDATION
  // ===========================================

  test("shows errors for missing required fields", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal();

    await screen.findByRole("option", {
      name: "Acme Pharma",
    });

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Add Medicine",
      })
    );

    // Assert
    expect(
      screen.getByText("Enter the medicine name.")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Select an active manufacturer.")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Select a category.")
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Medicine name")
    ).toHaveFocus();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 4-7. INVALID REORDER LEVEL
  // ===========================================

  test.each(["", "-1", "1.5", "2147483648"])(
    "rejects invalid reorder level %j",
    async (reorderLevel) => {
      // Arrange
      const user = userEvent.setup();

      renderModal();

      await fillCreateForm(user);

      const input =
        screen.getByLabelText("Reorder level");

      // Act
      await user.clear(input);

      if (reorderLevel) {
        await user.type(input, reorderLevel);
      }

      await user.click(
        screen.getByRole("button", {
          name: "Add Medicine",
        })
      );

      // Assert
      expect(
        screen.getByText(
          "Enter a whole number from 0 to 2147483647."
        )
      ).toBeInTheDocument();

      expect(mockRequest).not.toHaveBeenCalled();
    }
  );

  // ===========================================
  // 8. MEDICINE NAME LENGTH
  // ===========================================

  test("limits the medicine name to 100 characters", () => {
    // Arrange
    renderModal();

    // Assert
    expect(
      screen.getByLabelText("Medicine name")
    ).toHaveAttribute("maxlength", "100");
  });

  // ===========================================
  // 9. NO ACTIVE MANUFACTURERS
  // ===========================================

  test("blocks creation when no active manufacturers exist", async () => {
    // Arrange
    getManufacturers.mockResolvedValue([]);

    // Act
    renderModal();

    // Assert
    expect(
      await screen.findByText(
        /Add or restore a manufacturer before saving/
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Add Medicine",
      })
    ).toBeDisabled();
  });

  // ===========================================
  // 10. MANUFACTURER LOADING ERROR + RETRY
  // ===========================================

  test("shows manufacturer loading error and retries", async () => {
    // Arrange
    const user = userEvent.setup();

    getManufacturers.mockRejectedValueOnce(
      new Error("Network unavailable")
    );

    renderModal();

    // Assert initial error
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Network unavailable");

    expect(
      screen.getByRole("button", {
        name: "Add Medicine",
      })
    ).toBeDisabled();

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Retry loading manufacturers",
      })
    );

    // Assert
    expect(
      await screen.findByRole("option", {
        name: "Acme Pharma",
      })
    ).toBeInTheDocument();

    expect(getManufacturers).toHaveBeenCalledTimes(2);

    expect(
      screen.getByRole("button", {
        name: "Add Medicine",
      })
    ).toBeEnabled();
  });

  // ===========================================
  // 11. NON-ADMIN RESTRICTION
  // ===========================================

  test("disables medicine management for non-admin users", async () => {
    // Arrange
    useAuth.mockReturnValue({
      user: {
        user_id: 2,
        role: "Pharmacist",
      },
      authenticatedRequest: mockRequest,
    });

    // Act
    renderModal();

    await screen.findByRole("option", {
      name: "Acme Pharma",
    });

    // Assert
    expect(
      screen.getByRole("button", {
        name: "Add Medicine",
      })
    ).toBeDisabled();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 12. FORCED SUBMISSION BY NON-ADMIN
  // ===========================================

  test("also rejects a forced submission by a non-admin", async () => {
    // Arrange
    useAuth.mockReturnValue({
      user: { role: "Customer" },
      authenticatedRequest: mockRequest,
    });

    renderModal();

    await screen.findByRole("option", {
      name: "Acme Pharma",
    });

    // Act
    fireEvent.submit(
      screen
        .getByRole("button", {
          name: "Add Medicine",
        })
        .closest("form")
    );

    // Assert
    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Only administrators can manage medicines."
    );

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 13. EDIT FORM INITIAL VALUES
  // ===========================================

  test("prefills edit fields and disables saving without changes", async () => {
    // Arrange & Act
    renderModal("edit", medicine);

    await screen.findByRole("option", {
      name: "Acme Pharma",
    });

    // Assert
    expect(
      screen.getByLabelText("Medicine name")
    ).toHaveValue("Paracetamol");

    expect(
      screen.getByLabelText("Manufacturer")
    ).toHaveValue("1");

    expect(
      screen.getByLabelText("Category")
    ).toHaveValue("Tablet");

    expect(
      screen.getByLabelText("Reorder level")
    ).toHaveValue(10);

    expect(
      screen.getByRole("button", {
        name: "Save Changes",
      })
    ).toBeDisabled();
  });

  // ===========================================
  // 14. UPDATE MEDICINE
  // ===========================================

  test("updates a changed medicine", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal("edit", medicine);

    await screen.findByRole("option", {
      name: "Acme Pharma",
    });

    // Act
    await user.clear(
      screen.getByLabelText("Medicine name")
    );

    await user.type(
      screen.getByLabelText("Medicine name"),
      "Paracetamol Plus"
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save Changes",
      })
    );

    // Assert
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/medicines/10",
        {
          method: "PUT",
          body: {
            name: "Paracetamol Plus",
            manufacturer_id: 1,
            category: "Tablet",
            reorder_level: 10,
          },
        }
      );

      expect(onSuccess).toHaveBeenCalledWith(
        "Saved successfully."
      );
    });
  });

  // ===========================================
  // 15. EDIT INACTIVE MEDICINE
  // ===========================================

  test("refuses to edit an inactive medicine", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal("edit", {
      ...medicine,
      medicine_is_active: false,
    });

    await screen.findByRole("option", {
      name: "Acme Pharma",
    });

    // Act
    await user.type(
      screen.getByLabelText("Medicine name"),
      " Plus"
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save Changes",
      })
    );

    // Assert
    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Restore this medicine before editing."
    );

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 16. EDIT WITH INACTIVE MANUFACTURER
  // ===========================================

  test("requires an active manufacturer when editing", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal("edit", {
      ...medicine,
      manufacturer_id: 2,
      manufacturer: "Inactive Pharma",
      manufacturer_is_active: false,
    });

    await screen.findByRole("option", {
      name: "Acme Pharma",
    });

    // Assert warning
    expect(
      screen.getByText(
        /Select an active manufacturer, or restore/
      )
    ).toBeInTheDocument();

    // Act
    await user.type(
      screen.getByLabelText("Medicine name"),
      " Plus"
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save Changes",
      })
    );

    // Assert
    expect(
      screen.getByText(
        "Select an active manufacturer."
      )
    ).toBeInTheDocument();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 17. DEACTIVATE MEDICINE
  // ===========================================

  test("deactivates an existing medicine", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal("deactivate", medicine);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Deactivate",
      })
    );

    // Assert
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/medicines/10/deactivate",
        {
          method: "PATCH",
        }
      );

      expect(onSuccess).toHaveBeenCalledWith(
        "Saved successfully."
      );
    });

    expect(getManufacturers).not.toHaveBeenCalled();
  });

  // ===========================================
  // 18. RESTORE MEDICINE
  // ===========================================

  test("restores an inactive medicine", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal("restore", {
      ...medicine,
      medicine_is_active: false,
    });

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Restore",
      })
    );

    // Assert
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/medicines/10/restore",
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
  // 19. RESTORE WARNING
  // ===========================================

  test("warns if the manufacturer is inactive during restore", () => {
    // Arrange & Act
    renderModal("restore", {
      ...medicine,
      medicine_is_active: false,
      manufacturer_is_active: false,
    });

    // Assert
    expect(
      screen.getByText(
        /The manufacturer was inactive/
      )
    ).toBeInTheDocument();
  });

  // ===========================================
  // 20. DUPLICATE INACTIVE MEDICINE
  // ===========================================

  test("offers to restore an inactive duplicate after a 409 response", async () => {
    // Arrange
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      Object.assign(new Error("Medicine exists"), {
        status: 409,
        data: {
          requiresConfirmation: true,
          medicineId: 42,
        },
      })
    );

    renderModal();

    await fillCreateForm(user);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Add Medicine",
      })
    );

    // Assert restore confirmation appears
    expect(
      await screen.findByRole("button", {
        name: "Restore Medicine",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        /This medicine already exists/
      )
    ).toBeInTheDocument();

    // Act: Confirm restore
    await user.click(
      screen.getByRole("button", {
        name: "Restore Medicine",
      })
    );

    // Assert
    await waitFor(() => {
      expect(mockRequest).toHaveBeenLastCalledWith(
        "/medicines/42/restore",
        {
          method: "PATCH",
        }
      );

      expect(mockRequest).toHaveBeenCalledTimes(2);

      expect(onSuccess).toHaveBeenCalledWith(
        "Saved successfully."
      );
    });
  });

  // ===========================================
  // 21. CANCEL DUPLICATE RESTORE
  // ===========================================

  test("can return to the form from duplicate restore confirmation", async () => {
    // Arrange
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      Object.assign(new Error("Medicine exists"), {
        status: 409,
        data: {
          requiresConfirmation: true,
          medicineId: 42,
        },
      })
    );

    renderModal();

    await fillCreateForm(user);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Add Medicine",
      })
    );

    await screen.findByRole("button", {
      name: "Restore Medicine",
    });

    await user.click(
      screen.getByRole("button", {
        name: "Back to medicine details",
      })
    );

    // Assert
    expect(
      screen.getByLabelText("Medicine name")
    ).toHaveValue("  Ibuprofen  ");

    expect(
      screen.getByRole("button", {
        name: "Add Medicine",
      })
    ).toBeEnabled();

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 22. API ERROR HANDLING
  // ===========================================

  test("displays API failure and clears it when the user edits a field", async () => {
    // Arrange
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      new Error("Server unavailable")
    );

    renderModal();

    await fillCreateForm(user);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Add Medicine",
      })
    );

    // Assert error
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Server unavailable");

    expect(onSuccess).not.toHaveBeenCalled();

    // Act: Edit the name
    await user.type(
      screen.getByLabelText("Medicine name"),
      " X"
    );

    // Assert error cleared
    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 23. LOADING & DUPLICATE SUBMISSIONS
  // ===========================================

  test("blocks close and duplicate submissions while saving", async () => {
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

    await fillCreateForm(user);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Add Medicine",
      })
    );

    // Assert loading state
    expect(
      screen.getByRole("button", {
        name: "Saving...",
      })
    ).toBeDisabled();

    expect(
      screen.getByRole("button", {
        name: "Cancel",
      })
    ).toBeDisabled();

    // Force second submission
    fireEvent.submit(
      screen
        .getByRole("button", {
          name: "Saving...",
        })
        .closest("form")
    );

    // Assert only one request
    expect(mockRequest).toHaveBeenCalledTimes(1);

    expect(onClose).not.toHaveBeenCalled();

    // Finish request
    await act(async () => {
      resolveRequest({
        message: "Created",
      });
    });

    expect(onSuccess).toHaveBeenCalledWith(
      "Created"
    );
  });

  // ===========================================
  // 24. CANCEL BUTTON
  // ===========================================

  test("calls onClose when Cancel is clicked", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal("deactivate", medicine);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Cancel",
      })
    );

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);

    expect(mockRequest).not.toHaveBeenCalled();
  });
});
