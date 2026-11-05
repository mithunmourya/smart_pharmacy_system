
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
  within,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import {
  MemoryRouter,
  useLocation,
  useNavigate,
} from "react-router";

import Sidebar from "./Sidebar";
import useAuth from "../hooks/useAuth";

// ============================================
// MOCK AUTHENTICATION
// ============================================

vi.mock("../hooks/useAuth", () => ({
  default: vi.fn(),
}));

const mockOnNavigate = vi.fn();

// ============================================
// TEST USER
// ============================================

function setRole(role) {
  useAuth.mockReturnValue({
    user:
      role === null
        ? null
        : {
            id: 1,
            name: "Test User",
            email: "test@example.com",
            role,
          },
  });
}

// ============================================
// ROUTER TEST HELPERS
// ============================================

function LocationDisplay() {
  const location = useLocation();

  return (
    <output data-testid="current-path">
      {location.pathname}
    </output>
  );
}

function RouteChanger({ to }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(to)}
    >
      Change test route
    </button>
  );
}

function renderSidebar({
  role = "Admin",
  path = "/dashboard",
  onNavigate = mockOnNavigate,
  jumpTo,
} = {}) {
  setRole(role);

  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar onNavigate={onNavigate} />

      <LocationDisplay />

      {jumpTo && <RouteChanger to={jumpTo} />}
    </MemoryRouter>
  );
}

function mainNavigation() {
  return screen.getByRole("navigation", {
    name: "Main navigation",
  });
}

function accountNavigation() {
  return screen.getByRole("navigation", {
    name: "Account navigation",
  });
}

function inventoryButton() {
  return screen.getByRole("button", {
    name: "Inventory",
  });
}

function inventoryPanel() {
  const id = inventoryButton().getAttribute(
    "aria-controls"
  );

  return document.getElementById(id);
}

function expectPath(path) {
  expect(
    screen.getByTestId("current-path")
  ).toHaveTextContent(path);
}

async function expandInventory() {
  const user = userEvent.setup();

  if (
    inventoryButton().getAttribute("aria-expanded") ===
    "false"
  ) {
    await user.click(inventoryButton());
  }

  return user;
}

// ============================================
// SIDEBAR TESTS
// ============================================

