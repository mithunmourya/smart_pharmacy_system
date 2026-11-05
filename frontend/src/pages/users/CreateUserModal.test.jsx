
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
  within,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import CreateUserModal from "./CreateUserModal";
import useAuth from "../../hooks/useAuth";

// =============================================
// MOCK AUTHENTICATION
// =============================================

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

// Keep user.service.js real.
// We want to verify its actual HTTP request.

// =============================================
// TEST DATA
// =============================================

const mockRequest = vi.fn();
const onClose = vi.fn();
const onCreated = vi.fn();

// =============================================
// TEST HELPERS
// =============================================

function renderModal() {
  return render(
    <CreateUserModal
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}

function field(label) {
  return screen.getByLabelText(label);
}

function changeField(label, value) {
  fireEvent.change(field(label), {
    target: { value },
  });
}

function createButton() {
  return screen.getByRole("button", {
    name: "Create User",
  });
}

function fillValidForm({
  name = "Ravi Kumar",
  email = "ravi@example.com",
  password = "Password123",
  confirmPassword = password,
  role = "Customer",
} = {}) {
  changeField("Full name", name);
  changeField("Email address", email);
  changeField("Initial password", password);
  changeField("Confirm password", confirmPassword);

  fireEvent.change(field("Account role"), {
    target: { value: role },
  });
}

function submitForm() {
  fireEvent.submit(createButton().closest("form"));
}

// =============================================
// CREATE USER MODAL TESTS
// =============================================

describe("CreateUserModal", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    useAuth.mockReturnValue({
      authenticatedRequest: mockRequest,
    });

    mockRequest.mockResolvedValue({
      message: "User created successfully.",
    });
  });

  // ===========================================
  // 1. RENDER FORM
  // ===========================================

  test("renders all required form fields", () => {
    renderModal();

    expect(
      screen.getByRole("heading", {
        name: "Create user",
      })
    ).toBeInTheDocument();

    expect(field("Full name")).toBeInTheDocument();
    expect(field("Email address")).toBeInTheDocument();
    expect(field("Account role")).toBeInTheDocument();
    expect(field("Initial password")).toBeInTheDocument();
    expect(field("Confirm password")).toBeInTheDocument();

    expect(createButton()).toBeEnabled();

    expect(
      screen.getByRole("button", {
        name: "Cancel",
      })
    ).toBeInTheDocument();
  });

  // ===========================================
  // 2. DEFAULT VALUES
  // ===========================================

  test("initializes an empty form with Customer role", () => {
    renderModal();

    expect(field("Full name")).toHaveValue("");
    expect(field("Email address")).toHaveValue("");
    expect(field("Initial password")).toHaveValue("");
    expect(field("Confirm password")).toHaveValue("");

    expect(field("Account role")).toHaveValue(
      "Customer"
    );

    expect(
      screen.getByRole("checkbox", {
        name: "Show passwords",
      })
    ).not.toBeChecked();
  });

  // ===========================================
  // 3. ALLOWED ACCOUNT ROLES
  // ===========================================

  test("offers Customer, Pharmacist and Admin roles", () => {
    renderModal();

    const roles = field("Account role");

    expect(
      within(roles).getAllByRole("option")
    ).toHaveLength(3);

    expect(
      within(roles).getByRole("option", {
        name: "Customer",
      })
    ).toBeInTheDocument();

    expect(
      within(roles).getByRole("option", {
        name: "Pharmacist",
      })
    ).toBeInTheDocument();

    expect(
      within(roles).getByRole("option", {
        name: "Admin",
      })
    ).toBeInTheDocument();
  });

  // ===========================================
  // 4. SHOW AND HIDE PASSWORDS
  // ===========================================

  test("toggles visibility of both password fields", async () => {
    const user = userEvent.setup();

    renderModal();

    expect(field("Initial password")).toHaveAttribute(
      "type",
      "password"
    );

    expect(field("Confirm password")).toHaveAttribute(
      "type",
      "password"
    );

    const checkbox = screen.getByRole("checkbox", {
      name: "Show passwords",
    });

    // Act: Show passwords
    await user.click(checkbox);

    expect(checkbox).toBeChecked();

    expect(field("Initial password")).toHaveAttribute(
      "type",
      "text"
    );

    expect(field("Confirm password")).toHaveAttribute(
      "type",
      "text"
    );

    // Act: Hide passwords
    await user.click(checkbox);

    expect(checkbox).not.toBeChecked();

    expect(field("Initial password")).toHaveAttribute(
      "type",
      "password"
    );

    expect(field("Confirm password")).toHaveAttribute(
      "type",
      "password"
    );
  });

  // ===========================================
  // 5. CANCEL BUTTON
  // ===========================================

  test("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();

    renderModal();

    await user.click(
      screen.getByRole("button", {
        name: "Cancel",
      })
    );

    expect(onClose).toHaveBeenCalledTimes(1);

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 6. CLOSE ICON
  // ===========================================

  test("calls onClose when close icon is clicked", async () => {
    const user = userEvent.setup();

    renderModal();

    await user.click(
      screen.getByRole("button", {
        name: "Close create user dialog",
      })
    );

    expect(onClose).toHaveBeenCalledTimes(1);

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 7. ESCAPE / DIALOG CANCEL EVENT
  // ===========================================

  test("handles the dialog cancel event", () => {
    renderModal();

    const dialog = screen.getByRole("dialog");

    fireEvent(dialog, new Event("cancel", {
  bubbles: true,
  cancelable: true,
}));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 8. BODY SCROLL LOCK
  // ===========================================

  test("locks body scrolling and restores it on unmount", () => {
    const originalOverflow =
      document.body.style.overflow;

    const { unmount } = renderModal();

    expect(document.body.style.overflow).toBe(
      "hidden"
    );

    unmount();

    expect(document.body.style.overflow).toBe(
      originalOverflow
    );
  });

  // ===========================================
  // 9. EMPTY FORM VALIDATION
  // ===========================================

  test("rejects submission when required fields are empty", async () => {
    const user = userEvent.setup();

    renderModal();

    await user.click(createButton());

    expect(
      screen.getByText(
        "Enter the user's full name."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Enter an email address."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Enter an initial password."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Confirm the password."
      )
    ).toBeInTheDocument();

    expect(field("Full name")).toHaveFocus();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 10. WHITESPACE NAME
  // ===========================================

  test("rejects a whitespace-only name", async () => {
    const user = userEvent.setup();

    renderModal();

    fillValidForm({
      name: "    ",
    });

    await user.click(createButton());

    expect(
      screen.getByText(
        "Enter the user's full name."
      )
    ).toBeInTheDocument();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 11. NAME MAXIMUM LENGTH
  // ===========================================

  test("limits name input to 100 characters", () => {
    renderModal();

    expect(field("Full name")).toHaveAttribute(
      "maxlength",
      "100"
    );
  });

  // ===========================================
  // 12. OVERLONG NAME
  // ===========================================

  test("rejects name longer than 100 characters", async () => {
    const user = userEvent.setup();

    renderModal();
    fillValidForm();

    // Bypass the browser's maxLength limit
    // to exercise component validation.
    changeField(
      "Full name",
      "A".repeat(101)
    );

    await user.click(createButton());

    expect(
      screen.getByText(
        "Name must be 100 characters or fewer."
      )
    ).toBeInTheDocument();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 13. EMPTY EMAIL
  // ===========================================

  test("rejects an empty email address", async () => {
    const user = userEvent.setup();

    renderModal();
    fillValidForm();

    changeField("Email address", "");

    await user.click(createButton());

    expect(
      screen.getByText(
        "Enter an email address."
      )
    ).toBeInTheDocument();

    expect(field("Email address")).toHaveFocus();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 14-16. INVALID EMAIL FORMATS
  // ===========================================

  test.each([
    "invalid-email",
    "ravi@",
    "ravi name@example.com",
  ])(
    "rejects invalid email format %s",
    async (email) => {
      const user = userEvent.setup();

      renderModal();

      fillValidForm({ email });

      await user.click(createButton());

      expect(
        screen.getByText(
          "Enter a valid email address."
        )
      ).toBeInTheDocument();

      expect(mockRequest).not.toHaveBeenCalled();
    }
  );

  // ===========================================
  // 17. EMAIL MAXIMUM LENGTH
  // ===========================================

  test("limits email input to 100 characters", () => {
    renderModal();

    expect(field("Email address")).toHaveAttribute(
      "maxlength",
      "100"
    );
  });

  // ===========================================
  // 18. OVERLONG EMAIL
  // ===========================================

  test("rejects email longer than 100 characters", async () => {
    const user = userEvent.setup();

    renderModal();
    fillValidForm();

    changeField(
      "Email address",
      `${"a".repeat(96)}@x.com`
    );

    await user.click(createButton());

    expect(
      screen.getByText(
        "Email must be 100 characters or fewer."
      )
    ).toBeInTheDocument();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 19. MISSING INITIAL PASSWORD
  // ===========================================

  test("rejects an empty initial password", async () => {
    const user = userEvent.setup();

    renderModal();
    fillValidForm();

    changeField("Initial password", "");

    await user.click(createButton());

    expect(
      screen.getByText(
        "Enter an initial password."
      )
    ).toBeInTheDocument();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 20. MISSING PASSWORD CONFIRMATION
  // ===========================================

  test("requires password confirmation", async () => {
    const user = userEvent.setup();

    renderModal();
    fillValidForm();

    changeField("Confirm password", "");

    await user.click(createButton());

    expect(
      screen.getByText(
        "Confirm the password."
      )
    ).toBeInTheDocument();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 21. PASSWORD MISMATCH
  // ===========================================

  test("rejects mismatched passwords", async () => {
    const user = userEvent.setup();

    renderModal();

    fillValidForm({
      password: "Password123",
      confirmPassword: "Different123",
    });

    await user.click(createButton());

    expect(
      screen.getByText(
        "Passwords do not match."
      )
    ).toBeInTheDocument();

    expect(
      field("Confirm password")
    ).toHaveFocus();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 22. CLEAR ERROR WHEN CONFIRMATION CHANGES
  // ===========================================

  test("clears confirmation error when corrected", async () => {
    const user = userEvent.setup();

    renderModal();

    fillValidForm({
      confirmPassword: "WrongPassword",
    });

    await user.click(createButton());

    expect(
      screen.getByText(
        "Passwords do not match."
      )
    ).toBeInTheDocument();

    // Act
    changeField(
      "Confirm password",
      "Password123"
    );

    // Assert
    expect(
      screen.queryByText(
        "Passwords do not match."
      )
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 23. PASSWORD CHANGE CLEARS CONFIRM ERROR
  // ===========================================

  test("clears confirmation error when password changes", async () => {
    const user = userEvent.setup();

    renderModal();

    fillValidForm({
      password: "OldPassword",
      confirmPassword: "NewPassword",
    });

    await user.click(createButton());

    expect(
      screen.getByText(
        "Passwords do not match."
      )
    ).toBeInTheDocument();

    // Act
    changeField(
      "Initial password",
      "NewPassword"
    );

    // Assert
    expect(
      screen.queryByText(
        "Passwords do not match."
      )
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 24. CREATE CUSTOMER USER
  // ===========================================

  test("creates a Customer user with correct API request", async () => {
    const user = userEvent.setup();

    renderModal();
    fillValidForm();

    await user.click(createButton());

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/users/register",
        {
          method: "POST",
          body: {
            name: "Ravi Kumar",
            email: "ravi@example.com",
            password: "Password123",
            role: "Customer",
          },
        }
      );

      expect(onCreated).toHaveBeenCalledWith(
        "User created successfully."
      );
    });

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  // ===========================================
  // 25-26. OTHER USER ROLES
  // ===========================================

  test.each([
    "Admin",
    "Pharmacist",
  ])(
    "creates a user with %s role",
    async (role) => {
      const user = userEvent.setup();

      renderModal();

      fillValidForm({ role });

      await user.click(createButton());

      await waitFor(() => {
        expect(mockRequest).toHaveBeenCalledWith(
          "/users/register",
          expect.objectContaining({
            method: "POST",
            body: expect.objectContaining({
              role,
            }),
          })
        );

        expect(onCreated).toHaveBeenCalledTimes(1);
      });
    }
  );

  // ===========================================
  // 27. TRIM NAME AND EMAIL
  // ===========================================

  test("trims name and email before sending request", async () => {
    const user = userEvent.setup();

    renderModal();

    fillValidForm({
      name: "  Ravi Kumar  ",
      email: "  ravi@example.com  ",
    });

    await user.click(createButton());

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/users/register",
        {
          method: "POST",
          body: {
            name: "Ravi Kumar",
            email: "ravi@example.com",
            password: "Password123",
            role: "Customer",
          },
        }
      );
    });
  });

  // ===========================================
  // 28. PASSWORD MUST NOT BE TRIMMED
  // ===========================================

  test("sends the password exactly as entered", async () => {
    const user = userEvent.setup();

    renderModal();

    fillValidForm({
      password: "  Password123  ",
      confirmPassword: "  Password123  ",
    });

    await user.click(createButton());

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/users/register",
        expect.objectContaining({
          body: expect.objectContaining({
            password: "  Password123  ",
          }),
        })
      );
    });
  });

  // ===========================================
  // 29. NAME BOUNDARY VALUE
  // ===========================================

  test("accepts a name containing exactly 100 characters", async () => {
    const user = userEvent.setup();

    const name = "A".repeat(100);

    renderModal();

    fillValidForm({ name });

    await user.click(createButton());

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/users/register",
        expect.objectContaining({
          body: expect.objectContaining({
            name,
          }),
        })
      );
    });
  });

  // ===========================================
  // 30. API ERROR
  // ===========================================

  test("displays API error when creation fails", async () => {
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      new Error("Email already registered.")
    );

    renderModal();
    fillValidForm();

    await user.click(createButton());

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Email already registered."
    );

    expect(onCreated).not.toHaveBeenCalled();
  });

  // ===========================================
  // 31. FALLBACK API ERROR
  // ===========================================

  test("displays fallback error if API has no message", async () => {
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      new Error("")
    );

    renderModal();
    fillValidForm();

    await user.click(createButton());

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to create the user. Please try again."
    );

    expect(onCreated).not.toHaveBeenCalled();
  });

  // ===========================================
  // 32. CLEAR API ERROR
  // ===========================================

  test("clears API error when a field changes", async () => {
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      new Error("Server error")
    );

    renderModal();
    fillValidForm();

    await user.click(createButton());

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Server error");

    // Act
    changeField(
      "Full name",
      "Updated Name"
    );

    // Assert
    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 33. RETRY AFTER FAILED CREATION
  // ===========================================

  test("allows retrying after an API failure", async () => {
    const user = userEvent.setup();

    mockRequest
      .mockRejectedValueOnce(
        new Error("Temporary failure")
      )
      .mockResolvedValueOnce({
        message: "User saved on retry.",
      });

    renderModal();
    fillValidForm();

    // First request
    await user.click(createButton());

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Temporary failure"
    );

    // Act: Retry
    await user.click(createButton());

    // Assert
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledTimes(2);

      expect(onCreated).toHaveBeenCalledWith(
        "User saved on retry."
      );
    });

    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 34. DEFAULT SUCCESS MESSAGE
  // ===========================================

  test("uses default success message when API omits it", async () => {
    const user = userEvent.setup();

    mockRequest.mockResolvedValueOnce({});

    renderModal();
    fillValidForm();

    await user.click(createButton());

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(
        "User created successfully."
      );
    });
  });

  // ===========================================
  // 35. LOADING STATE
  // ===========================================

  test("disables inputs and buttons while creating a user", async () => {
    const user = userEvent.setup();

    let resolveRequest;

    mockRequest.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );

    renderModal();
    fillValidForm();

    // Act
    await user.click(createButton());

    // Assert
    expect(
      screen.getByRole("button", {
        name: "Creating...",
      })
    ).toBeDisabled();

    expect(field("Full name")).toBeDisabled();
    expect(field("Email address")).toBeDisabled();
    expect(field("Account role")).toBeDisabled();
    expect(field("Initial password")).toBeDisabled();
    expect(field("Confirm password")).toBeDisabled();

    expect(
      screen.getByRole("checkbox", {
        name: "Show passwords",
      })
    ).toBeDisabled();

    expect(
      screen.getByRole("button", {
        name: "Cancel",
      })
    ).toBeDisabled();

    expect(
      screen.getByRole("button", {
        name: "Close create user dialog",
      })
    ).toBeDisabled();

    // Complete the request
    await act(async () => {
      resolveRequest({
        message: "Account created.",
      });
    });

    expect(onCreated).toHaveBeenCalledWith(
      "Account created."
    );
  });

  // ===========================================
  // 36. PREVENT DUPLICATE SUBMISSIONS
  // ===========================================

  test("prevents duplicate requests while submitting", async () => {
    const user = userEvent.setup();

    let resolveRequest;

    mockRequest.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );

    renderModal();
    fillValidForm();

    // First submission
    await user.click(createButton());

    // Attempt a second submission directly
    fireEvent.submit(
      screen
        .getByRole("button", {
          name: "Creating...",
        })
        .closest("form")
    );

    expect(mockRequest).toHaveBeenCalledTimes(1);

    expect(onCreated).not.toHaveBeenCalled();

    // Resolve first request
    await act(async () => {
      resolveRequest({
        message: "User created.",
      });
    });

    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 37. BLOCK CLOSING DURING SUBMISSION
  // ===========================================

  test("prevents dialog cancellation while request is pending", async () => {
    const user = userEvent.setup();

    let resolveRequest;

    mockRequest.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );

    renderModal();
    fillValidForm();

    await user.click(createButton());

    // Act: Simulate Escape dialog cancel event
   fireEvent(
  screen.getByRole("dialog"),
  new Event("cancel", {
    bubbles: true,
    cancelable: true,
  })
);

    // Assert
    expect(onClose).not.toHaveBeenCalled();

    // Complete request
    await act(async () => {
      resolveRequest({
        message: "User created.",
      });
    });

    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 38. RESTORE FORM AFTER FAILED REQUEST
  // ===========================================

  test("re-enables form after request failure", async () => {
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      new Error("Network unavailable")
    );

    renderModal();
    fillValidForm();

    await user.click(createButton());

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Network unavailable"
    );

    // Assert
    await waitFor(() => {
      expect(createButton()).toBeEnabled();
    });

    expect(field("Full name")).toBeEnabled();

    expect(field("Email address")).toBeEnabled();

    expect(
      screen.getByRole("button", {
        name: "Cancel",
      })
    ).toBeEnabled();

    expect(onCreated).not.toHaveBeenCalled();
  });
});
