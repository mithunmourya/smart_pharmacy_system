
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
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import Button from "./Button";

// ============================================
// HELPER FUNCTIONS
// ============================================

function renderButton(props = {}) {
  return render(
    <Button {...props}>
      Click Me
    </Button>
  );
}

function getButton(name = "Click Me") {
  return screen.getByRole("button", {
    name,
  });
}

// ============================================
// BUTTON TESTS
// ============================================

describe("Button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================
  // 1. RENDER BUTTON
  // ==========================================

  test("renders a button element", () => {
    renderButton();

    expect(
      getButton()
    ).toBeInTheDocument();
  });

  // ==========================================
  // 2. BUTTON TEXT
  // ==========================================

  test("displays provided children", () => {
    render(
      <Button>Save Medicine</Button>
    );

    expect(
      screen.getByRole("button", {
        name: "Save Medicine",
      })
    ).toBeInTheDocument();
  });

  // ==========================================
  // 3. DEFAULT TYPE
  // ==========================================

  test("uses button type by default", () => {
    renderButton();

    expect(
      getButton()
    ).toHaveAttribute(
      "type",
      "button"
    );
  });

  // ==========================================
  // 4-6. SUPPORTED BUTTON TYPES
  // ==========================================

  test.each([
    "button",
    "submit",
    "reset",
  ])(
    "supports type %s",
    (type) => {
      renderButton({ type });

      expect(
        getButton()
      ).toHaveAttribute(
        "type",
        type
      );
    }
  );

  // ==========================================
  // 7. ENABLED BY DEFAULT
  // ==========================================

  test("is enabled by default", () => {
    renderButton();

    expect(
      getButton()
    ).toBeEnabled();
  });

  // ==========================================
  // 8. DISABLED FALSE
  // ==========================================

  test("remains enabled when disabled is false", () => {
    renderButton({
      disabled: false,
    });

    expect(
      getButton()
    ).toBeEnabled();
  });

  // ==========================================
  // 9. DISABLED TRUE
  // ==========================================

  test("disables button when disabled is true", () => {
    renderButton({
      disabled: true,
    });

    expect(
      getButton()
    ).toBeDisabled();
  });

  // ==========================================
  // 10. CLICK HANDLER
  // ==========================================

  test("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    renderButton({ onClick });

    await user.click(getButton());

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 11. MULTIPLE CLICKS
  // ==========================================

  test("calls onClick for each click", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    renderButton({ onClick });

    await user.click(getButton());
    await user.click(getButton());
    await user.click(getButton());

    expect(onClick).toHaveBeenCalledTimes(3);
  });

  // ==========================================
  // 12. DISABLED CLICK PROTECTION
  // ==========================================

  test("does not call onClick when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    renderButton({
      disabled: true,
      onClick,
    });

    await user.click(getButton());

    expect(
      onClick
    ).not.toHaveBeenCalled();
  });

  // ==========================================
  // 13. KEYBOARD ENTER
  // ==========================================

  test("supports Enter key activation", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    renderButton({ onClick });

    getButton().focus();

    await user.keyboard("{Enter}");

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 14. KEYBOARD SPACE
  // ==========================================

  test("supports Space key activation", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    renderButton({ onClick });

    getButton().focus();

    await user.keyboard(" ");

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 15. DISABLED KEYBOARD ACTIVATION
  // ==========================================

  test("does not activate disabled button using keyboard", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    renderButton({
      disabled: true,
      onClick,
    });

    getButton().focus();

    await user.keyboard("{Enter}");

    expect(onClick).not.toHaveBeenCalled();
  });

  // ==========================================
  // 16. DEFAULT STYLING
  // ==========================================

  test("applies default button styles", () => {
    renderButton();

    expect(getButton()).toHaveClass(
      "inline-flex",
      "min-h-12",
      "rounded-xl",
      "bg-primary",
      "font-semibold",
      "text-white"
    );
  });

  // ==========================================
  // 17. DISABLED STYLING
  // ==========================================

  test("includes disabled-state styling", () => {
    renderButton({
      disabled: true,
    });

    expect(
      getButton()
    ).toHaveClass(
      "disabled:cursor-not-allowed",
      "disabled:opacity-50"
    );
  });

  // ==========================================
  // 18. CUSTOM CSS CLASS
  // ==========================================

  test("applies custom className", () => {
    renderButton({
      className: "w-full",
    });

    expect(
      getButton()
    ).toHaveClass("w-full");
  });

  // ==========================================
  // 19. PRESERVE DEFAULT STYLES
  // ==========================================

  test("preserves default styles with custom className", () => {
    renderButton({
      className: "custom-button",
    });

    expect(
      getButton()
    ).toHaveClass(
      "custom-button",
      "rounded-xl",
      "bg-primary",
      "font-semibold"
    );
  });

  // ==========================================
  // 20. HTML ID ATTRIBUTE
  // ==========================================

  test("forwards id attribute", () => {
    renderButton({
      id: "save-button",
    });

    expect(
      getButton()
    ).toHaveAttribute(
      "id",
      "save-button"
    );
  });

  // ==========================================
  // 21. HTML NAME ATTRIBUTE
  // ==========================================

  test("forwards name attribute", () => {
    renderButton({
      name: "saveMedicine",
    });

    expect(
      getButton()
    ).toHaveAttribute(
      "name",
      "saveMedicine"
    );
  });

  // ==========================================
  // 22. ACCESSIBILITY LABEL
  // ==========================================

  test("supports aria-label", () => {
    render(
      <Button aria-label="Save changes">
        Save
      </Button>
    );

    expect(
      screen.getByRole("button", {
        name: "Save changes",
      })
    ).toBeInTheDocument();
  });

  // ==========================================
  // 23. TITLE ATTRIBUTE
  // ==========================================

  test("forwards title attribute", () => {
    renderButton({
      title: "Save this record",
    });

    expect(
      getButton()
    ).toHaveAttribute(
      "title",
      "Save this record"
    );
  });

  // ==========================================
  // 24. DATA ATTRIBUTES
  // ==========================================

  test("forwards custom data attributes", () => {
    renderButton({
      "data-testid": "custom-button",
      "data-action": "save",
    });

    const button = screen.getByTestId(
      "custom-button"
    );

    expect(
      button
    ).toHaveAttribute(
      "data-action",
      "save"
    );
  });

  // ==========================================
  // 25. FOCUS CALLBACK
  // ==========================================

  test("forwards onFocus callback", () => {
    const onFocus = vi.fn();

    renderButton({ onFocus });

    fireEvent.focus(getButton());

    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 26. BLUR CALLBACK
  // ==========================================

  test("forwards onBlur callback", () => {
    const onBlur = vi.fn();

    renderButton({ onBlur });

    fireEvent.blur(getButton());

    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 27. SUBMIT FORM
  // ==========================================

  test("submits a form when type is submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event) => {
      event.preventDefault();
    });

    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">
          Submit Form
        </Button>
      </form>
    );

    await user.click(
      screen.getByRole("button", {
        name: "Submit Form",
      })
    );

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 28. DEFAULT BUTTON DOES NOT SUBMIT
  // ==========================================

  test("does not submit a form by default", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event) => {
      event.preventDefault();
    });

    render(
      <form onSubmit={onSubmit}>
        <Button>
          Normal Button
        </Button>
      </form>
    );

    await user.click(
      screen.getByRole("button", {
        name: "Normal Button",
      })
    );

    expect(onSubmit).not.toHaveBeenCalled();
  });

  // ==========================================
  // 29. DISABLED SUBMIT BUTTON
  // ==========================================

  test("does not submit when submit button is disabled", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event) => {
      event.preventDefault();
    });

    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" disabled>
          Submit Form
        </Button>
      </form>
    );

    await user.click(
      screen.getByRole("button", {
        name: "Submit Form",
      })
    );

    expect(onSubmit).not.toHaveBeenCalled();
  });

  // ==========================================
  // 30. RESET FORM
  // ==========================================

  test("resets native form fields when type is reset", async () => {
    const user = userEvent.setup();

    render(
      <form>
        <label htmlFor="medicine">
          Medicine
        </label>

        <input
          id="medicine"
          defaultValue="Paracetamol"
        />

        <Button type="reset">
          Reset Form
        </Button>
      </form>
    );

    const input = screen.getByRole(
      "textbox",
      { name: "Medicine" }
    );

    await user.clear(input);
    await user.type(input, "Ibuprofen");

    expect(input).toHaveValue("Ibuprofen");

    await user.click(
      screen.getByRole("button", {
        name: "Reset Form",
      })
    );

    expect(input).toHaveValue("Paracetamol");
  });

  // ==========================================
  // 31. JSX CHILDREN
  // ==========================================

  test("supports nested JSX children", () => {
    render(
      <Button>
        <span data-testid="save-icon">
          +
        </span>
        <span>Save Medicine</span>
      </Button>
    );

    expect(
      screen.getByTestId("save-icon")
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: /Save Medicine/,
      })
    ).toBeInTheDocument();
  });

  // ==========================================
  // 32. UPDATE BUTTON TEXT
  // ==========================================

  test("updates children when props change", () => {
    const { rerender } = render(
      <Button>Save</Button>
    );

    expect(
      screen.getByRole("button", {
        name: "Save",
      })
    ).toBeInTheDocument();

    rerender(
      <Button>Update</Button>
    );

    expect(
      screen.getByRole("button", {
        name: "Update",
      })
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: "Save",
      })
    ).not.toBeInTheDocument();
  });

  // ==========================================
  // 33. UPDATE DISABLED PROP
  // ==========================================

  test("updates disabled state on rerender", () => {
    const { rerender } = render(
      <Button disabled>
        Save
      </Button>
    );

    expect(
      getButton("Save")
    ).toBeDisabled();

    rerender(
      <Button disabled={false}>
        Save
      </Button>
    );

    expect(
      getButton("Save")
    ).toBeEnabled();
  });

  // ==========================================
  // 34. UPDATE CLICK HANDLER
  // ==========================================

  test("uses updated onClick handler after rerender", async () => {
    const user = userEvent.setup();

    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    const { rerender } = render(
      <Button onClick={firstHandler}>
        Save
      </Button>
    );

    await user.click(getButton("Save"));

    expect(firstHandler).toHaveBeenCalledTimes(1);

    rerender(
      <Button onClick={secondHandler}>
        Save
      </Button>
    );

    await user.click(getButton("Save"));

    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).toHaveBeenCalledTimes(1);
  });
});
