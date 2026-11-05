
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

import UserActionModal from "./UserActionModal";
import useAuth from "../../hooks/useAuth";

// =============================================
// MOCK DEPENDENCIES
// =============================================

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

// We mock only the Modal UI wrapper.
// UserActionModal's logic remains real.
vi.mock("../../components/Modal", () => ({
  default: ({
    title,
    children,
    onClose,
    busy,
  }) => (
    <section
      role="dialog"
      aria-label={title}
      aria-busy={busy}
    >
      <h2>{title}</h2>

      <button
        type="button"
        onClick={onClose}
      >
        Close modal
      </button>

      {children}
    </section>
  ),
}));

// Do not mock user.service.js.
// This allows us to verify actual API paths.

// =============================================
// TEST DATA
// =============================================

const adminUser = {
  user_id: 1,
  name: "Admin User",
  email: "admin@example.com",
  role: "Admin",
  is_active: true,
};

const activeUser = {
  user_id: 2,
  name: "Ravi Kumar",
  email: "ravi@example.com",
  role: "Pharmacist",
  is_active: true,
};

const inactiveUser = {
  user_id: 3,
  name: "Neha Jain",
  email: "neha@example.com",
  role: "Customer",
  is_active: false,
};

const mockRequest = vi.fn();
const updateCurrentUser = vi.fn();
const onClose = vi.fn();
const onSuccess = vi.fn();

// =============================================
// HELPER FUNCTIONS
// =============================================

