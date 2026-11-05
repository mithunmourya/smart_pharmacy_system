
import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
} from "vitest";

import { useState } from "react";

import {
  render,
  screen,
  fireEvent,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import Input from "./Input";

// ============================================
// HELPER FUNCTIONS
// ============================================

function renderInput(props = {}) {
  return render(
    <Input
      label="Email address"
      name="email"
      type="email"
      {...props}
    />
  );
}

function getInput(label = "Email address") {
  return screen.getByLabelText(label);
}

// Used to test controlled inputs.
function ControlledInput() {
  const [value, setValue] = useState("");

  return (
    <Input
      label="Username"
      name="username"
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
      }}
    />
  );
}

// ============================================
// INPUT TESTS
// ============================================

describe("Input", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================
  // 1. RENDER INPUT
  // ==========================================

  test("renders an input element", () => {
    renderInput();

    expect(
      getInput()
    ).toBeInTheDocument();
  });

  // ==========================================
  // 2. RENDER LABEL
  // ==========================================

  test("displays the provided label", () => {
    renderInput();

    expect(
      screen.getByText("Email address")
    ).toBeInTheDocument();
  });

  // ==========================================
  // 3. LABEL ASSOCIATION
  // ==========================================

  test("associates label with its input", () => {
    renderInput();

    const input = getInput();
    const label = screen.getByText(
      "Email address"
    );

    expect(input.id).toBeTruthy();

    expect(label).toHaveAttribute(
      "for",
      input.id
    );
  });

  // ==========================================
  // 4. CUSTOM INPUT ID
  // ==========================================

  test("uses explicitly provided input ID", () => {
    renderInput({
      id: "user-email",
    });

    expect(
      getInput()
    ).toHaveAttribute(
      "id",
      "user-email"
    );

    expect(
      screen.getByText("Email address")
    ).toHaveAttribute(
      "for",
      "user-email"
    );
  });

  // ==========================================
  // 5. GENERATED INPUT ID
  // ==========================================

  test("generates an ID when none is provided", () => {
    renderInput();

    expect(getInput().id).not.toBe("");
  });

  // ==========================================
  // 6. UNIQUE GENERATED IDS
  // ==========================================

  test("generates unique IDs for different inputs", () => {
    render(
      <>
        <Input label="First name" />
        <Input label="Last name" />
      </>
    );

    const firstName = getInput("First name");
    const lastName = getInput("Last name");

    expect(firstName.id).toBeTruthy();
    expect(lastName.id).toBeTruthy();

    expect(firstName.id).not.toBe(lastName.id);
  });

  // ==========================================
  // 7. STABLE GENERATED ID
  // ==========================================

  test("preserves generated ID when component rerenders", () => {
    const { rerender } = render(
      <Input label="Username" />
    );

    const originalId = getInput(
      "Username"
    ).id;

    rerender(
      <Input label="Updated username" />
    );

    expect(
      getInput("Updated username")
    ).toHaveAttribute(
      "id",
      originalId
    );
  });

  // ==========================================
  // 8. DEFAULT INPUT TYPE
  // ==========================================

  test("uses text input when type is omitted", () => {
    render(
      <Input label="Full name" />
    );

    expect(
      getInput("Full name")
    ).toHaveProperty("type", "text");
  });

  // ==========================================
  // 9-12. INPUT TYPES
  // ==========================================

  test.each([
    "text",
    "email",
    "password",
    "number",
  ])(
    "supports input type %s",
    (type) => {
      renderInput({
        type,
      });

      expect(
        getInput()
      ).toHaveAttribute("type", type);
    }
  );

  // ==========================================
  // 13. PLACEHOLDER
  // ==========================================

  test("forwards placeholder to input", () => {
    renderInput({
      placeholder: "Enter email",
    });

    expect(
      screen.getByPlaceholderText(
        "Enter email"
      )
    ).toBeInTheDocument();
  });

  // ==========================================
  // 14. NAME ATTRIBUTE
  // ==========================================

  test("forwards name attribute", () => {
    renderInput();

    expect(
      getInput()
    ).toHaveAttribute(
      "name",
      "email"
    );
  });

  // ==========================================
  // 15. AUTOCOMPLETE ATTRIBUTE
  // ==========================================

  test("forwards autocomplete attribute", () => {
    renderInput({
      autoComplete: "email",
    });

    expect(
      getInput()
    ).toHaveAttribute(
      "autocomplete",
      "email"
    );
  });

  // ==========================================
  // 16. REQUIRED INPUT
  // ==========================================

  test("supports required validation", () => {
    renderInput({
      required: true,
    });

    expect(
      getInput()
    ).toBeRequired();
  });

  // ==========================================
  // 17. DISABLED INPUT
  // ==========================================

  test("disables input when disabled is true", () => {
    renderInput({
      disabled: true,
    });

    expect(
      getInput()
    ).toBeDisabled();
  });

  // ==========================================
  // 18. DISABLED INPUT PREVENTS TYPING
  // ==========================================

  test("does not accept typing while disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderInput({
      disabled: true,
      onChange,
    });

    await user.type(
      getInput(),
      "test@example.com"
    );

    expect(
      getInput()
    ).toHaveValue("");

    expect(onChange).not.toHaveBeenCalled();
  });

  // ==========================================
  // 19. READ ONLY
  // ==========================================

  test("supports read-only inputs", () => {
    renderInput({
      readOnly: true,
      defaultValue: "test@example.com",
    });

    expect(
      getInput()
    ).toHaveAttribute("readonly");

    expect(
      getInput()
    ).toHaveValue(
      "test@example.com"
    );
  });

  // ==========================================
  // 20. DEFAULT VALUE
  // ==========================================

  test("displays a provided default value", () => {
    renderInput({
      defaultValue: "admin@example.com",
    });

    expect(
      getInput()
    ).toHaveValue(
      "admin@example.com"
    );
  });

  // ==========================================
  // 21. ONCHANGE CALLBACK
  // ==========================================

  test("calls onChange when user types", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderInput({
      onChange,
    });

    await user.type(
      getInput(),
      "abc"
    );

    expect(onChange).toHaveBeenCalledTimes(3);

    expect(
      getInput()
    ).toHaveValue("abc");
  });

  // ==========================================
  // 22. CONTROLLED INPUT
  // ==========================================

  test("supports controlled input state", async () => {
    const user = userEvent.setup();

    render(<ControlledInput />);

    await user.type(
      getInput("Username"),
      "Ravi"
    );

    expect(
      getInput("Username")
    ).toHaveValue("Ravi");
  });

  // ==========================================
  // 23. FOCUS CALLBACK
  // ==========================================

  test("forwards onFocus callback", () => {
    const onFocus = vi.fn();

    renderInput({
      onFocus,
    });

    fireEvent.focus(getInput());

    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 24. BLUR CALLBACK
  // ==========================================

  test("forwards onBlur callback", () => {
    const onBlur = vi.fn();

    renderInput({
      onBlur,
    });

    fireEvent.blur(getInput());

    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 25. ERROR MESSAGE
  // ==========================================

  test("displays validation error", () => {
    renderInput({
      error: "Email is required",
    });

    expect(
      screen.getByText(
        "Email is required"
      )
    ).toBeInTheDocument();
  });

  // ==========================================
  // 26. ARIA INVALID FALSE
  // ==========================================

  test("marks input valid when error is absent", () => {
    renderInput();

    expect(
      getInput()
    ).toHaveAttribute(
      "aria-invalid",
      "false"
    );
  });

  // ==========================================
  // 27. ARIA INVALID TRUE
  // ==========================================

  test("marks input invalid when error exists", () => {
    renderInput({
      error: "Invalid email address",
    });

    expect(
      getInput()
    ).toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });

  // ==========================================
  // 28. ERROR ACCESSIBILITY
  // ==========================================

  test("links error message to input using aria-describedby", () => {
    renderInput({
      id: "email-field",
      error: "Email is required",
    });

    const input = getInput();

    const error = screen.getByText(
      "Email is required"
    );

    expect(error).toHaveAttribute(
      "id",
      "email-field-error"
    );

    expect(input).toHaveAttribute(
      "aria-describedby",
      "email-field-error"
    );
  });

  // ==========================================
  // 29. NO ERROR DESCRIPTION
  // ==========================================

  test("does not add error description when valid", () => {
    renderInput();

    expect(
      getInput()
    ).not.toHaveAttribute(
      "aria-describedby"
    );

    expect(
      getInput()
    ).toHaveAttribute(
      "aria-invalid",
      "false"
    );
  });

  // ==========================================
  // 30. ERROR BORDER STYLE
  // ==========================================

  test("applies danger border when error exists", () => {
    renderInput({
      error: "Invalid email",
    });

    expect(
      getInput()
    ).toHaveClass(
      "border-danger"
    );
  });

  // ==========================================
  // 31. NORMAL BORDER STYLE
  // ==========================================

  test("applies normal border when valid", () => {
    renderInput();

    expect(
      getInput()
    ).toHaveClass(
      "border-border"
    );

    expect(
      getInput()
    ).not.toHaveClass(
      "border-danger"
    );
  });

  // ==========================================
  // 32. REMOVE ERROR WHEN PROPS CHANGE
  // ==========================================

  test("removes validation error when error prop is cleared", () => {
    const { rerender } = renderInput({
      error: "Invalid email",
    });

    expect(
      getInput()
    ).toHaveAttribute(
      "aria-invalid",
      "true"
    );

    rerender(
      <Input
        label="Email address"
        name="email"
        type="email"
        error=""
      />
    );

    expect(
      screen.queryByText(
        "Invalid email"
      )
    ).not.toBeInTheDocument();

    expect(
      getInput()
    ).toHaveAttribute(
      "aria-invalid",
      "false"
    );

    expect(
      getInput()
    ).not.toHaveAttribute(
      "aria-describedby"
    );
  });

  // ==========================================
  // 33. UPDATE ERROR MESSAGE
  // ==========================================

  test("updates the error message when error prop changes", () => {
    const { rerender } = renderInput({
      error: "Email is required",
    });

    rerender(
      <Input
        label="Email address"
        name="email"
        type="email"
        error="Email format is invalid"
      />
    );

    expect(
      screen.getByText(
        "Email format is invalid"
      )
    ).toBeInTheDocument();

    expect(
      screen.queryByText(
        "Email is required"
      )
    ).not.toBeInTheDocument();
  });

  // ==========================================
  // 34. END ADORNMENT
  // ==========================================

  test("renders endAdornment when provided", () => {
    renderInput({
      endAdornment: (
        <button type="button">
          Show
        </button>
      ),
    });

    expect(
      screen.getByRole("button", {
        name: "Show",
      })
    ).toBeInTheDocument();
  });

  // ==========================================
  // 35. END ADORNMENT INTERACTION
  // ==========================================

  test("supports interactive endAdornment", async () => {
    const user = userEvent.setup();

    const onClick = vi.fn();

    renderInput({
      type: "password",
      endAdornment: (
        <button
          type="button"
          onClick={onClick}
        >
          Show password
        </button>
      ),
    });

    await user.click(
      screen.getByRole("button", {
        name: "Show password",
      })
    );

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 36. ADORNMENT PADDING
  // ==========================================

  test("adds right padding when endAdornment exists", () => {
    renderInput({
      endAdornment: (
        <span>Icon</span>
      ),
    });

    expect(
      getInput()
    ).toHaveClass("pr-20");
  });

  // ==========================================
  // 37. NO ADORNMENT PADDING
  // ==========================================

  test("does not add adornment padding when absent", () => {
    renderInput();

    expect(
      getInput()
    ).not.toHaveClass("pr-20");
  });

  // ==========================================
  // 38. CUSTOM CSS CLASS
  // ==========================================

  test("applies custom className", () => {
    renderInput({
      className: "custom-input-class",
    });

    expect(
      getInput()
    ).toHaveClass(
      "custom-input-class"
    );
  });

  // ==========================================
  // 39. KEEP DEFAULT STYLES
  // ==========================================

  test("preserves default styles with custom className", () => {
    renderInput({
      className: "my-custom-style",
    });

    expect(
      getInput()
    ).toHaveClass(
      "my-custom-style"
    );

    expect(
      getInput()
    ).toHaveClass(
      "rounded-xl"
    );

    expect(
      getInput()
    ).toHaveClass(
      "border-border"
    );
  });

  // ==========================================
  // 40. OTHER HTML ATTRIBUTES
  // ==========================================

  test("forwards additional HTML input attributes", () => {
    renderInput({
      maxLength: 50,
      inputMode: "email",
      "data-testid": "custom-email-input",
    });

    const input = screen.getByTestId(
      "custom-email-input"
    );

    expect(
      input
    ).toHaveAttribute(
      "maxlength",
      "50"
    );

    expect(
      input
    ).toHaveAttribute(
      "inputmode",
      "email"
    );
  });
});
