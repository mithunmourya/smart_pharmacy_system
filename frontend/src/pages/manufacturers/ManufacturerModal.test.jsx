
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
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import ManufacturerModal from "./ManufacturerModal";
import useAuth from "../../hooks/useAuth";

// =============================================
// MOCK AUTHENTICATION
// =============================================

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

// =============================================
// TEST DATA
// =============================================

const manufacturer = {
  manufacturer_id: 10,
  name: "ABC Pharma",
  is_active: true,
  created_at: "2026-01-10",
};

const mockRequest = vi.fn();
const onClose = vi.fn();
const onSuccess = vi.fn();

// =============================================
// HELPERS
// =============================================

function renderModal(
  action = "create",
  selectedManufacturer
) {
  return render(
    <ManufacturerModal
      action={action}
      manufacturer={selectedManufacturer}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

async function enterName(user, name) {
  const input = screen.getByRole("textbox", {
    name: "Manufacturer name",
  });

  await user.clear(input);
  await user.type(input, name);
}

function submitButton(name) {
  return screen.getByRole("button", { name });
}

// =============================================
// MANUFACTURER MODAL TESTS
// =============================================

describe("ManufacturerModal", () => {
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
  });

  // ===========================================
  // 1. RENDER CREATE FORM
  // ===========================================

  test("should render the create manufacturer form", () => {
    // Arrange
    renderModal();

    // Assert
    expect(
      screen.getByRole("textbox", {
        name: "Manufacturer name",
      })
    ).toBeInTheDocument();

    expect(
      submitButton("Add Manufacturer")
    ).toBeEnabled();

    expect(
      submitButton("Cancel")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 2. CREATE MANUFACTURER
  // ===========================================

  test("should create manufacturer with trimmed name", async () => {
    // Arrange
    const user = userEvent.setup();
    renderModal();

    // Act
    await enterName(user, "  Sun Pharma  ");

    await user.click(
      submitButton("Add Manufacturer")
    );

    // Assert
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/manufacturers",
        {
          method: "POST",
          body: {
            name: "Sun Pharma",
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
  // 3. EMPTY NAME
  // ===========================================

  test("should reject empty manufacturer name", async () => {
    // Arrange
    const user = userEvent.setup();
    renderModal();

    // Act
    await user.click(
      submitButton("Add Manufacturer")
    );

    // Assert
    expect(
      screen.getByText(
        "Enter the manufacturer name."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("textbox", {
        name: "Manufacturer name",
      })
    ).toHaveFocus();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 4. WHITESPACE NAME
  // ===========================================

  test("should reject whitespace-only manufacturer name", async () => {
    // Arrange
    const user = userEvent.setup();
    renderModal();

    // Act
    await enterName(user, "   ");

    await user.click(
      submitButton("Add Manufacturer")
    );

    // Assert
    expect(
      screen.getByText(
        "Enter the manufacturer name."
      )
    ).toBeInTheDocument();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 5. NAME MAXIMUM LENGTH
  // ===========================================

  test("should configure maximum name length as 100", () => {
    // Arrange
    renderModal();

    // Assert
    expect(
      screen.getByRole("textbox", {
        name: "Manufacturer name",
      })
    ).toHaveAttribute("maxlength", "100");
  });

  // ===========================================
  // 6. NAME EXCEEDS 100 CHARACTERS
  // ===========================================

  test("should reject a name longer than 100 characters", async () => {
    // Arrange
    const user = userEvent.setup();
    renderModal();

    // Simulate an overlength value directly.
    // Normal typing is restricted by maxLength.
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Manufacturer name",
      }),
      {
        target: {
          value: "A".repeat(101),
        },
      }
    );

    // Act
    await user.click(
      submitButton("Add Manufacturer")
    );

    // Assert
    expect(
      screen.getByText(
        "Name must be 100 characters or fewer."
      )
    ).toBeInTheDocument();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 7. CLEAR VALIDATION ERROR
  // ===========================================

  test("should clear validation error when name changes", async () => {
    // Arrange
    const user = userEvent.setup();
    renderModal();

    await user.click(
      submitButton("Add Manufacturer")
    );

    expect(
      screen.getByText(
        "Enter the manufacturer name."
      )
    ).toBeInTheDocument();

    // Act
    await enterName(user, "Sun Pharma");

    // Assert
    expect(
      screen.queryByText(
        "Enter the manufacturer name."
      )
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 8. EDIT FORM INITIAL VALUES
  // ===========================================

  test("should prefill existing manufacturer name", () => {
    // Arrange
    renderModal("edit", manufacturer);

    // Assert
    expect(
      screen.getByRole("textbox", {
        name: "Manufacturer name",
      })
    ).toHaveValue("ABC Pharma");

    expect(
      submitButton("Save Changes")
    ).toBeDisabled();
  });

  // ===========================================
  // 9. EDIT MANUFACTURER
  // ===========================================

  test("should update manufacturer successfully", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal("edit", manufacturer);

    // Act
    await enterName(user, "  Updated Pharma  ");

    await user.click(
      submitButton("Save Changes")
    );

    // Assert
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/manufacturers/10",
        {
          method: "PUT",
          body: {
            name: "Updated Pharma",
          },
        }
      );

      expect(onSuccess).toHaveBeenCalledWith(
        "Saved successfully."
      );
    });
  });

  // ===========================================
  // 10. UNCHANGED NAME
  // ===========================================

  test("should disable saving when the name is unchanged", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal("edit", manufacturer);

    // Initially unchanged
    expect(
      submitButton("Save Changes")
    ).toBeDisabled();

    // Act: Change name
    await enterName(user, "Different Pharma");

    expect(
      submitButton("Save Changes")
    ).toBeEnabled();

    // Act: Restore original name
    await enterName(user, "ABC Pharma");

    // Assert
    expect(
      submitButton("Save Changes")
    ).toBeDisabled();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 11. INACTIVE MANUFACTURER
  // ===========================================

  test("should disable editing an inactive manufacturer", () => {
    // Arrange
    renderModal("edit", {
      ...manufacturer,
      is_active: false,
    });

    // Assert
    expect(
      submitButton("Save Changes")
    ).toBeDisabled();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 12. FORCED EDIT OF INACTIVE MANUFACTURER
  // ===========================================

  test("should reject forced editing of inactive manufacturer", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal("edit", {
      ...manufacturer,
      is_active: false,
    });

    await enterName(user, "Updated Pharma");

    // Act: Submit form directly despite disabled button
    fireEvent.submit(
      submitButton("Save Changes").closest("form")
    );

    // Assert
    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Restore this manufacturer before editing."
    );

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 13. DEACTIVATE MANUFACTURER
  // ===========================================

  test("should deactivate manufacturer", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal("deactivate", manufacturer);

    // Assert confirmation
    expect(
      screen.getByText(
        /Deactivate this manufacturer/
      )
    ).toBeInTheDocument();

    // Act
    await user.click(
      submitButton("Deactivate")
    );

    // Assert
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/manufacturers/10/deactivate",
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
  // 14. RESTORE MANUFACTURER
  // ===========================================

  test("should restore inactive manufacturer", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal("restore", {
      ...manufacturer,
      is_active: false,
    });

    // Act
    await user.click(
      submitButton("Restore")
    );

    // Assert
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/manufacturers/10/restore",
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
  // 15-16. NON-ADMIN USERS
  // ===========================================

  test.each(["Pharmacist", "Customer"])(
    "should disable manufacturer management for %s",
    (role) => {
      // Arrange
      useAuth.mockReturnValue({
        user: {
          user_id: 2,
          role,
        },
        authenticatedRequest: mockRequest,
      });

      // Act
      renderModal();

      // Assert
      expect(
        submitButton("Add Manufacturer")
      ).toBeDisabled();

      expect(mockRequest).not.toHaveBeenCalled();
    }
  );

  // ===========================================
  // 17. FORCED NON-ADMIN SUBMISSION
  // ===========================================

  test("should reject forced submission by non-admin", () => {
    // Arrange
    useAuth.mockReturnValue({
      user: {
        user_id: 3,
        role: "Customer",
      },
      authenticatedRequest: mockRequest,
    });

    renderModal();

    // Act
    fireEvent.submit(
      submitButton("Add Manufacturer").closest("form")
    );

    // Assert
    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Only administrators can manage manufacturers."
    );

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 18. API ERROR
  // ===========================================

  test("should display API error when creation fails", async () => {
    // Arrange
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      new Error("Server unavailable")
    );

    renderModal();

    // Act
    await enterName(user, "Sun Pharma");

    await user.click(
      submitButton("Add Manufacturer")
    );

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Server unavailable");

    expect(onSuccess).not.toHaveBeenCalled();
  });

  // ===========================================
  // 19. FALLBACK API ERROR
  // ===========================================

  test("should display fallback error message", async () => {
    // Arrange
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      new Error("")
    );

    renderModal();

    // Act
    await enterName(user, "Sun Pharma");

    await user.click(
      submitButton("Add Manufacturer")
    );

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to save changes. Please try again."
    );
  });

  // ===========================================
  // 20. CLEAR API ERROR
  // ===========================================

  test("should clear API error when user changes name", async () => {
    // Arrange
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      new Error("Network error")
    );

    renderModal();

    await enterName(user, "Sun Pharma");

    await user.click(
      submitButton("Add Manufacturer")
    );

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Network error");

    // Act
    await user.type(
      screen.getByRole("textbox", {
        name: "Manufacturer name",
      }),
      " X"
    );

    // Assert
    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 21. DUPLICATE INACTIVE MANUFACTURER
  // ===========================================

  test("should offer to restore an inactive duplicate", async () => {
    // Arrange
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      Object.assign(
        new Error("Manufacturer already exists"),
        {
          status: 409,
          data: {
            requiresConfirmation: true,
            manufacturerId: 42,
          },
        }
      )
    );

    renderModal();

    await enterName(user, "Sun Pharma");

    // Act: Attempt creation
    await user.click(
      submitButton("Add Manufacturer")
    );

    // Assert confirmation
    expect(
      await screen.findByRole("button", {
        name: "Restore Manufacturer",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        /A manufacturer with this name already exists/
      )
    ).toBeInTheDocument();

    expect(onSuccess).not.toHaveBeenCalled();

    // Act: Confirm restore
    await user.click(
      submitButton("Restore Manufacturer")
    );

    // Assert
    await waitFor(() => {
      expect(mockRequest).toHaveBeenLastCalledWith(
        "/manufacturers/42/restore",
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
  // 22. BACK FROM RESTORE CONFIRMATION
  // ===========================================

  test("should return to the form from restore confirmation", async () => {
    // Arrange
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      Object.assign(
        new Error("Duplicate manufacturer"),
        {
          status: 409,
          data: {
            requiresConfirmation: true,
            manufacturerId: 42,
          },
        }
      )
    );

    renderModal();

    await enterName(user, "Sun Pharma");

    await user.click(
      submitButton("Add Manufacturer")
    );

    await screen.findByRole("button", {
      name: "Restore Manufacturer",
    });

    // Act
    await user.click(
      submitButton("Use a different name")
    );

    // Assert
    expect(
      screen.getByRole("textbox", {
        name: "Manufacturer name",
      })
    ).toHaveValue("Sun Pharma");

    expect(
      submitButton("Add Manufacturer")
    ).toBeEnabled();

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 23. NORMAL DUPLICATE ERROR
  // ===========================================

  test("should display conflict when restore confirmation is not required", async () => {
    // Arrange
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      Object.assign(
        new Error("Manufacturer already exists"),
        {
          status: 409,
          data: {
            requiresConfirmation: false,
          },
        }
      )
    );

    renderModal();

    // Act
    await enterName(user, "Sun Pharma");

    await user.click(
      submitButton("Add Manufacturer")
    );

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Manufacturer already exists"
    );

    expect(
      screen.queryByRole("button", {
        name: "Restore Manufacturer",
      })
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 24. DEFAULT SUCCESS MESSAGE
  // ===========================================

  test("should use default message when API provides no message", async () => {
    // Arrange
    const user = userEvent.setup();

    mockRequest.mockResolvedValueOnce({});

    renderModal();

    // Act
    await enterName(user, "Sun Pharma");

    await user.click(
      submitButton("Add Manufacturer")
    );

    // Assert
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        "Changes saved successfully."
      );
    });
  });

  // ===========================================
  // 25. LOADING & DUPLICATE SUBMISSIONS
  // ===========================================

  test("should block duplicate submissions while saving", async () => {
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

    await enterName(user, "Sun Pharma");

    // Act
    await user.click(
      submitButton("Add Manufacturer")
    );

    // Assert loading state
    expect(
      submitButton("Saving...")
    ).toBeDisabled();

    expect(
      submitButton("Cancel")
    ).toBeDisabled();

    expect(
      screen.getByRole("textbox", {
        name: "Manufacturer name",
      })
    ).toBeDisabled();

    // Try submitting the form again
    fireEvent.submit(
      submitButton("Saving...").closest("form")
    );

    // Only one request should be sent
    expect(mockRequest).toHaveBeenCalledTimes(1);

    expect(onClose).not.toHaveBeenCalled();

    // Finish the request
    await act(async () => {
      resolveRequest({
        message: "Manufacturer created",
      });
    });

    expect(onSuccess).toHaveBeenCalledWith(
      "Manufacturer created"
    );
  });

  // ===========================================
  // 26. CANCEL BUTTON
  // ===========================================

  test("should close modal when Cancel is clicked", async () => {
    // Arrange
    const user = userEvent.setup();

    renderModal("deactivate", manufacturer);

    // Act
    await user.click(
      submitButton("Cancel")
    );

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);

    expect(mockRequest).not.toHaveBeenCalled();
  });
});