function renderModal({
  action = "edit",
  target = activeUser,
  signedInUser = adminUser,
} = {}) {
  useAuth.mockReturnValue({
    user: signedInUser,
    authenticatedRequest: mockRequest,
    updateCurrentUser,
  });

  return render(
    <UserActionModal
      user={target}
      action={action}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

function field(label) {
  return screen.getByRole("textbox", {
    name: label,
  });
}

function changeField(label, value) {
  fireEvent.change(field(label), {
    target: { value },
  });
}

function submitButton(label = "Save Changes") {
  return screen.getByRole("button", {
    name: label,
  });
}

function submitForm() {
  fireEvent.submit(
    screen.getByRole("dialog").querySelector("form")
  );
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

// =============================================
// USER ACTION MODAL TESTS
// =============================================

describe("UserActionModal", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockRequest.mockResolvedValue({
      message: "Changes saved successfully.",
    });
  });

  // ===========================================
  // 1. EDIT FORM RENDER
  // ===========================================

  test("renders edit form with user details", () => {
    renderModal();

    expect(
      screen.getByRole("dialog", {
        name: "Edit user",
      })
    ).toBeInTheDocument();

    expect(field("Full name")).toHaveValue(
      "Ravi Kumar"
    );

    expect(field("Email address")).toHaveValue(
      "ravi@example.com"
    );

    expect(
      submitButton()
    ).toBeInTheDocument();
  });

  // ===========================================
  // 2. ROLE IS READ-ONLY
  // ===========================================

  test("shows existing role without allowing role changes", () => {
    renderModal();

    expect(
      screen.getByText("Account role")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Pharmacist")
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Role changes are not available."
      )
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("combobox")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 3. UNCHANGED FORM
  // ===========================================

  test("disables Save Changes when nothing changed", () => {
    renderModal();

    expect(
      submitButton()
    ).toBeDisabled();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 4. NAME CHANGE ENABLES SAVE
  // ===========================================

  test("enables Save Changes after editing name", () => {
    renderModal();

    changeField(
      "Full name",
      "Ravi Updated"
    );

    expect(
      submitButton()
    ).toBeEnabled();
  });

  // ===========================================
  // 5. EMAIL CHANGE ENABLES SAVE
  // ===========================================

  test("enables Save Changes after editing email", () => {
    renderModal();

    changeField(
      "Email address",
      "new@example.com"
    );

    expect(
      submitButton()
    ).toBeEnabled();
  });

  // ===========================================
  // 6. WHITESPACE-ONLY CHANGE
  // ===========================================

  test("does not treat surrounding whitespace as a change", () => {
    renderModal();

    changeField(
      "Full name",
      "  Ravi Kumar  "
    );

    expect(
      submitButton()
    ).toBeDisabled();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 7. CANCEL
  // ===========================================

  test("closes edit modal when Cancel is clicked", async () => {
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
  // 8. MODAL CLOSE BUTTON
  // ===========================================

  test("handles closing through Modal wrapper", async () => {
    const user = userEvent.setup();

    renderModal();

    await user.click(
      screen.getByRole("button", {
        name: "Close modal",
      })
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 9. EMPTY NAME
  // ===========================================

  test("rejects an empty name", async () => {
    const user = userEvent.setup();

    renderModal();

    changeField("Full name", "");

    await user.click(submitButton());

    expect(
      screen.getByText(
        "Enter the user's full name."
      )
    ).toBeInTheDocument();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 10. WHITESPACE NAME
  // ===========================================

  test("rejects a whitespace-only name", async () => {
    const user = userEvent.setup();

    renderModal();

    changeField(
      "Full name",
      "    "
    );

    await user.click(submitButton());

    expect(
      screen.getByText(
        "Enter the user's full name."
      )
    ).toBeInTheDocument();

    expect(field("Full name")).toHaveFocus();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 11. NAME TOO LONG
  // ===========================================

  test("rejects name longer than 100 characters", async () => {
    const user = userEvent.setup();

    renderModal();

    changeField(
      "Full name",
      "A".repeat(101)
    );

    await user.click(submitButton());

    expect(
      screen.getByText(
        "Name must be 100 characters or fewer."
      )
    ).toBeInTheDocument();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 12. EMPTY EMAIL
  // ===========================================

  test("rejects an empty email address", async () => {
    const user = userEvent.setup();

    renderModal();

    changeField(
      "Email address",
      ""
    );

    await user.click(submitButton());

    expect(
      screen.getByText(
        "Enter an email address."
      )
    ).toBeInTheDocument();

    expect(field("Email address")).toHaveFocus();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 13-15. INVALID EMAIL FORMATS
  // ===========================================

  test.each([
    "invalid-email",
    "ravi@",
    "ravi name@example.com",
  ])(
    "rejects invalid email %s",
    async (email) => {
      const user = userEvent.setup();

      renderModal();

      changeField(
        "Email address",
        email
      );

      await user.click(submitButton());

      expect(
        screen.getByText(
          "Enter a valid email address."
        )
      ).toBeInTheDocument();

      expect(mockRequest).not.toHaveBeenCalled();
    }
  );

  // ===========================================
  // 16. EMAIL TOO LONG
  // ===========================================

  test("rejects email longer than 100 characters", async () => {
    const user = userEvent.setup();

    renderModal();

    changeField(
      "Email address",
      `${"a".repeat(96)}@x.com`
    );

    await user.click(submitButton());

    expect(
      screen.getByText(
        "Email must be 100 characters or fewer."
      )
    ).toBeInTheDocument();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 17. MAX LENGTH ATTRIBUTES
  // ===========================================

  test("limits name and email fields to 100 characters", () => {
    renderModal();

    expect(
      field("Full name")
    ).toHaveAttribute("maxlength", "100");

    expect(
      field("Email address")
    ).toHaveAttribute("maxlength", "100");
  });

  // ===========================================
  // 18. ERROR CLEARING
  // ===========================================

  test("clears field validation error after correction", async () => {
    const user = userEvent.setup();

    renderModal();

    changeField("Full name", "");

    await user.click(submitButton());

    expect(
      screen.getByText(
        "Enter the user's full name."
      )
    ).toBeInTheDocument();

    changeField(
      "Full name",
      "Ravi Updated"
    );

    expect(
      screen.queryByText(
        "Enter the user's full name."
      )
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 19. INVALID FOCUS PRIORITY
  // ===========================================

  test("focuses first invalid field", async () => {
    const user = userEvent.setup();

    renderModal();

    changeField("Full name", "");
    changeField("Email address", "");

    await user.click(submitButton());

    expect(field("Full name")).toHaveFocus();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 20. UPDATE NAME
  // ===========================================

  test("updates user name with correct PUT request", async () => {
    const user = userEvent.setup();

    renderModal();

    changeField(
      "Full name",
      "Ravi Updated"
    );

    await user.click(submitButton());

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/users/2",
        {
          method: "PUT",
          body: {
            name: "Ravi Updated",
            email: "ravi@example.com",
          },
        }
      );

      expect(onSuccess).toHaveBeenCalledWith(
        "Changes saved successfully."
      );
    });

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(updateCurrentUser).not.toHaveBeenCalled();
  });

  // ===========================================
  // 21. UPDATE EMAIL
  // ===========================================

  test("updates email while preserving the name", async () => {
    const user = userEvent.setup();

    renderModal();

    changeField(
      "Email address",
      "updated@example.com"
    );

    await user.click(submitButton());

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/users/2",
        {
          method: "PUT",
          body: {
            name: "Ravi Kumar",
            email: "updated@example.com",
          },
        }
      );
    });
  });

  // ===========================================
  // 22. TRIM API VALUES
  // ===========================================

  test("trims name and email before sending", async () => {
    const user = userEvent.setup();

    renderModal();

    changeField(
      "Full name",
      "  Updated Ravi  "
    );

    changeField(
      "Email address",
      "  updated@example.com  "
    );

    await user.click(submitButton());

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/users/2",
        {
          method: "PUT",
          body: {
            name: "Updated Ravi",
            email: "updated@example.com",
          },
        }
      );
    });
  });

  // ===========================================
  // 23. NO UNNECESSARY UPDATE
  // ===========================================

  test("does not send request if values are unchanged", () => {
    renderModal();

    // Force a form submission to test the guard,
    // even though Save Changes is disabled.
    submitForm();

    expect(mockRequest).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  // ===========================================
  // 24. EDIT OWN ACCOUNT
  // ===========================================

  test("updates authentication context when editing own account", async () => {
    const user = userEvent.setup();

    renderModal({
      target: adminUser,
      signedInUser: adminUser,
    });

    changeField(
      "Full name",
      "  Admin Updated  "
    );

    changeField(
      "Email address",
      "  admin.new@example.com  "
    );

    await user.click(submitButton());

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/users/1",
        {
          method: "PUT",
          body: {
            name: "Admin Updated",
            email: "admin.new@example.com",
          },
        }
      );

      expect(updateCurrentUser).toHaveBeenCalledWith(
        1,
        {
          name: "Admin Updated",
          email: "admin.new@example.com",
        }
      );

      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================
  // 25. SELF ID COMPARISON
  // ===========================================

  test("recognizes own account when IDs use different types", async () => {
    const user = userEvent.setup();

    renderModal({
      target: {
        ...adminUser,
        user_id: "1",
      },
      signedInUser: adminUser,
    });

    changeField(
      "Full name",
      "Updated Admin"
    );

    await user.click(submitButton());

    await waitFor(() => {
      expect(updateCurrentUser).toHaveBeenCalledWith(
        "1",
        {
          name: "Updated Admin",
          email: "admin@example.com",
        }
      );
    });
  });

  // ===========================================
  // 26. OTHER USER MUST NOT UPDATE AUTH
  // ===========================================

  test("does not change current auth user when editing someone else", async () => {
    const user = userEvent.setup();

    renderModal();

    changeField(
      "Full name",
      "Another Name"
    );

    await user.click(submitButton());

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    expect(updateCurrentUser).not.toHaveBeenCalled();
  });

  // ===========================================
  // 27. EDIT API ERROR
  // ===========================================

  test("displays API error when editing fails", async () => {
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      new Error("Email already exists.")
    );

    renderModal();

    changeField(
      "Email address",
      "taken@example.com"
    );

    await user.click(submitButton());

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Email already exists."
    );

    expect(onSuccess).not.toHaveBeenCalled();
  });

  // ===========================================
  // 28. FALLBACK ERROR
  // ===========================================

  test("displays fallback error when API message is empty", async () => {
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      new Error("")
    );

    renderModal();

    changeField(
      "Full name",
      "Ravi Updated"
    );

    await user.click(submitButton());

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to save changes. Please try again."
    );

    expect(onSuccess).not.toHaveBeenCalled();
  });

  // ===========================================
  // 29. CLEAR API ERROR
  // ===========================================

  test("clears API error when user edits a field", async () => {
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      new Error("Server error")
    );

    renderModal();

    changeField(
      "Full name",
      "Ravi Updated"
    );

    await user.click(submitButton());

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Server error");

    changeField(
      "Full name",
      "Ravi Again"
    );

    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 30. RETRY AFTER EDIT FAILURE
  // ===========================================

  test("allows retrying an edit after API failure", async () => {
    const user = userEvent.setup();

    mockRequest
      .mockRejectedValueOnce(
        new Error("Temporary failure")
      )
      .mockResolvedValueOnce({
        message: "User updated on retry.",
      });

    renderModal();

    changeField(
      "Full name",
      "Ravi Updated"
    );

    // First attempt
    await user.click(submitButton());

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Temporary failure"
    );

    // Second attempt
    await user.click(submitButton());

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledTimes(2);

      expect(onSuccess).toHaveBeenCalledWith(
        "User updated on retry."
      );
    });
  });

  // ===========================================
  // 31. DEFAULT SUCCESS MESSAGE
  // ===========================================

  test("uses default success message if API omits it", async () => {
    const user = userEvent.setup();

    mockRequest.mockResolvedValueOnce({});

    renderModal();

    changeField(
      "Full name",
      "Ravi Updated"
    );

    await user.click(submitButton());

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        "Changes saved successfully."
      );
    });
  });

  // ===========================================
  // 32. EDIT LOADING STATE
  // ===========================================

  test("disables edit form while request is pending", async () => {
    const user = userEvent.setup();

    const request = deferred();

    mockRequest.mockReturnValueOnce(
      request.promise
    );

    renderModal();

    changeField(
      "Full name",
      "Ravi Updated"
    );

    await user.click(submitButton());

    expect(
      screen.getByRole("button", {
        name: "Saving...",
      })
    ).toBeDisabled();

    expect(field("Full name")).toBeDisabled();
    expect(field("Email address")).toBeDisabled();

    expect(
      screen.getByRole("button", {
        name: "Cancel",
      })
    ).toBeDisabled();

    expect(
      screen.getByRole("dialog")
    ).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      request.resolve({
        message: "Updated.",
      });
    });

    expect(onSuccess).toHaveBeenCalledWith(
      "Updated."
    );
  });

  // ===========================================
  // 33. DUPLICATE SUBMISSION
  // ===========================================

  test("prevents duplicate edit requests", async () => {
    const user = userEvent.setup();

    const request = deferred();

    mockRequest.mockReturnValueOnce(
      request.promise
    );

    renderModal();

    changeField(
      "Full name",
      "Ravi Updated"
    );

    await user.click(submitButton());

    // Attempt submission again while busy.
    submitForm();

    expect(mockRequest).toHaveBeenCalledTimes(1);

    await act(async () => {
      request.resolve({
        message: "Updated.",
      });
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 34. BLOCK CLOSING DURING SUBMISSION
  // ===========================================

  test("prevents modal closing while request is pending", async () => {
    const user = userEvent.setup();

    const request = deferred();

    mockRequest.mockReturnValueOnce(
      request.promise
    );

    renderModal();

    changeField(
      "Full name",
      "Ravi Updated"
    );

    await user.click(submitButton());

    // Simulate a close request through Modal.
    await user.click(
      screen.getByRole("button", {
        name: "Close modal",
      })
    );

    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      request.resolve({
        message: "Updated.",
      });
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 35. INACTIVE ACCOUNT EDIT BUTTON
  // ===========================================

  test("disables editing for inactive accounts", () => {
    renderModal({
      target: inactiveUser,
    });

    expect(
      submitButton()
    ).toBeDisabled();

    expect(
      screen.getByText(
        "Role changes are not available."
      )
    ).toBeInTheDocument();
  });

  // ===========================================
  // 36. INACTIVE ACCOUNT EDIT GUARD
  // ===========================================

  test("rejects forced edit submissions for inactive accounts", () => {
    renderModal({
      target: inactiveUser,
    });

    changeField(
      "Full name",
      "Neha Updated"
    );

    // Force submit to test the internal guard.
    submitForm();

    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Restore this account before editing."
    );

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 37. DEACTIVATE CONFIRMATION
  // ===========================================

  test("shows deactivation warning and target user", () => {
    renderModal({
      action: "deactivate",
    });

    expect(
      screen.getByRole("dialog", {
        name: "Deactivate account",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(/Deactivate this account\?/)
    ).toBeInTheDocument();

    expect(
      screen.getByText("Ravi Kumar")
    ).toBeInTheDocument();

    expect(
      screen.getByText("ravi@example.com")
    ).toBeInTheDocument();

    expect(
      screen.getByText(/access tokens expire/)
    ).toBeInTheDocument();

    expect(
      submitButton("Deactivate")
    ).toBeEnabled();

    expect(
      screen.queryByRole("textbox")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 38. DEACTIVATE USER
  // ===========================================

  test("deactivates another user with PATCH request", async () => {
    const user = userEvent.setup();

    mockRequest.mockResolvedValueOnce({
      message: "Account deactivated.",
    });

    renderModal({
      action: "deactivate",
    });

    await user.click(
      submitButton("Deactivate")
    );

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/users/2/deactivate",
        {
          method: "PATCH",
        }
      );

      expect(onSuccess).toHaveBeenCalledWith(
        "Account deactivated."
      );
    });

    expect(updateCurrentUser).not.toHaveBeenCalled();
  });

  // ===========================================
  // 39. PREVENT SELF-DEACTIVATION
  // ===========================================

  test("disables deactivation of own account", () => {
    renderModal({
      action: "deactivate",
      target: adminUser,
      signedInUser: adminUser,
    });

    expect(
      submitButton("Deactivate")
    ).toBeDisabled();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 40. SELF-DEACTIVATION GUARD
  // ===========================================

  test("rejects forced self-deactivation submissions", () => {
    renderModal({
      action: "deactivate",
      target: adminUser,
      signedInUser: adminUser,
    });

    submitForm();

    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "You cannot deactivate your own account."
    );

    expect(mockRequest).not.toHaveBeenCalled();

    expect(onSuccess).not.toHaveBeenCalled();
  });

  // ===========================================
  // 41. SELF-DEACTIVATION WITH STRING ID
  // ===========================================

  test("blocks self-deactivation when user ID is a string", () => {
    renderModal({
      action: "deactivate",
      target: {
        ...adminUser,
        user_id: "1",
      },
      signedInUser: adminUser,
    });

    expect(
      submitButton("Deactivate")
    ).toBeDisabled();

    submitForm();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 42. DEACTIVATION API ERROR
  // ===========================================

  test("handles failed deactivation request", async () => {
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      new Error("Unable to deactivate account.")
    );

    renderModal({
      action: "deactivate",
    });

    await user.click(
      submitButton("Deactivate")
    );

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to deactivate account."
    );

    expect(onSuccess).not.toHaveBeenCalled();
  });

  // ===========================================
  // 43. RESTORE CONFIRMATION
  // ===========================================

  test("shows restore confirmation for inactive user", () => {
    renderModal({
      action: "restore",
      target: inactiveUser,
    });

    expect(
      screen.getByRole("dialog", {
        name: "Restore account",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(/Restore this account\?/)
    ).toBeInTheDocument();

    expect(
      screen.getByText("Neha Jain")
    ).toBeInTheDocument();

    expect(
      screen.getByText("neha@example.com")
    ).toBeInTheDocument();

    expect(
      submitButton("Restore")
    ).toBeEnabled();

    expect(
      screen.queryByRole("textbox")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 44. RESTORE USER
  // ===========================================

  test("restores inactive user with PATCH request", async () => {
    const user = userEvent.setup();

    mockRequest.mockResolvedValueOnce({
      message: "Account restored.",
    });

    renderModal({
      action: "restore",
      target: inactiveUser,
    });

    await user.click(
      submitButton("Restore")
    );

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/users/3/restore",
        {
          method: "PATCH",
        }
      );

      expect(onSuccess).toHaveBeenCalledWith(
        "Account restored."
      );
    });

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 45. RESTORE API ERROR
  // ===========================================

  test("displays error when restoring account fails", async () => {
    const user = userEvent.setup();

    mockRequest.mockRejectedValueOnce(
      new Error("Restore failed.")
    );

    renderModal({
      action: "restore",
      target: inactiveUser,
    });

    await user.click(
      submitButton("Restore")
    );

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Restore failed."
    );

    expect(onSuccess).not.toHaveBeenCalled();
  });

  // ===========================================
  // 46. RESTORE RETRY
  // ===========================================

  test("allows retrying restoration after failure", async () => {
    const user = userEvent.setup();

    mockRequest
      .mockRejectedValueOnce(
        new Error("Temporary restore failure")
      )
      .mockResolvedValueOnce({
        message: "Restored on retry.",
      });

    renderModal({
      action: "restore",
      target: inactiveUser,
    });

    await user.click(
      submitButton("Restore")
    );

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Temporary restore failure"
    );

    await user.click(
      submitButton("Restore")
    );

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledTimes(2);

      expect(onSuccess).toHaveBeenCalledWith(
        "Restored on retry."
      );
    });
  });

  // ===========================================
  // 47. RESTORE LOADING STATE
  // ===========================================

  test("disables restore controls while request is pending", async () => {
    const user = userEvent.setup();

    const request = deferred();

    mockRequest.mockReturnValueOnce(
      request.promise
    );

    renderModal({
      action: "restore",
      target: inactiveUser,
    });

    await user.click(
      submitButton("Restore")
    );

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

    expect(
      screen.getByRole("dialog")
    ).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      request.resolve({
        message: "Restored successfully.",
      });
    });

    expect(onSuccess).toHaveBeenCalledWith(
      "Restored successfully."
    );
  });
});
