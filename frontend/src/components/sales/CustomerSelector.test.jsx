
import { useState } from "react";

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

import CustomerSelector from "./CustomerSelector";
import useAuth from "../../hooks/useAuth";

import {
  lookupCustomer,
  createCustomer,
} from "../../services/customer.service";

// =============================================
// MOCK DEPENDENCIES
// =============================================

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

vi.mock("../../services/customer.service", () => ({
  lookupCustomer: vi.fn(),
  createCustomer: vi.fn(),
}));

// =============================================
// TEST DATA
// =============================================

const customer = {
  user_id: 7,
  name: "Ravi Kumar",
  email: "ravi@example.com",
};

const walkInSelection = {
  mode: "walk-in",
  customer: null,
};

const mockRequest = vi.fn();

// =============================================
// TEST WRAPPER
// =============================================

// CustomerSelector receives its selected customer
// through props from NewSale.jsx.
//
// This wrapper simulates that parent component.

function TestHarness({
  initialValue,
  disabled,
  onSelectionChange,
  onBusyChange,
}) {
  const [selection, setSelection] = useState(initialValue);
  const [busy, setBusy] = useState(false);

  function handleChange(nextSelection) {
    onSelectionChange?.(nextSelection);
    setSelection(nextSelection);
  }

  function handleBusyChange(nextBusy) {
    onBusyChange?.(nextBusy);
    setBusy(nextBusy);
  }

  return (
    <>
      <CustomerSelector
        value={selection}
        onChange={handleChange}
        onBusyChange={handleBusyChange}
        disabled={disabled}
      />

      <output data-testid="selection-mode">
        {selection.mode}
      </output>

      <output data-testid="selection-id">
        {selection.customer?.user_id ?? "none"}
      </output>

      <output data-testid="customer-busy">
        {busy ? "busy" : "idle"}
      </output>
    </>
  );
}

// =============================================
// HELPER FUNCTIONS
// =============================================

function renderSelector({
  initialValue = walkInSelection,
  disabled = false,
  onSelectionChange = vi.fn(),
  onBusyChange = vi.fn(),
} = {}) {
  return render(
    <TestHarness
      initialValue={initialValue}
      disabled={disabled}
      onSelectionChange={onSelectionChange}
      onBusyChange={onBusyChange}
    />
  );
}

function changeInput(label, value) {
  fireEvent.change(
    screen.getByLabelText(label),
    {
      target: {
        value,
      },
    }
  );
}

async function selectMode(user, name) {
  await user.click(
    screen.getByRole("radio", { name })
  );
}

async function submitLookup(
  user,
  email = "ravi@example.com"
) {
  await selectMode(user, "Existing Customer");

  changeInput("Customer email", email);

  await user.click(
    screen.getByRole("button", {
      name: "Search customer",
    })
  );
}

async function submitCreation(
  user,
  name = "Ravi Kumar",
  email = "ravi@example.com"
) {
  await selectMode(user, "Create Customer");

  changeInput("Customer name", name);
  changeInput("Customer email", email);

  await user.click(
    screen.getByRole("button", {
      name: "Create and select",
    })
  );
}

// =============================================
// CUSTOMER SELECTOR TESTS
// =============================================

