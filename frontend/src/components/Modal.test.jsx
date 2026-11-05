
import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";

import {
  render,
  screen,
  fireEvent,
  cleanup,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import Modal from "./Modal";

// ============================================
// MOCK FUNCTIONS
// ============================================

const mockOnClose = vi.fn();

const mockShowModal = vi.fn(function () {
  this.setAttribute("open", "");
});

const mockClose = vi.fn(function () {
  this.removeAttribute("open");
});

// ============================================
// ORIGINAL BROWSER METHODS
// ============================================

const originalShowModal =
  Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    "showModal"
  );

const originalClose =
  Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    "close"
  );

function restoreMethod(name, descriptor) {
  if (descriptor) {
    Object.defineProperty(
      HTMLDialogElement.prototype,
      name,
      descriptor
    );
  } else {
    delete HTMLDialogElement.prototype[name];
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function renderModal(props = {}) {
  return render(
    <Modal
      title="Test Modal"
      onClose={mockOnClose}
      {...props}
    >
      <p>Modal content</p>
    </Modal>
  );
}

function getDialog() {
  return screen.getByRole("dialog");
}

function getCloseButton() {
  return screen.getByRole("button", {
    name: "Close dialog",
  });
}

function cancelDialog() {
  const event = new Event("cancel", {
    bubbles: true,
    cancelable: true,
  });

  fireEvent(getDialog(), event);

  return event;
}

// ============================================
// MODAL TESTS
// ============================================

describe("Modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    document.body.style.overflow = "auto";

    Object.defineProperty(
      HTMLDialogElement.prototype,
      "showModal",
      {
        configurable: true,
        writable: true,
        value: mockShowModal,
      }
    );

    Object.defineProperty(
      HTMLDialogElement.prototype,
      "close",
      {
        configurable: true,
        writable: true,
        value: mockClose,
      }
    );
  });

  afterEach(() => {
    // Unmount before restoring dialog methods.
    cleanup();

    restoreMethod(
      "showModal",
      originalShowModal
    );

    restoreMethod(
      "close",
      originalClose
    );

    document.body.style.overflow = "";
  });

  // ==========================================
  // 1. RENDER DIALOG
  // ==========================================

  test("renders a dialog", () => {
    renderModal();

    expect(
      getDialog()
    ).toBeInTheDocument();
  });

  // ==========================================
  // 2. MODAL TITLE
  // ==========================================

  test("displays the modal title", () => {
    renderModal();

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Test Modal",
      })
    ).toBeInTheDocument();
  });

  // ==========================================
  // 3. ACCESSIBLE DIALOG NAME
  // ==========================================

  test("connects dialog accessible name to title", () => {
    renderModal();

    const dialog = screen.getByRole("dialog", {
      name: "Test Modal",
    });

    const heading = screen.getByRole("heading", {
      name: "Test Modal",
    });

    expect(dialog).toHaveAttribute(
      "aria-labelledby",
      heading.id
    );

    expect(heading.id).not.toBe("");
  });

  // ==========================================
  // 4. RENDER CHILD CONTENT
  // ==========================================

  test("renders children inside the modal", () => {
    renderModal();

    expect(
      screen.getByText("Modal content")
    ).toBeInTheDocument();
  });

  // ==========================================
  // 5. RENDER FORM INSIDE MODAL
  // ==========================================

  test("supports interactive child elements", async () => {
    const user = userEvent.setup();

    render(
      <Modal
        title="Create Medicine"
        onClose={mockOnClose}
      >
        <label htmlFor="medicine-name">
          Medicine name
        </label>

        <input id="medicine-name" />

        <button type="button">
          Save Medicine
        </button>
      </Modal>
    );

    const input = screen.getByRole("textbox", {
      name: "Medicine name",
    });

    await user.type(input, "Paracetamol");

    expect(input).toHaveValue("Paracetamol");

    expect(
      screen.getByRole("button", {
        name: "Save Medicine",
      })
    ).toBeInTheDocument();
  });

  // ==========================================
  // 6. OPEN MODAL ON MOUNT
  // ==========================================

  test("calls showModal when mounted", () => {
    renderModal();

    expect(
      mockShowModal
    ).toHaveBeenCalledTimes(1);

    expect(
      getDialog()
    ).toHaveAttribute("open");
  });

  // ==========================================
  // 7. LOCK BACKGROUND SCROLLING
  // ==========================================

  test("locks body scrolling when modal opens", () => {
    renderModal();

    expect(
      document.body.style.overflow
    ).toBe("hidden");
  });

  // ==========================================
  // 8. CLOSE BUTTON
  // ==========================================

  test("renders an accessible close button", () => {
    renderModal();

    expect(
      getCloseButton()
    ).toBeInTheDocument();

    expect(
      getCloseButton()
    ).toHaveAttribute(
      "type",
      "button"
    );

    expect(
      getCloseButton()
    ).toBeEnabled();
  });

  // ==========================================
  // 9. CLOSE BUTTON CALLS CALLBACK
  // ==========================================

  test("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();

    renderModal();

    await user.click(getCloseButton());

    expect(
      mockOnClose
    ).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 10. DEFAULT BUSY VALUE
  // ==========================================

  test("allows closing when busy is omitted", async () => {
    const user = userEvent.setup();

    renderModal();

    await user.click(getCloseButton());

    expect(
      mockOnClose
    ).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 11. BUSY DISABLES CLOSE BUTTON
  // ==========================================

  test("disables close button while busy", () => {
    renderModal({
      busy: true,
    });

    expect(
      getCloseButton()
    ).toBeDisabled();
  });

  // ==========================================
  // 12. BUSY PREVENTS CLOSE CLICK
  // ==========================================

  test("does not call onClose when busy", async () => {
    const user = userEvent.setup();

    renderModal({
      busy: true,
    });

    await user.click(getCloseButton());

    expect(
      mockOnClose
    ).not.toHaveBeenCalled();
  });

  // ==========================================
  // 13. CANCEL EVENT
  // ==========================================

  test("calls onClose when dialog receives cancel event", () => {
    renderModal();

    cancelDialog();

    expect(
      mockOnClose
    ).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 14. PREVENT NATIVE CANCEL
  // ==========================================

  test("prevents native browser closing on cancel", () => {
    renderModal();

    const event = cancelDialog();

    expect(
      event.defaultPrevented
    ).toBe(true);

    // Component requests closure via onClose;
    // the parent controls whether it unmounts.
    expect(
      getDialog()
    ).toHaveAttribute("open");
  });

  // ==========================================
  // 15. BUSY CANCEL PROTECTION
  // ==========================================

  test("does not call onClose on cancel while busy", () => {
    renderModal({
      busy: true,
    });

    const event = cancelDialog();

    expect(
      event.defaultPrevented
    ).toBe(true);

    expect(
      mockOnClose
    ).not.toHaveBeenCalled();

    expect(
      getDialog()
    ).toHaveAttribute("open");
  });

  // ==========================================
  // 16. BUSY STATE CHANGES
  // ==========================================

  test("enables close button when busy becomes false", async () => {
    const user = userEvent.setup();

    const { rerender } = renderModal({
      busy: true,
    });

    expect(
      getCloseButton()
    ).toBeDisabled();

    rerender(
      <Modal
        title="Test Modal"
        onClose={mockOnClose}
        busy={false}
      >
        <p>Modal content</p>
      </Modal>
    );

    expect(
      getCloseButton()
    ).toBeEnabled();

    await user.click(getCloseButton());

    expect(
      mockOnClose
    ).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 17. UPDATE MODAL TITLE
  // ==========================================

  test("updates the title when props change", () => {
    const { rerender } = renderModal();

    rerender(
      <Modal
        title="Edit Medicine"
        onClose={mockOnClose}
      >
        <p>Modal content</p>
      </Modal>
    );

    expect(
      screen.getByRole("dialog", {
        name: "Edit Medicine",
      })
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("heading", {
        name: "Test Modal",
      })
    ).not.toBeInTheDocument();
  });

  // ==========================================
  // 18. DO NOT REOPEN ON RERENDER
  // ==========================================

  test("does not call showModal again on ordinary rerender", () => {
    const { rerender } = renderModal();

    expect(
      mockShowModal
    ).toHaveBeenCalledTimes(1);

    rerender(
      <Modal
        title="Updated Title"
        onClose={mockOnClose}
      >
        <p>Updated content</p>
      </Modal>
    );

    expect(
      mockShowModal
    ).toHaveBeenCalledTimes(1);

    expect(
      screen.getByText("Updated content")
    ).toBeInTheDocument();
  });

  // ==========================================
  // 19. CLOSE DIALOG ON UNMOUNT
  // ==========================================

  test("calls dialog.close when modal unmounts", () => {
    const { unmount } = renderModal();

    expect(
      mockClose
    ).not.toHaveBeenCalled();

    unmount();

    expect(
      mockClose
    ).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 20. RESTORE SCROLL STATE
  // ==========================================

  test("restores previous body overflow on unmount", () => {
    document.body.style.overflow = "scroll";

    const { unmount } = renderModal();

    expect(
      document.body.style.overflow
    ).toBe("hidden");

    unmount();

    expect(
      document.body.style.overflow
    ).toBe("scroll");
  });

  // ==========================================
  // 21. UNMOUNT WHILE BUSY
  // ==========================================

  test("cleans up dialog even when busy", () => {
    const { unmount } = renderModal({
      busy: true,
    });

    expect(
      document.body.style.overflow
    ).toBe("hidden");

    unmount();

    expect(
      mockClose
    ).toHaveBeenCalledTimes(1);

    expect(
      document.body.style.overflow
    ).toBe("auto");
  });

  // ==========================================
  // 22. UNMOUNT DOES NOT TRIGGER CALLBACK
  // ==========================================

  test("does not call onClose merely because modal unmounts", () => {
    const { unmount } = renderModal();

    unmount();

    expect(
      mockOnClose
    ).not.toHaveBeenCalled();
  });
});