describe("Sidebar", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ==========================================
  // 1. BRANDING
  // ==========================================

  test("renders Smart Pharmacy branding", () => {
    renderSidebar();

    expect(
      screen.getByText("Smart Pharmacy")
    ).toBeInTheDocument();
  });

  // ==========================================
  // 2-4. WORKSPACE ROLES
  // ==========================================

  test.each([
    "Admin",
    "Pharmacist",
    "Customer",
  ])(
    "displays %s workspace label",
    (role) => {
      renderSidebar({ role });

      expect(
        screen.getByText(`${role} workspace`)
      ).toBeInTheDocument();
    }
  );

  // ==========================================
  // 5. DECORATIVE LOGO
  // ==========================================

  test("hides decorative pharmacy mark from assistive technology", () => {
    renderSidebar();

    expect(
      screen.getByText("+")
    ).toHaveAttribute(
      "aria-hidden",
      "true"
    );
  });

  // ==========================================
  // 6. NAVIGATION LANDMARKS
  // ==========================================

  test("renders main and account navigation landmarks", () => {
    renderSidebar();

    expect(
      mainNavigation()
    ).toBeInTheDocument();

    expect(
      accountNavigation()
    ).toBeInTheDocument();
  });

  // ==========================================
  // 7. VERSION
  // ==========================================

  test("renders application version", () => {
    renderSidebar();

    expect(
      screen.getByText("Version 1.0")
    ).toBeInTheDocument();
  });

  // ==========================================
  // 8-10. DASHBOARD LINK FOR ALL ROLES
  // ==========================================

  test.each([
    "Admin",
    "Pharmacist",
    "Customer",
  ])(
    "provides Dashboard link for %s",
    (role) => {
      renderSidebar({ role });

      expect(
        within(mainNavigation()).getByRole(
          "link",
          { name: "Dashboard" }
        )
      ).toHaveAttribute(
        "href",
        "/dashboard"
      );
    }
  );

  // ==========================================
  // 11-13. PROFILE LINK FOR ALL ROLES
  // ==========================================

  test.each([
    "Admin",
    "Pharmacist",
    "Customer",
  ])(
    "provides My Profile link for %s",
    (role) => {
      renderSidebar({ role });

      expect(
        within(accountNavigation()).getByRole(
          "link",
          { name: "My Profile" }
        )
      ).toHaveAttribute(
        "href",
        "/profile"
      );
    }
  );

  // ==========================================
  // 14. ADMIN DIRECT LINKS
  // ==========================================

  test("shows Users and Sales History for Admin", () => {
    renderSidebar({ role: "Admin" });

    expect(
      screen.getByRole("link", {
        name: "Users",
      })
    ).toHaveAttribute("href", "/users");

    expect(
      screen.getByRole("link", {
        name: "Sales History",
      })
    ).toHaveAttribute("href", "/sales");
  });

  // ==========================================
  // 15. INVENTORY INITIALLY COLLAPSED
  // ==========================================

  test("starts with Admin inventory menu collapsed outside inventory routes", () => {
    renderSidebar({
      role: "Admin",
      path: "/dashboard",
    });

    expect(
      inventoryButton()
    ).toHaveAttribute(
      "aria-expanded",
      "false"
    );

    expect(
      inventoryPanel()
    ).toHaveAttribute("hidden");

    expect(
      screen.queryByRole("link", {
        name: "Manufacturers",
      })
    ).not.toBeInTheDocument();
  });

  // ==========================================
  // 16. ACCESSIBLE ACCORDION CONTROLS
  // ==========================================

  test("connects inventory button to its panel", () => {
    renderSidebar();

    const button = inventoryButton();
    const panel = inventoryPanel();

    expect(button).toHaveAttribute(
      "type",
      "button"
    );

    expect(
      button.getAttribute("aria-controls")
    ).toBe(panel.id);

    expect(panel.id).toBeTruthy();
  });

  // ==========================================
  // 17. EXPAND INVENTORY
  // ==========================================

  test("expands Admin inventory menu when clicked", async () => {
    renderSidebar();

    await expandInventory();

    expect(
      inventoryButton()
    ).toHaveAttribute(
      "aria-expanded",
      "true"
    );

    expect(
      inventoryPanel()
    ).not.toHaveAttribute("hidden");

    expect(
      screen.getByRole("link", {
        name: "Manufacturers",
      })
    ).toBeInTheDocument();
  });

  // ==========================================
  // 18. COLLAPSE INVENTORY
  // ==========================================

  test("collapses inventory menu when clicked again", async () => {
    const user = userEvent.setup();

    renderSidebar();

    await user.click(inventoryButton());

    expect(
      inventoryButton()
    ).toHaveAttribute(
      "aria-expanded",
      "true"
    );

    await user.click(inventoryButton());

    expect(
      inventoryButton()
    ).toHaveAttribute(
      "aria-expanded",
      "false"
    );

    expect(
      inventoryPanel()
    ).toHaveAttribute("hidden");
  });

  // ==========================================
  // 19. INVENTORY LINK DESTINATIONS
  // ==========================================

  test("renders all five Admin inventory links", async () => {
    renderSidebar();

    await expandInventory();

    const expectedLinks = [
      ["Manufacturers", "/manufacturers"],
      ["Medicines", "/medicines"],
      ["Batches", "/batches"],
      ["Available Inventory", "/inventory"],
      ["Low Stock", "/low-stock"],
    ];

    for (const [label, href] of expectedLinks) {
      expect(
        within(inventoryPanel()).getByRole(
          "link",
          { name: label }
        )
      ).toHaveAttribute("href", href);
    }
  });

  // ==========================================
  // 20. ADMIN DOES NOT SEE OTHER ROLES' LINKS
  // ==========================================

  test("does not show Pharmacist or Customer exclusive links to Admin", () => {
    renderSidebar({ role: "Admin" });

    expect(
      screen.queryByRole("link", {
        name: "New Sale",
      })
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("link", {
        name: "My Purchases",
      })
    ).not.toBeInTheDocument();
  });

  // ==========================================
  // 21. PHARMACIST LINKS
  // ==========================================

  test("renders Pharmacist navigation links", () => {
    renderSidebar({
      role: "Pharmacist",
    });

    const expectedLinks = [
      ["New Sale", "/sales/new"],
      ["Available Inventory", "/inventory"],
      ["Low Stock", "/low-stock"],
    ];

    for (const [label, href] of expectedLinks) {
      expect(
        screen.getByRole("link", {
          name: label,
        })
      ).toHaveAttribute("href", href);
    }
  });

  // ==========================================
  // 22. PHARMACIST DOES NOT HAVE ACCORDION
  // ==========================================

  test("does not render Admin inventory accordion for Pharmacist", () => {
    renderSidebar({
      role: "Pharmacist",
    });

    expect(
      screen.queryByRole("button", {
        name: "Inventory",
      })
    ).not.toBeInTheDocument();
  });

  // ==========================================
  // 23. PHARMACIST ADMIN LINKS HIDDEN
  // ==========================================

  test("does not show Admin navigation links to Pharmacist", () => {
    renderSidebar({
      role: "Pharmacist",
    });

    for (const label of [
      "Users",
      "Sales History",
      "Manufacturers",
      "Medicines",
      "Batches",
    ]) {
      expect(
        screen.queryByRole("link", {
          name: label,
        })
      ).not.toBeInTheDocument();
    }
  });

  // ==========================================
  // 24. PHARMACIST CUSTOMER LINK HIDDEN
  // ==========================================

  test("does not show My Purchases to Pharmacist", () => {
    renderSidebar({
      role: "Pharmacist",
    });

    expect(
      screen.queryByRole("link", {
        name: "My Purchases",
      })
    ).not.toBeInTheDocument();
  });

  // ==========================================
  // 25. CUSTOMER PURCHASES
  // ==========================================

  test("shows My Purchases to Customer", () => {
    renderSidebar({
      role: "Customer",
    });

    expect(
      screen.getByRole("link", {
        name: "My Purchases",
      })
    ).toHaveAttribute(
      "href",
      "/my-purchases"
    );
  });

  // ==========================================
  // 26. CUSTOMER RESTRICTED LINKS
  // ==========================================

  test("does not render staff navigation for Customer", () => {
    renderSidebar({
      role: "Customer",
    });

    for (const label of [
      "Users",
      "Sales History",
      "New Sale",
      "Available Inventory",
      "Low Stock",
    ]) {
      expect(
        screen.queryByRole("link", {
          name: label,
        })
      ).not.toBeInTheDocument();
    }

    expect(
      screen.queryByRole("button", {
        name: "Inventory",
      })
    ).not.toBeInTheDocument();
  });

  // ==========================================
  // 27. UNKNOWN ROLE
  // ==========================================

  test("shows only common navigation for unknown roles", () => {
    renderSidebar({
      role: "Manager",
    });

    const mainLinks = within(
      mainNavigation()
    ).getAllByRole("link");

    expect(mainLinks).toHaveLength(1);
    expect(mainLinks[0]).toHaveTextContent(
      "Dashboard"
    );

    expect(
      within(accountNavigation()).getByRole(
        "link",
        { name: "My Profile" }
      )
    ).toBeInTheDocument();
  });

  // ==========================================
  // 28. NULL USER
  // ==========================================

  test("does not crash when user is null", () => {
    renderSidebar({ role: null });

    expect(
      screen.getByRole("link", {
        name: "Dashboard",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: "My Profile",
      })
    ).toBeInTheDocument();
  });

  // ==========================================
  // 29. DASHBOARD ACTIVE LINK
  // ==========================================

  test("marks Dashboard active on dashboard route", () => {
    renderSidebar({
      path: "/dashboard",
    });

    const link = screen.getByRole("link", {
      name: "Dashboard",
    });

    expect(link).toHaveAttribute(
      "aria-current",
      "page"
    );

    expect(link).toHaveClass("bg-primary");
    expect(link).toHaveClass("text-white");
  });

  // ==========================================
  // 30. DASHBOARD EXACT MATCH
  // ==========================================

  test("does not mark Dashboard active on nested paths", () => {
    renderSidebar({
      path: "/dashboard/example",
    });

    expect(
      screen.getByRole("link", {
        name: "Dashboard",
      })
    ).not.toHaveAttribute(
      "aria-current"
    );
  });

  // ==========================================
  // 31. PROFILE ACTIVE LINK
  // ==========================================

  test("marks My Profile active on profile route", () => {
    renderSidebar({
      role: "Customer",
      path: "/profile",
    });

    const link = screen.getByRole("link", {
      name: "My Profile",
    });

    expect(link).toHaveAttribute(
      "aria-current",
      "page"
    );

    expect(link).toHaveClass("bg-primary");
  });

  // ==========================================
  // 32. SALES HISTORY ACTIVE LINK
  // ==========================================

  test("marks Sales History active on sales route", () => {
    renderSidebar({
      role: "Admin",
      path: "/sales",
    });

    expect(
      screen.getByRole("link", {
        name: "Sales History",
      })
    ).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  // ==========================================
  // 33-37. AUTO-EXPAND INVENTORY ROUTES
  // ==========================================

  test.each([
    ["/manufacturers", "Manufacturers"],
    ["/medicines", "Medicines"],
    ["/batches", "Batches"],
    ["/inventory", "Available Inventory"],
    ["/low-stock", "Low Stock"],
  ])(
    "automatically expands inventory on %s",
    (path, activeLabel) => {
      renderSidebar({
        role: "Admin",
        path,
      });

      expect(
        inventoryButton()
      ).toHaveAttribute(
        "aria-expanded",
        "true"
      );

      expect(
        inventoryPanel()
      ).not.toHaveAttribute("hidden");

      expect(
        screen.getByRole("link", {
          name: activeLabel,
        })
      ).toHaveAttribute(
        "aria-current",
        "page"
      );
    }
  );

  // ==========================================
  // 38. NESTED INVENTORY ROUTE
  // ==========================================

  test("expands inventory for nested medicine routes", () => {
    renderSidebar({
      role: "Admin",
      path: "/medicines/42",
    });

    expect(
      inventoryButton()
    ).toHaveAttribute(
      "aria-expanded",
      "true"
    );

    expect(
      screen.getByRole("link", {
        name: "Medicines",
      })
    ).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  // ==========================================
  // 39. SIMILAR PATH IS NOT INVENTORY PATH
  // ==========================================

  test("does not expand inventory for similarly named unrelated routes", () => {
    renderSidebar({
      role: "Admin",
      path: "/medicines-other",
    });

    expect(
      inventoryButton()
    ).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  // ==========================================
  // 40. ROUTE CHANGE AUTO-EXPANDS INVENTORY
  // ==========================================

  test("opens inventory when the pathname changes to an inventory route", async () => {
    const user = userEvent.setup();

    renderSidebar({
      role: "Admin",
      path: "/dashboard",
      jumpTo: "/batches",
    });

    expect(
      inventoryButton()
    ).toHaveAttribute(
      "aria-expanded",
      "false"
    );

    await user.click(
      screen.getByRole("button", {
        name: "Change test route",
      })
    );

    expectPath("/batches");

    expect(
      inventoryButton()
    ).toHaveAttribute(
      "aria-expanded",
      "true"
    );

    expect(
      screen.getByRole("link", {
        name: "Batches",
      })
    ).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  // ==========================================
  // 41. MANUAL COLLAPSE ON ACTIVE INVENTORY
  // ==========================================

  test("allows manually collapsing an active inventory section", async () => {
    const user = userEvent.setup();

    renderSidebar({
      role: "Admin",
      path: "/inventory",
    });

    expect(
      inventoryButton()
    ).toHaveAttribute(
      "aria-expanded",
      "true"
    );

    await user.click(inventoryButton());

    expect(
      inventoryButton()
    ).toHaveAttribute(
      "aria-expanded",
      "false"
    );

    expect(
      inventoryPanel()
    ).toHaveAttribute("hidden");
  });

  // ==========================================
  // 42-45. ADMIN NAVIGATION CALLBACKS
  // ==========================================

  test.each([
    ["Dashboard", "/dashboard"],
    ["Users", "/users"],
    ["Sales History", "/sales"],
    ["My Profile", "/profile"],
  ])(
    "calls onNavigate for Admin link %s",
    async (label, expectedPath) => {
      const user = userEvent.setup();

      renderSidebar({
        role: "Admin",
      });

      await user.click(
        screen.getByRole("link", {
          name: label,
        })
      );

      expect(
        mockOnNavigate
      ).toHaveBeenCalledTimes(1);

      expectPath(expectedPath);
    }
  );

  // ==========================================
  // 46-50. INVENTORY LINK CALLBACKS
  // ==========================================

  test.each([
    ["Manufacturers", "/manufacturers"],
    ["Medicines", "/medicines"],
    ["Batches", "/batches"],
    ["Available Inventory", "/inventory"],
    ["Low Stock", "/low-stock"],
  ])(
    "navigates from inventory submenu to %s",
    async (label, expectedPath) => {
      renderSidebar({
        role: "Admin",
      });

      const user = await expandInventory();

      await user.click(
        screen.getByRole("link", {
          name: label,
        })
      );

      expectPath(expectedPath);

      expect(
        mockOnNavigate
      ).toHaveBeenCalledTimes(1);
    }
  );

  // ==========================================
  // 51-54. PHARMACIST NAVIGATION
  // ==========================================

  test.each([
    ["Dashboard", "/dashboard"],
    ["New Sale", "/sales/new"],
    ["Available Inventory", "/inventory"],
    ["Low Stock", "/low-stock"],
  ])(
    "navigates Pharmacist to %s",
    async (label, expectedPath) => {
      const user = userEvent.setup();

      renderSidebar({
        role: "Pharmacist",
      });

      await user.click(
        screen.getByRole("link", {
          name: label,
        })
      );

      expectPath(expectedPath);

      expect(
        mockOnNavigate
      ).toHaveBeenCalledTimes(1);
    }
  );

  // ==========================================
  // 55-57. CUSTOMER NAVIGATION
  // ==========================================

  test.each([
    ["Dashboard", "/dashboard"],
    ["My Purchases", "/my-purchases"],
    ["My Profile", "/profile"],
  ])(
    "navigates Customer to %s",
    async (label, expectedPath) => {
      const user = userEvent.setup();

      renderSidebar({
        role: "Customer",
      });

      await user.click(
        screen.getByRole("link", {
          name: label,
        })
      );

      expectPath(expectedPath);

      expect(
        mockOnNavigate
      ).toHaveBeenCalledTimes(1);
    }
  );

  // ==========================================
  // 58. INVENTORY BUTTON DOES NOT NAVIGATE
  // ==========================================

  test("expanding inventory does not trigger onNavigate", async () => {
    const user = userEvent.setup();

    renderSidebar({
      role: "Admin",
    });

    await user.click(inventoryButton());

    expect(
      mockOnNavigate
    ).not.toHaveBeenCalled();

    expectPath("/dashboard");
  });

  // ==========================================
  // 59. OPTIONAL NAVIGATION CALLBACK
  // ==========================================

  test("works without an onNavigate callback", async () => {
    const user = userEvent.setup();

    renderSidebar({
      role: "Customer",
      onNavigate: undefined,
    });

    await user.click(
      screen.getByRole("link", {
        name: "My Purchases",
      })
    );

    expectPath("/my-purchases");
  });

  // ==========================================
  // 60. ACCOUNT NAVIGATION CALLBACK
  // ==========================================

  test("invokes callback when My Profile is selected", async () => {
    const user = userEvent.setup();

    renderSidebar({
      role: "Pharmacist",
      path: "/dashboard",
    });

    await user.click(
      within(accountNavigation()).getByRole(
        "link",
        { name: "My Profile" }
      )
    );

    expectPath("/profile");

    expect(
      mockOnNavigate
    ).toHaveBeenCalledTimes(1);
  });
});