describe("CustomerSelector", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    useAuth.mockReturnValue({
      authenticatedRequest: mockRequest,
    });

    lookupCustomer.mockResolvedValue(customer);
    createCustomer.mockResolvedValue(customer);
  });

  // ===========================================
  // 1. DEFAULT WALK-IN MODE
  // ===========================================

  test("renders walk-in mode by default", () => {
    // Arrange & Act
    renderSelector();

    // Assert
    expect(
      screen.getByRole("radio", {
        name: "Walk-in",
      })
    ).toBeChecked();

    expect(
      screen.getByText(
        "This sale will be recorded without a customer account."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByTestId("selection-mode")
    ).toHaveTextContent("walk-in");

    expect(lookupCustomer).not.toHaveBeenCalled();
    expect(createCustomer).not.toHaveBeenCalled();
  });

  // ===========================================
  // 2. SWITCH TO EXISTING CUSTOMER
  // ===========================================

  test("shows customer lookup form", async () => {
    // Arrange
    const user = userEvent.setup();
    renderSelector();

    // Act
    await selectMode(user, "Existing Customer");

    // Assert
    expect(
      screen.getByLabelText("Customer email")
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Search customer",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByTestId("selection-mode")
    ).toHaveTextContent("existing");
  });

  // ===========================================
  // 3. SWITCH TO CREATE CUSTOMER
  // ===========================================

  test("shows customer creation form", async () => {
    // Arrange
    const user = userEvent.setup();
    renderSelector();

    // Act
    await selectMode(user, "Create Customer");

    // Assert
    expect(
      screen.getByLabelText("Customer name")
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Customer email")
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Create and select",
      })
    ).toBeInTheDocument();
  });

  // ===========================================
  // 4. EMPTY EMAIL
  // ===========================================

  test("rejects empty customer email", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSelector();

    await selectMode(user, "Existing Customer");

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Search customer",
      })
    );

    // Assert
    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Enter a valid email address."
    );

    expect(
      screen.getByLabelText("Customer email")
    ).toHaveFocus();

    expect(lookupCustomer).not.toHaveBeenCalled();
  });

  // ===========================================
  // 5-8. INVALID EMAIL FORMATS
  // ===========================================

  test.each([
    "invalid-email",
    "ravi@",
    "ravi@example",
    "ravi @example.com",
  ])(
    "rejects invalid email %s",
    async (email) => {
      // Arrange
      const user = userEvent.setup();

      renderSelector();

      // Act
      await submitLookup(user, email);

      // Assert
      expect(
        screen.getByRole("alert")
      ).toHaveTextContent(
        "Enter a valid email address."
      );

      expect(lookupCustomer).not.toHaveBeenCalled();
    }
  );

  // ===========================================
  // 9. EMAIL MAXIMUM LENGTH
  // ===========================================

  test("rejects email longer than 100 characters", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSelector();

    await selectMode(user, "Existing Customer");

    const emailInput =
      screen.getByLabelText("Customer email");

    expect(emailInput).toHaveAttribute(
      "maxlength",
      "100"
    );

    // Act: Simulate an overlength value.
    changeInput(
      "Customer email",
      `${"a".repeat(101)}@example.com`
    );

    await user.click(
      screen.getByRole("button", {
        name: "Search customer",
      })
    );

    // Assert
    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Enter a valid email address."
    );

    expect(lookupCustomer).not.toHaveBeenCalled();
  });

  // ===========================================
  // 10. SUCCESSFUL CUSTOMER LOOKUP
  // ===========================================

  test("finds an existing customer", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSelector();

    // Act
    await submitLookup(
      user,
      "  ravi@example.com  "
    );

    // Assert
    await waitFor(() => {
      expect(lookupCustomer).toHaveBeenCalledWith(
        mockRequest,
        "ravi@example.com"
      );
    });

    expect(
      await screen.findByText(
        "Customer found — confirm before selecting"
      )
    ).toBeInTheDocument();

    expect(
      screen.getByText("Ravi Kumar")
    ).toBeInTheDocument();

    // Lookup should NOT automatically select customer.
    expect(
      screen.getByTestId("selection-id")
    ).toHaveTextContent("none");
  });

  // ===========================================
  // 11. SELECT FOUND CUSTOMER
  // ===========================================

  test("selects customer only after confirmation", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSelector();

    await submitLookup(user);

    await screen.findByRole("button", {
      name: "Select customer",
    });

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Select customer",
      })
    );

    // Assert
    expect(
      screen.getByTestId("selection-id")
    ).toHaveTextContent("7");

    expect(
      screen.getByTestId("selection-mode")
    ).toHaveTextContent("existing");

    expect(
      screen.getByText("Selected customer")
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Change customer",
      })
    ).toBeInTheDocument();
  });

  // ===========================================
  // 12. CHANGE SELECTED CUSTOMER
  // ===========================================

  test("allows changing a selected customer", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSelector({
      initialValue: {
        mode: "existing",
        customer,
      },
    });

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Change customer",
      })
    );

    // Assert
    expect(
      screen.getByTestId("selection-id")
    ).toHaveTextContent("none");

    expect(
      screen.getByLabelText("Customer email")
    ).toHaveValue("ravi@example.com");

    expect(
      screen.getByRole("button", {
        name: "Search customer",
      })
    ).toBeInTheDocument();
  });

  // ===========================================
  // 13. CUSTOMER NOT FOUND
  // ===========================================

  test("shows alternatives when customer is not found", async () => {
    // Arrange
    const user = userEvent.setup();

    lookupCustomer.mockRejectedValueOnce(
      Object.assign(
        new Error(
          "No customer account found for this email."
        ),
        { status: 404 }
      )
    );

    renderSelector();

    // Act
    await submitLookup(user);

    // Assert
    expect(
      await screen.findByText(
        "No customer account was found for this email."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Create account",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Continue as walk-in",
      })
    ).toBeInTheDocument();
  });

  // ===========================================
  // 14. SWITCH TO CREATE AFTER NOT FOUND
  // ===========================================

  test("can switch to create mode when lookup finds no customer", async () => {
    // Arrange
    const user = userEvent.setup();

    lookupCustomer.mockRejectedValueOnce(
      Object.assign(
        new Error(
          "No customer account found for this email."
        ),
        { status: 404 }
      )
    );

    renderSelector();

    await submitLookup(user);

    await screen.findByRole("button", {
      name: "Create account",
    });

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Create account",
      })
    );

    // Assert
    expect(
      screen.getByTestId("selection-mode")
    ).toHaveTextContent("create");

    expect(
      screen.getByLabelText("Customer name")
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Customer email")
    ).toHaveValue("ravi@example.com");
  });

  // ===========================================
  // 15. CONTINUE AS WALK-IN
  // ===========================================

  test("can continue as walk-in when customer is not found", async () => {
    // Arrange
    const user = userEvent.setup();

    lookupCustomer.mockRejectedValueOnce(
      Object.assign(
        new Error(
          "No customer account found for this email."
        ),
        { status: 404 }
      )
    );

    renderSelector();

    await submitLookup(user);

    await screen.findByRole("button", {
      name: "Continue as walk-in",
    });

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Continue as walk-in",
      })
    );

    // Assert
    expect(
      screen.getByTestId("selection-mode")
    ).toHaveTextContent("walk-in");

    expect(
      screen.getByRole("radio", {
        name: "Walk-in",
      })
    ).toBeChecked();
  });

  // ===========================================
  // 16. OTHER LOOKUP ERROR
  // ===========================================

  test("displays lookup errors normally", async () => {
    // Arrange
    const user = userEvent.setup();

    lookupCustomer.mockRejectedValueOnce(
      Object.assign(
        new Error("Customer lookup failed"),
        { status: 500 }
      )
    );

    renderSelector();

    // Act
    await submitLookup(user);

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Customer lookup failed"
    );

    expect(
      screen.queryByRole("button", {
        name: "Create account",
      })
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 17. FALLBACK LOOKUP ERROR
  // ===========================================

  test("displays fallback lookup error", async () => {
    // Arrange
    const user = userEvent.setup();

    lookupCustomer.mockRejectedValueOnce(
      new Error("")
    );

    renderSelector();

    // Act
    await submitLookup(user);

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to process customer details."
    );
  });

  // ===========================================
  // 18. CREATE WITHOUT NAME
  // ===========================================

  test("rejects customer creation without a name", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSelector();

    // Act
    await submitCreation(
      user,
      "",
      "ravi@example.com"
    );

    // Assert
    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Enter a customer name of 100 characters or fewer."
    );

    expect(
      screen.getByLabelText("Customer name")
    ).toHaveFocus();

    expect(createCustomer).not.toHaveBeenCalled();
  });

  // ===========================================
  // 19. WHITESPACE CUSTOMER NAME
  // ===========================================

  test("rejects whitespace-only customer name", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSelector();

    // Act
    await submitCreation(
      user,
      "    ",
      "ravi@example.com"
    );

    // Assert
    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Enter a customer name of 100 characters or fewer."
    );

    expect(createCustomer).not.toHaveBeenCalled();
  });

  // ===========================================
  // 20. NAME LONGER THAN 100
  // ===========================================

  test("rejects customer name longer than 100 characters", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSelector();

    // Act
    await submitCreation(
      user,
      "R".repeat(101),
      "ravi@example.com"
    );

    // Assert
    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Enter a customer name of 100 characters or fewer."
    );

    expect(createCustomer).not.toHaveBeenCalled();
  });

  // ===========================================
  // 21. SUCCESSFUL CUSTOMER CREATION
  // ===========================================

  test("creates and automatically selects a customer", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSelector();

    // Act
    await submitCreation(
      user,
      "  Ravi Kumar  ",
      "  ravi@example.com  "
    );

    // Assert request
    await waitFor(() => {
      expect(createCustomer).toHaveBeenCalledWith(
        mockRequest,
        {
          name: "Ravi Kumar",
          email: "ravi@example.com",
        }
      );
    });

    // Assert selection
    expect(
      await screen.findByText(
        "Selected customer"
      )
    ).toBeInTheDocument();

    expect(
      screen.getByTestId("selection-mode")
    ).toHaveTextContent("existing");

    expect(
      screen.getByTestId("selection-id")
    ).toHaveTextContent("7");
  });

  // ===========================================
  // 22. DUPLICATE CUSTOMER ACCOUNT
  // ===========================================

  test("offers existing-account lookup when creation conflicts", async () => {
    // Arrange
    const user = userEvent.setup();

    createCustomer.mockRejectedValueOnce(
      Object.assign(
        new Error("Email is already registered."),
        { status: 409 }
      )
    );

    renderSelector();

    // Act
    await submitCreation(user);

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Email is already registered."
    );

    expect(
      screen.getByRole("button", {
        name: "Search existing account",
      })
    ).toBeInTheDocument();

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Search existing account",
      })
    );

    // Assert
    expect(
      screen.getByTestId("selection-mode")
    ).toHaveTextContent("existing");

    expect(
      screen.getByLabelText("Customer email")
    ).toHaveValue("ravi@example.com");
  });

  // ===========================================
  // 23. NORMAL CREATION FAILURE
  // ===========================================

  test("shows validation error when account creation fails", async () => {
    // Arrange
    const user = userEvent.setup();

    createCustomer.mockRejectedValueOnce(
      Object.assign(
        new Error("Customer details rejected."),
        { status: 400 }
      )
    );

    renderSelector();

    // Act
    await submitCreation(user);

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Customer details rejected."
    );

    expect(
      screen.getByTestId("selection-mode")
    ).toHaveTextContent("create");

    expect(
      screen.getByTestId("selection-id")
    ).toHaveTextContent("none");
  });

  // ===========================================
  // 24-26. UNCERTAIN CREATION OUTCOME
  // ===========================================

  test.each([
    [undefined, "network failure"],
    [408, "request timeout"],
    [500, "server error"],
  ])(
    "requires lookup after uncertain creation: %s (%s)",
    async (status) => {
      // Arrange
      const user = userEvent.setup();

      const error = new Error("Request failed");

      if (status !== undefined) {
        error.status = status;
      }

      createCustomer.mockRejectedValueOnce(error);

      renderSelector();

      // Act
      await submitCreation(user);

      // Assert
      expect(
        await screen.findByRole("alert")
      ).toHaveTextContent(
        "Account creation could not be confirmed."
      );

      expect(
        screen.getByTestId("selection-mode")
      ).toHaveTextContent("existing");

      expect(
        screen.getByTestId("selection-id")
      ).toHaveTextContent("none");

      expect(createCustomer).toHaveBeenCalledTimes(1);

      // User should search before attempting creation again.
      expect(
        screen.getByRole("button", {
          name: "Search customer",
        })
      ).toBeInTheDocument();
    }
  );

  // ===========================================
  // 27. CLEAR ERROR WHEN EMAIL CHANGES
  // ===========================================

  test("clears lookup error when email is edited", async () => {
    // Arrange
    const user = userEvent.setup();

    lookupCustomer.mockRejectedValueOnce(
      new Error("Network error")
    );

    renderSelector();

    await submitLookup(user);

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Network error");

    // Act
    changeInput(
      "Customer email",
      "new@example.com"
    );

    // Assert
    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 28. CLEAR ERROR WHEN MODE CHANGES
  // ===========================================

  test("clears feedback when changing customer mode", async () => {
    // Arrange
    const user = userEvent.setup();

    lookupCustomer.mockRejectedValueOnce(
      new Error("Search failed")
    );

    renderSelector();

    await submitLookup(user);

    await screen.findByRole("alert");

    // Act
    await selectMode(user, "Create Customer");

    // Assert
    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();

    expect(
      screen.getByTestId("selection-mode")
    ).toHaveTextContent("create");
  });

  // ===========================================
  // 29. DISABLED SELECTOR
  // ===========================================

  test("prevents interaction when disabled", async () => {
    // Arrange
    const user = userEvent.setup();

    renderSelector({
      initialValue: {
        mode: "existing",
        customer: null,
      },
      disabled: true,
    });

    // Assert
    expect(
      screen.getByRole("radio", {
        name: "Walk-in",
      })
    ).toBeDisabled();

    expect(
      screen.getByLabelText("Customer email")
    ).toBeDisabled();

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Search customer",
      })
    );

    // Assert
    expect(lookupCustomer).not.toHaveBeenCalled();
    expect(createCustomer).not.toHaveBeenCalled();
  });

  // ===========================================
  // 30. LOADING AND DUPLICATE REQUESTS
  // ===========================================

  test("prevents duplicate customer lookup requests", async () => {
    // Arrange
    const user = userEvent.setup();

    let resolveLookup;
    const onBusyChange = vi.fn();

    lookupCustomer.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLookup = resolve;
        })
    );

    renderSelector({ onBusyChange });

    // Act
    await submitLookup(user);

    // Assert loading
    expect(
      screen.getByText(
        "Checking customer email..."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Searching...",
      })
    ).toBeDisabled();

    expect(
      screen.getByTestId("customer-busy")
    ).toHaveTextContent("busy");

    // Force another form submission.
    fireEvent.submit(
      screen
        .getByRole("button", {
          name: "Searching...",
        })
        .closest("form")
    );

    expect(lookupCustomer).toHaveBeenCalledTimes(1);

    // Complete the request.
    await act(async () => {
      resolveLookup(customer);
    });

    // Assert
    expect(
      screen.getByRole("button", {
        name: "Select customer",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByTestId("customer-busy")
    ).toHaveTextContent("idle");

    expect(onBusyChange).toHaveBeenNthCalledWith(
      1,
      true
    );

    expect(onBusyChange).toHaveBeenNthCalledWith(
      2,
      false
    );
  });

  // ===========================================
  // 31. STALE RESPONSE AFTER UNMOUNT
  // ===========================================

  test("ignores lookup result after selector unmounts", async () => {
    // Arrange
    const user = userEvent.setup();

    let resolveLookup;
    const onSelectionChange = vi.fn();

    lookupCustomer.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLookup = resolve;
        })
    );

    const { unmount } = renderSelector({
      initialValue: {
        mode: "existing",
        customer: null,
      },
      onSelectionChange,
    });

    changeInput(
      "Customer email",
      "ravi@example.com"
    );

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Search customer",
      })
    );

    unmount();

    await act(async () => {
      resolveLookup(customer);
    });

    // Assert
    expect(onSelectionChange).not.toHaveBeenCalled();
  });
});
