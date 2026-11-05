
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
import { MemoryRouter } from "react-router";

import ChangePassword from "./ChangePassword";
import useAuth from "../../hooks/useAuth";

// =============================================
// MOCK DEPENDENCIES
// =============================================

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

// =============================================
// TEST DATA
// =============================================

const mockRequest = vi.fn();

const validPasswords = {
  currentPassword: "OldPassword123!",
  newPassword: "NewPassword456!",
  confirmPassword: "NewPassword456!",
};

// =============================================
// HELPER FUNCTIONS
// =============================================

function renderPage() {
  return render(
    <MemoryRouter>
      <ChangePassword />
    </MemoryRouter>
  );
}

function currentPasswordInput() {
  return screen.getByLabelText(
    "Current password"
  );
}

function newPasswordInput() {
  return screen.getByLabelText(
    "New password",
    { exact: true }
  );
}

function confirmPasswordInput() {
  return screen.getByLabelText(
    "Confirm new password"
  );
}

function showPasswordsCheckbox() {
  return screen.getByRole("checkbox", {
    name: "Show passwords",
  });
}

function submitButton() {
  return screen.getByRole("button", {
    name: /Update Password|Updating\.\.\./,
  });
}

function passwordForm() {
  return submitButton().closest("form");
}

function changeField(field, value) {
  fireEvent.change(field, {
    target: { value },
  });
}

