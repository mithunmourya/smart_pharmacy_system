
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
  within,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import {
  MemoryRouter,
  Routes,
  Route,
} from "react-router";

import DashboardLayout from "./DashboardLayout";

// ============================================
// MOCK NAVBAR AND SIDEBAR
// ============================================

// Test the real DashboardLayout behavior,
// without involving Navbar or Sidebar logic.

vi.mock("../components/Navbar", () => ({
  default: ({
    onOpenMenu,
    menuOpen,
    menuId,
  }) => (
    <header data-testid="navbar">
      <button
        type="button"
        aria-label="Open mobile navigation"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        onClick={onOpenMenu}
      >
        Menu
      </button>

      <span data-testid="menu-status">
        {menuOpen ? "Menu open" : "Menu closed"}
      </span>
    </header>
  ),
}));

vi.mock("../components/Sidebar", () => ({
  default: ({ onNavigate }) => (
    <nav
      aria-label={
        onNavigate
          ? "Mobile sidebar links"
          : "Desktop sidebar links"
      }
    >
      <button
        type="button"
        onClick={onNavigate}
      >
        Navigate to sample
      </button>
    </nav>
  ),
}));

// ============================================
// BROWSER API MOCKS
// ============================================

const dialogPrototype =
  HTMLDialogElement.prototype;

const originalShowModal =
  Object.getOwnPropertyDescriptor(
    dialogPrototype,
    "showModal"
  );

const originalClose =
  Object.getOwnPropertyDescriptor(
    dialogPrototype,
    "close"
  );

let mediaQuery;

function restoreDialogMethod(name, descriptor) {
  if (descriptor) {
    Object.defineProperty(
      dialogPrototype,
      name,
      descriptor
    );
  } else {
    delete dialogPrototype[name];
  }
}