function fillValidForm() {
  changeField(
    currentPasswordInput(),
    validPasswords.currentPassword
  );

  changeField(
    newPasswordInput(),
    validPasswords.newPassword
  );

  changeField(
    confirmPasswordInput(),
    validPasswords.confirmPassword
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
// CHANGE PASSWORD TESTS
// =============================================

describe("ChangePassword", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    useAuth.mockReturnValue({
      authenticatedRequest: mockRequest,
    });

    mockRequest.mockResolvedValue({
      message: "Password updated successfully.",
    });
  });

  // ===========================================
  // 1. PAGE RENDERING
  // ===========================================

  test("renders Change Password heading", () => {
    renderPage();

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Change Password",
      })
    ).toBeInTheDocument();
  });

  // ===========================================
  // 2. PAGE DESCRIPTION
  // ===========================================

  test("displays password instructions", () => {
    renderPage();

    expect(
      screen.getByText(
        "Enter your current password and choose a new password."
      )
    ).toBeInTheDocument();
  });

  // ===========================================
  // 3. BACK TO PROFILE
  // ===========================================

  test("links back to My Profile", () => {
    renderPage();

    expect(
      screen.getByRole("link", {
        name: "Back to My Profile",
      })
    ).toHaveAttribute("href", "/profile");
  });

  // ===========================================
  // 4. PASSWORD FIELDS
  // ===========================================

  test("renders all three password inputs", () => {
    renderPage();

    expect(
      currentPasswordInput()
    ).toBeInTheDocument();

    expect(
      newPasswordInput()
    ).toBeInTheDocument();

    expect(
      confirmPasswordInput()
    ).toBeInTheDocument();
  });

  // ===========================================
  // 5. INITIAL FIELD VALUES
  // ===========================================

  test("initializes password fields as empty", () => {
    renderPage();

    expect(currentPasswordInput()).toHaveValue("");
    expect(newPasswordInput()).toHaveValue("");
    expect(confirmPasswordInput()).toHaveValue("");
  });

  // ===========================================
  // 6. PASSWORD INPUT TYPES
  // ===========================================

  test("hides passwords by default", () => {
    renderPage();

    expect(
      currentPasswordInput()
    ).toHaveAttribute("type", "password");

    expect(
      newPasswordInput()
    ).toHaveAttribute("type", "password");

    expect(
      confirmPasswordInput()
    ).toHaveAttribute("type", "password");

    expect(
      showPasswordsCheckbox()
    ).not.toBeChecked();
  });

  // ===========================================
  // 7. REQUIRED FIELD ATTRIBUTES
  // ===========================================

  test("marks all password fields as required", () => {
    renderPage();

    expect(currentPasswordInput()).toBeRequired();
    expect(newPasswordInput()).toBeRequired();
    expect(confirmPasswordInput()).toBeRequired();
  });

  // ===========================================
  // 8. AUTOCOMPLETE ATTRIBUTES
  // ===========================================

  test("sets correct password autocomplete attributes", () => {
    renderPage();

    expect(
      currentPasswordInput()
    ).toHaveAttribute(
      "autocomplete",
      "current-password"
    );

    expect(
      newPasswordInput()
    ).toHaveAttribute(
      "autocomplete",
      "new-password"
    );

    expect(
      confirmPasswordInput()
    ).toHaveAttribute(
      "autocomplete",
      "new-password"
    );
  });

  // ===========================================
  // 9. UPDATE PASSWORD BUTTON
  // ===========================================

  test("renders enabled submit button initially", () => {
    renderPage();

    expect(
      submitButton()
    ).toHaveTextContent("Update Password");

    expect(
      submitButton()
    ).toHaveAttribute("type", "submit");

    expect(submitButton()).toBeEnabled();

    expect(
      passwordForm()
    ).toHaveAttribute("aria-busy", "false");
  });

  // ===========================================
  // 10. SHOW PASSWORDS
  // ===========================================

  test("shows all passwords when checkbox is checked", async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(showPasswordsCheckbox());

    expect(
      showPasswordsCheckbox()
    ).toBeChecked();

    expect(
      currentPasswordInput()
    ).toHaveAttribute("type", "text");

    expect(
      newPasswordInput()
    ).toHaveAttribute("type", "text");

    expect(
      confirmPasswordInput()
    ).toHaveAttribute("type", "text");
  });

  // ===========================================
  // 11. HIDE PASSWORDS AGAIN
  // ===========================================

  test("hides all passwords when checkbox is unchecked", async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(showPasswordsCheckbox());

    expect(
      currentPasswordInput()
    ).toHaveAttribute("type", "text");

    await user.click(showPasswordsCheckbox());

    expect(
      showPasswordsCheckbox()
    ).not.toBeChecked();

    expect(
      currentPasswordInput()
    ).toHaveAttribute("type", "password");

    expect(
      newPasswordInput()
    ).toHaveAttribute("type", "password");

    expect(
      confirmPasswordInput()
    ).toHaveAttribute("type", "password");
  });

  // ===========================================
  // 12. PASSWORD VISIBILITY PRESERVES VALUES
  // ===========================================

  test("preserves entered values when toggling visibility", async () => {
    const user = userEvent.setup();

    renderPage();
    fillValidForm();

    await user.click(showPasswordsCheckbox());

    expect(currentPasswordInput()).toHaveValue(
      validPasswords.currentPassword
    );

    expect(newPasswordInput()).toHaveValue(
      validPasswords.newPassword
    );

    expect(confirmPasswordInput()).toHaveValue(
      validPasswords.confirmPassword
    );

    await user.click(showPasswordsCheckbox());

    expect(newPasswordInput()).toHaveValue(
      validPasswords.newPassword
    );
  });

  // ===========================================
  // 13. EMPTY FORM
  // ===========================================

  test("rejects submission when all fields are empty", () => {
    renderPage();

    // fireEvent.submit bypasses native HTML
    // required-field blocking so we can test
    // the component's validation function.
    fireEvent.submit(passwordForm());

    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Complete all password fields."
    );

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 14-16. INDIVIDUAL REQUIRED FIELDS
  // ===========================================

  test.each([
    ["current password", "current"],
    ["new password", "new"],
    ["confirmation password", "confirm"],
  ])(
    "rejects missing %s",
    (_description, missingField) => {
      renderPage();
      fillValidForm();

      if (missingField === "current") {
        changeField(currentPasswordInput(), "");
      }

      if (missingField === "new") {
        changeField(newPasswordInput(), "");
      }

      if (missingField === "confirm") {
        changeField(confirmPasswordInput(), "");
      }

      fireEvent.submit(passwordForm());

      expect(
        screen.getByRole("alert")
      ).toHaveTextContent(
        "Complete all password fields."
      );

      expect(mockRequest).not.toHaveBeenCalled();
    }
  );

  // ===========================================
  // 17. PASSWORD MISMATCH
  // ===========================================

  test("rejects when new password and confirmation differ", async () => {
    const user = userEvent.setup();

    renderPage();
    fillValidForm();

    changeField(
      confirmPasswordInput(),
      "DifferentPassword789!"
    );

    await user.click(submitButton());

    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "New password and confirmation do not match."
    );

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 18. SAME CURRENT AND NEW PASSWORD
  // ===========================================

  test("rejects using current password as new password", async () => {
    const user = userEvent.setup();

    renderPage();

    changeField(
      currentPasswordInput(),
      "SamePassword123!"
    );

    changeField(
      newPasswordInput(),
      "SamePassword123!"
    );

    changeField(
      confirmPasswordInput(),
      "SamePassword123!"
    );

    await user.click(submitButton());

    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "New password must differ from your current password."
    );

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ===========================================
  // 19. VALID PASSWORD CHANGE
  // ===========================================

  test("sends correct authenticated PATCH request", async () => {
    const user = userEvent.setup();

    renderPage();
    fillValidForm();

    await user.click(submitButton());

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        "/users/change-password",
        {
          method: "PATCH",
          body: {
            currentPassword: "OldPassword123!",
            newPassword: "NewPassword456!",
          },
        }
      );
    });

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 20. CONFIRMATION NOT SENT TO API
  // ===========================================

  test("does not include confirmation password in API body", async () => {
    const user = userEvent.setup();

    renderPage();
    fillValidForm();

    await user.click(submitButton());

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    const [, options] = mockRequest.mock.calls[0];

    expect(options.body).toEqual({
      currentPassword: validPasswords.currentPassword,
      newPassword: validPasswords.newPassword,
    });

    expect(
      options.body
    ).not.toHaveProperty("confirmPassword");
  });

  // ===========================================
  // 21. SUCCESS MESSAGE
  // ===========================================

  test("displays API success message", async () => {
    const user = userEvent.setup();

    renderPage();
    fillValidForm();

    await user.click(submitButton());

    expect(
      await screen.findByRole("status")
    ).toHaveTextContent(
      "Password updated successfully."
    );

    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 22. DEFAULT SUCCESS MESSAGE
  // ===========================================

  test("uses fallback success message when API message is missing", async () => {
    const user = userEvent.setup();

    mockRequest.mockResolvedValue({});

    renderPage();
    fillValidForm();

    await user.click(submitButton());

    await waitFor(() => {
      expect(
        screen.getByRole("status")
      ).toHaveTextContent(
        "Password changed successfully."
      );
    });
  });

  // ===========================================
  // 23. RESET FIELDS ON SUCCESS
  // ===========================================

  test("clears all password fields after success", async () => {
    const user = userEvent.setup();

    renderPage();
    fillValidForm();

    await user.click(submitButton());

    await waitFor(() => {
      expect(
        screen.getByRole("status")
      ).toHaveTextContent(
        "Password updated successfully."
      );
    });

    expect(currentPasswordInput()).toHaveValue("");
    expect(newPasswordInput()).toHaveValue("");
    expect(confirmPasswordInput()).toHaveValue("");
  });

  // ===========================================
  // 24. RESET VISIBILITY ON SUCCESS
  // ===========================================

  test("hides passwords again after successful change", async () => {
    const user = userEvent.setup();

    renderPage();
    fillValidForm();

    await user.click(showPasswordsCheckbox());

    expect(showPasswordsCheckbox()).toBeChecked();

    await user.click(submitButton());

    await waitFor(() => {
      expect(
        screen.getByRole("status")
      ).toHaveTextContent(
        "Password updated successfully."
      );
    });

    expect(
      showPasswordsCheckbox()
    ).not.toBeChecked();

    expect(
      currentPasswordInput()
    ).toHaveAttribute("type", "password");

    expect(
      newPasswordInput()
    ).toHaveAttribute("type", "password");

    expect(
      confirmPasswordInput()
    ).toHaveAttribute("type", "password");
  });

  // ===========================================
  // 25. API ERROR
  // ===========================================

  test("displays API error when password change fails", async () => {
    const user = userEvent.setup();

    mockRequest.mockRejectedValue(
      new Error("Current password is incorrect.")
    );

    renderPage();
    fillValidForm();

    await user.click(submitButton());

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Current password is incorrect."
    );

    expect(
      screen.getByRole("status")
    ).toBeEmptyDOMElement();
  });

  // ===========================================
  // 26. FALLBACK API ERROR
  // ===========================================

  test("uses fallback error when API error message is empty", async () => {
    const user = userEvent.setup();

    mockRequest.mockRejectedValue(
      new Error("")
    );

    renderPage();
    fillValidForm();

    await user.click(submitButton());

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to change your password."
    );
  });

  // ===========================================
  // 27. KEEP INPUTS AFTER FAILURE
  // ===========================================

  test("preserves entered passwords after API failure", async () => {
    const user = userEvent.setup();

    mockRequest.mockRejectedValue(
      new Error("Server unavailable")
    );

    renderPage();
    fillValidForm();

    await user.click(submitButton());

    await screen.findByRole("alert");

    expect(currentPasswordInput()).toHaveValue(
      validPasswords.currentPassword
    );

    expect(newPasswordInput()).toHaveValue(
      validPasswords.newPassword
    );

    expect(confirmPasswordInput()).toHaveValue(
      validPasswords.confirmPassword
    );

    expect(submitButton()).toBeEnabled();
  });

  // ===========================================
  // 28. KEEP VISIBILITY AFTER FAILURE
  // ===========================================

  test("preserves password visibility after API failure", async () => {
    const user = userEvent.setup();

    mockRequest.mockRejectedValue(
      new Error("Request failed")
    );

    renderPage();
    fillValidForm();

    await user.click(showPasswordsCheckbox());
    await user.click(submitButton());

    await screen.findByRole("alert");

    expect(showPasswordsCheckbox()).toBeChecked();

    expect(
      currentPasswordInput()
    ).toHaveAttribute("type", "text");
  });

  // ===========================================
  // 29-31. CLEAR ERROR ON FIELD CHANGE
  // ===========================================

  test.each([
    ["current password", "current"],
    ["new password", "new"],
    ["confirmation password", "confirm"],
  ])(
    "clears API error when %s changes",
    async (_description, field) => {
      const user = userEvent.setup();

      mockRequest.mockRejectedValue(
        new Error("Network error")
      );

      renderPage();
      fillValidForm();

      await user.click(submitButton());

      expect(
        await screen.findByRole("alert")
      ).toHaveTextContent("Network error");

      if (field === "current") {
        changeField(
          currentPasswordInput(),
          "UpdatedCurrent123!"
        );
      }

      if (field === "new") {
        changeField(
          newPasswordInput(),
          "UpdatedNew456!"
        );
      }

      if (field === "confirm") {
        changeField(
          confirmPasswordInput(),
          "UpdatedConfirm456!"
        );
      }

      expect(
        screen.queryByRole("alert")
      ).not.toBeInTheDocument();
    }
  );

  // ===========================================
  // 32. CLEAR VALIDATION ERROR
  // ===========================================

  test("clears validation error when an input changes", () => {
    renderPage();

    fireEvent.submit(passwordForm());

    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Complete all password fields."
    );

    changeField(
      currentPasswordInput(),
      "OldPassword123!"
    );

    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 33. CLEAR SUCCESS NOTICE
  // ===========================================

  test("clears success notice when a password field changes", async () => {
    const user = userEvent.setup();

    renderPage();
    fillValidForm();

    await user.click(submitButton());

    await waitFor(() => {
      expect(
        screen.getByRole("status")
      ).toHaveTextContent(
        "Password updated successfully."
      );
    });

    changeField(
      currentPasswordInput(),
      "AnotherOldPassword123!"
    );

    expect(
      screen.getByRole("status")
    ).toBeEmptyDOMElement();
  });

  // ===========================================
  // 34. LOADING STATE DURING API REQUEST
  // ===========================================

  test("shows updating state during pending API request", async () => {
    const user = userEvent.setup();
    const request = deferred();

    mockRequest.mockReturnValue(request.promise);

    renderPage();
    fillValidForm();

    await user.click(submitButton());

    expect(
      passwordForm()
    ).toHaveAttribute("aria-busy", "true");

    expect(
      submitButton()
    ).toHaveTextContent("Updating...");

    expect(
      screen.getByRole("status")
    ).toHaveTextContent(
      "Updating your password..."
    );

    await act(async () => {
      request.resolve({
        message: "Password changed.",
      });
    });

    expect(
      passwordForm()
    ).toHaveAttribute("aria-busy", "false");

    expect(
      screen.getByRole("status")
    ).toHaveTextContent("Password changed.");
  });

  // ===========================================
  // 35. DISABLE INPUTS WHILE SAVING
  // ===========================================

  test("disables password fields while submitting", async () => {
    const user = userEvent.setup();
    const request = deferred();

    mockRequest.mockReturnValue(request.promise);

    renderPage();
    fillValidForm();

    await user.click(submitButton());

    expect(currentPasswordInput()).toBeDisabled();
    expect(newPasswordInput()).toBeDisabled();
    expect(confirmPasswordInput()).toBeDisabled();

    expect(showPasswordsCheckbox()).toBeDisabled();

    expect(submitButton()).toBeDisabled();

    await act(async () => {
      request.resolve({
        message: "Password changed.",
      });
    });

    expect(currentPasswordInput()).toBeEnabled();
    expect(newPasswordInput()).toBeEnabled();
    expect(confirmPasswordInput()).toBeEnabled();

    expect(submitButton()).toBeEnabled();
  });

  // ===========================================
  // 36. PREVENT DUPLICATE REQUESTS
  // ===========================================

  test("prevents duplicate submissions while saving", async () => {
    const user = userEvent.setup();
    const request = deferred();

    mockRequest.mockReturnValue(request.promise);

    renderPage();
    fillValidForm();

    await user.click(submitButton());

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(submitButton()).toBeDisabled();

    // Force another submit event.
    // The submittingRef guard must block it.
    fireEvent.submit(passwordForm());

    expect(mockRequest).toHaveBeenCalledTimes(1);

    await act(async () => {
      request.resolve({
        message: "Password changed.",
      });
    });

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(submitButton()).toBeEnabled();
  });

  // ===========================================
  // 37. RECOVER FROM API FAILURE
  // ===========================================

  test("allows retry after an API failure", async () => {
    const user = userEvent.setup();

    mockRequest
      .mockRejectedValueOnce(
        new Error("Temporary network error")
      )
      .mockResolvedValueOnce({
        message: "Password changed successfully.",
      });

    renderPage();
    fillValidForm();

    await user.click(submitButton());

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Temporary network error"
    );

    expect(submitButton()).toBeEnabled();

    await user.click(submitButton());

    await waitFor(() => {
      expect(
        screen.getByRole("status")
      ).toHaveTextContent(
        "Password changed successfully."
      );
    });

    expect(mockRequest).toHaveBeenCalledTimes(2);

    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 38. NEW SUBMISSION AFTER SUCCESS
  // ===========================================

  test("allows another valid submission after success", async () => {
    const user = userEvent.setup();

    renderPage();
    fillValidForm();

    await user.click(submitButton());

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledTimes(1);

      expect(currentPasswordInput()).toHaveValue("");
    });

    // Simulate a later password change.
    changeField(
      currentPasswordInput(),
      "NewPassword456!"
    );

    changeField(
      newPasswordInput(),
      "AnotherPassword789!"
    );

    changeField(
      confirmPasswordInput(),
      "AnotherPassword789!"
    );

    await user.click(submitButton());

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    expect(mockRequest).toHaveBeenLastCalledWith(
      "/users/change-password",
      {
        method: "PATCH",
        body: {
          currentPassword: "NewPassword456!",
          newPassword: "AnotherPassword789!",
        },
      }
    );
  });

  // ===========================================
  // 39. REVALIDATE AFTER SUCCESS
  // ===========================================

  test("requires fields again after a successful change", async () => {
    const user = userEvent.setup();

    renderPage();
    fillValidForm();

    await user.click(submitButton());

    await waitFor(() => {
      expect(currentPasswordInput()).toHaveValue("");
    });

    // All fields were cleared after success.
    fireEvent.submit(passwordForm());

    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Complete all password fields."
    );

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 40. CORRECT ERROR AFTER FAILED RETRY
  // ===========================================

  test("shows latest API error after another failed attempt", async () => {
    const user = userEvent.setup();

    mockRequest
      .mockRejectedValueOnce(
        new Error("First error")
      )
      .mockRejectedValueOnce(
        new Error("Second error")
      );

    renderPage();
    fillValidForm();

    await user.click(submitButton());

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("First error");

    await user.click(submitButton());

    await waitFor(() => {
      expect(
        screen.getByRole("alert")
      ).toHaveTextContent("Second error");
    });

    expect(
      screen.getByRole("alert")
    ).not.toHaveTextContent("First error");

    expect(mockRequest).toHaveBeenCalledTimes(2);
  });
});