function triggerResize(matches) {
  const listener =
    mediaQuery.addEventListener.mock.calls.find(
      ([eventName]) => eventName === "change"
    )?.[1];

  expect(listener).toBeTypeOf("function");

  act(() => {
    mediaQuery.matches = matches;
    listener({ matches });
  });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function renderLayout() {
  return render(
    <MemoryRouter
      initialEntries={["/example"]}
    >
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route
            path="/example"
            element={
              <h1 data-testid="nested-page">
                Example page content
              </h1>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function drawer() {
  return document.querySelector("dialog");
}

function menuButton() {
  return screen.getByRole("button", {
    name: "Open mobile navigation",
  });
}

function closeButton() {
  return within(drawer()).getByRole(
    "button",
    { name: "Close" }
  );
}

async function openDrawer() {
  const user = userEvent.setup();

  await user.click(menuButton());

  return user;
}

// ============================================
// DASHBOARD LAYOUT TESTS
// ============================================

describe("DashboardLayout", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    document.body.style.overflow = "auto";

    mediaQuery = {
      media: "(min-width: 1024px)",
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => mediaQuery)
    );

    Object.defineProperty(
      dialogPrototype,
      "showModal",
      {
        configurable: true,
        writable: true,
        value: vi.fn(function () {
          this.setAttribute("open", "");
        }),
      }
    );

    Object.defineProperty(
      dialogPrototype,
      "close",
      {
        configurable: true,
        writable: true,
        value: vi.fn(function () {
          this.removeAttribute("open");

          this.dispatchEvent(
            new Event("close")
          );
        }),
      }
    );
  });

  afterEach(() => {
    cleanup();

    vi.unstubAllGlobals();

    restoreDialogMethod(
      "showModal",
      originalShowModal
    );

    restoreDialogMethod(
      "close",
      originalClose
    );

    document.body.style.overflow = "";
  });

  // ==========================================
  // INITIAL RENDERING
  // ==========================================

  test("renders the nested page through Outlet", () => {
    renderLayout();

    expect(
      screen.getByTestId("nested-page")
    ).toBeInTheDocument();

    expect(
      screen.getByRole("main")
    ).toContainElement(
      screen.getByTestId("nested-page")
    );
  });

  test("renders the navbar", () => {
    renderLayout();

    expect(
      screen.getByTestId("navbar")
    ).toBeInTheDocument();

    expect(
      menuButton()
    ).toBeInTheDocument();

    expect(
      screen.getByTestId("menu-status")
    ).toHaveTextContent("Menu closed");
  });

  test("renders the desktop sidebar", () => {
    renderLayout();

    const sidebar = screen.getByRole(
      "complementary",
      { name: "Sidebar" }
    );

    expect(sidebar).toBeInTheDocument();

    expect(
      within(sidebar).getByRole(
        "navigation",
        { name: "Desktop sidebar links" }
      )
    ).toBeInTheDocument();
  });

  test("creates a mobile navigation dialog", () => {
    renderLayout();

    expect(drawer()).toBeInTheDocument();

    expect(drawer().open).toBe(false);

    expect(
      drawer().querySelector(
        'nav[aria-label="Mobile sidebar links"]'
      )
    ).toBeInTheDocument();
  });

  test("provides a skip-to-content link", () => {
    renderLayout();

    expect(
      screen.getByRole("link", {
        name: "Skip to content",
      })
    ).toHaveAttribute(
      "href",
      "#main-content"
    );

    const main = screen.getByRole("main");

    expect(main).toHaveAttribute(
      "id",
      "main-content"
    );

    expect(main).toHaveAttribute(
      "tabindex",
      "-1"
    );
  });

  test("connects navbar menu button to dialog ID", () => {
    renderLayout();

    expect(drawer().id).not.toBe("");

    expect(menuButton()).toHaveAttribute(
      "aria-controls",
      drawer().id
    );

    expect(menuButton()).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  test("labels the navigation dialog correctly", async () => {
    renderLayout();

    await openDrawer();

    const heading = within(drawer())
      .getByRole("heading", {
        name: "Navigation",
      });

    expect(drawer()).toHaveAttribute(
      "aria-labelledby",
      heading.id
    );
  });

  // ==========================================
  // OPEN MOBILE MENU
  // ==========================================

  test("opens mobile navigation when menu button is clicked", async () => {
    renderLayout();

    await openDrawer();

    expect(drawer().open).toBe(true);

    expect(
      dialogPrototype.showModal
    ).toHaveBeenCalledTimes(1);

    expect(menuButton()).toHaveAttribute(
      "aria-expanded",
      "true"
    );

    expect(
      screen.getByTestId("menu-status")
    ).toHaveTextContent("Menu open");
  });

  test("does not open the dialog twice", async () => {
    const user = userEvent.setup();

    renderLayout();

    await user.click(menuButton());

    await user.click(menuButton());

    expect(
      dialogPrototype.showModal
    ).toHaveBeenCalledTimes(1);

    expect(drawer().open).toBe(true);
  });

  // ==========================================
  // CLOSE MOBILE MENU
  // ==========================================

  test("closes mobile menu using the Close button", async () => {
    renderLayout();

    const user = await openDrawer();

    expect(drawer().open).toBe(true);

    await user.click(closeButton());

    expect(drawer().open).toBe(false);

    expect(
      dialogPrototype.close
    ).toHaveBeenCalled();

    expect(menuButton()).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  test("closes mobile menu when a sidebar item is selected", async () => {
    renderLayout();

    const user = await openDrawer();

    await user.click(
      within(drawer()).getByRole(
        "button",
        { name: "Navigate to sample" }
      )
    );

    expect(drawer().open).toBe(false);

    expect(menuButton()).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  test("closes menu when the dialog backdrop is clicked", async () => {
    renderLayout();

    await openDrawer();

    expect(drawer().open).toBe(true);

    // Clicking the dialog itself simulates
    // a backdrop click.
    fireEvent.click(drawer());

    expect(drawer().open).toBe(false);

    expect(menuButton()).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  test("does not close menu when clicking inside drawer content", async () => {
    renderLayout();

    await openDrawer();

    const heading = within(drawer())
      .getByRole("heading", {
        name: "Navigation",
      });

    fireEvent.click(heading);

    expect(drawer().open).toBe(true);

    expect(menuButton()).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  test("allows reopening the drawer after closing", async () => {
    renderLayout();

    const user = await openDrawer();

    await user.click(closeButton());

    expect(drawer().open).toBe(false);

    await user.click(menuButton());

    expect(drawer().open).toBe(true);

    expect(
      dialogPrototype.showModal
    ).toHaveBeenCalledTimes(2);
  });

  // ==========================================
  // BODY SCROLL LOCK
  // ==========================================

  test("locks body scrolling while mobile menu is open", async () => {
    renderLayout();

    await openDrawer();

    expect(
      document.body.style.overflow
    ).toBe("hidden");
  });

  test("restores previous body overflow when menu closes", async () => {
    renderLayout();

    const user = await openDrawer();

    expect(
      document.body.style.overflow
    ).toBe("hidden");

    await user.click(closeButton());

    expect(
      document.body.style.overflow
    ).toBe("auto");
  });

  // ==========================================
  // RESPONSIVE RESIZE
  // ==========================================

  test("registers desktop breakpoint listener", () => {
    renderLayout();

    expect(
      window.matchMedia
    ).toHaveBeenCalledWith(
      "(min-width: 1024px)"
    );

    expect(
      mediaQuery.addEventListener
    ).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );
  });

  test("closes mobile menu when viewport changes to desktop", async () => {
    renderLayout();

    await openDrawer();

    expect(drawer().open).toBe(true);

    triggerResize(true);

    expect(drawer().open).toBe(false);

    expect(menuButton()).toHaveAttribute(
      "aria-expanded",
      "false"
    );

    expect(
      document.body.style.overflow
    ).toBe("auto");
  });

  test("keeps menu open when resize event is still mobile", async () => {
    renderLayout();

    await openDrawer();

    triggerResize(false);

    expect(drawer().open).toBe(true);

    expect(menuButton()).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  // ==========================================
  // NATIVE DIALOG CLOSE EVENT
  // ==========================================

  test("updates state when dialog closes natively", async () => {
    renderLayout();

    await openDrawer();

    expect(drawer().open).toBe(true);

    // Simulate the browser closing the dialog,
    // for example after an Escape action.
    act(() => {
      drawer().removeAttribute("open");

      drawer().dispatchEvent(
        new Event("close")
      );
    });

    expect(drawer().open).toBe(false);

    expect(menuButton()).toHaveAttribute(
      "aria-expanded",
      "false"
    );

    expect(
      document.body.style.overflow
    ).toBe("auto");
  });

  // ==========================================
  // EFFECT CLEANUP
  // ==========================================

  test("removes resize listener when layout unmounts", () => {
    const { unmount } = renderLayout();

    const resizeListener =
      mediaQuery.addEventListener.mock.calls[0][1];

    unmount();

    expect(
      mediaQuery.removeEventListener
    ).toHaveBeenCalledWith(
      "change",
      resizeListener
    );
  });

  test("restores body scrolling when layout unmounts with menu open", async () => {
    const { unmount } = renderLayout();

    await openDrawer();

    expect(
      document.body.style.overflow
    ).toBe("hidden");

    unmount();

    expect(
      document.body.style.overflow
    ).toBe("auto");
  });
});
