
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
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

import Navbar from "./Navbar";
import useAuth from "../hooks/useAuth";

// ============================================
// MOCK DEPENDENCIES
// ============================================

vi.mock("../hooks/useAuth", () => ({
  default: vi.fn(),
}));

// ============================================
// TEST DATA
// ============================================

const mockUser = {
  user_id: 1,
  name: "Ravi Kumar",
  email: "ravi@example.com",
  role: "Pharmacist",
};

const mockLogout = vi.fn();
const mockOpenMenu = vi.fn();

// ============================================
// HELPER FUNCTIONS
// ============================================

function setUser(user) {
  useAuth.mockReturnValue({
    user,
    logout: mockLogout,
  });
}

function renderNavbar(props = {}) {
  return render(
    <MemoryRouter>
      <Navbar
        onOpenMenu={mockOpenMenu}
        menuOpen={false}
        menuId="mobile-navigation"
        {...props}
      />
    </MemoryRouter>
  );
}

function menuButton() {
  return screen.getByRole("button", {
    name: "Open navigation menu",
  });
}

function profileLink(name = "Ravi Kumar") {
  return screen.getByRole("link", {
    name: `Open my profile: ${name}`,
  });
}

function signOutButton() {
  return screen.getByRole("button", {
    name: "Sign Out",
  });
}

// ============================================
// NAVBAR TESTS
// ============================================

describe("Navbar", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setUser(mockUser);
  });

  // ==========================================
  // 1. NAVBAR RENDER
  // ==========================================

  test("renders navbar as a banner", () => {
    renderNavbar();

    expect(
      screen.getByRole("banner")
    ).toBeInTheDocument();
  });

  // ==========================================
  // 2. APPLICATION BRANDING
  // ==========================================

  test("displays Smart Pharmacy branding", () => {
    renderNavbar();

    expect(
      screen.getByText("Smart Pharmacy")
    ).toBeInTheDocument();
  });

  // ==========================================
  // 3. USER ROLE
  // ==========================================

  test("displays the authenticated user's workspace", () => {
    renderNavbar();

    expect(
      screen.getByText("Pharmacist workspace")
    ).toBeInTheDocument();
  });

  // ==========================================
  // 4-6. DIFFERENT USER ROLES
  // ==========================================

  test.each([
    "Admin",
    "Pharmacist",
    "Customer",
  ])(
    "displays correct workspace for %s",
    (role) => {
      setUser({
        ...mockUser,
        role,
      });

      renderNavbar();

      expect(
        screen.getByText(`${role} workspace`)
      ).toBeInTheDocument();
    }
  );

  // ==========================================
  // 7. USER NAME
  // ==========================================

  test("displays authenticated user's name", () => {
    renderNavbar();

    expect(
      screen.getByText("Ravi Kumar")
    ).toBeInTheDocument();
  });

  // ==========================================
  // 8. PROFILE LINK
  // ==========================================

  test("links to the profile page", () => {
    renderNavbar();

    expect(
      profileLink()
    ).toHaveAttribute("href", "/profile");
  });

  // ==========================================
  // 9. ACCESSIBLE PROFILE LINK
  // ==========================================

  test("includes user name in profile link accessible name", () => {
    renderNavbar();

    expect(
      profileLink()
    ).toBeInTheDocument();

    expect(
      profileLink()
    ).toHaveAttribute(
      "aria-label",
      "Open my profile: Ravi Kumar"
    );
  });

  // ==========================================
  // 10. PROFILE LABEL
  // ==========================================

  test("displays My Profile next to user name", () => {
    renderNavbar();

    expect(
      screen.getByText("My Profile")
    ).toBeInTheDocument();
  });

  // ==========================================
  // 11. USER INITIALS
  // ==========================================

  test("generates initials from first two names", () => {
    renderNavbar();

    expect(
      screen.getByText("RK")
    ).toBeInTheDocument();
  });

  // ==========================================
  // 12. THREE-PART NAME
  // ==========================================

  test("uses only first two words for initials", () => {
    setUser({
      ...mockUser,
      name: "Priya Sharma Reddy",
    });

    renderNavbar();

    expect(
      screen.getByText("PS")
    ).toBeInTheDocument();

    expect(
      screen.queryByText("PSR")
    ).not.toBeInTheDocument();
  });

  // ==========================================
  // 13. EXTRA WHITESPACE
  // ==========================================

  test("handles extra spaces in user name", () => {
    setUser({
      ...mockUser,
      name: "  Priya   Sharma  ",
    });

    renderNavbar();

    expect(
      screen.getByText("PS")
    ).toBeInTheDocument();
  });

  // ==========================================
  // 14. SINGLE NAME
  // ==========================================

  test("generates one initial for single-word name", () => {
    setUser({
      ...mockUser,
      name: "Anita",
    });

    renderNavbar();

    expect(
      screen.getByText("A")
    ).toBeInTheDocument();
  });

  // ==========================================
  // 15. LOWERCASE NAME
  // ==========================================

  test("converts initials to uppercase", () => {
    setUser({
      ...mockUser,
      name: "rahul singh",
    });

    renderNavbar();

    expect(
      screen.getByText("RS")
    ).toBeInTheDocument();
  });

  // ==========================================
  // 16. BLANK NAME
  // ==========================================

  test("uses U when user name is blank", () => {
    setUser({
      ...mockUser,
      name: "   ",
    });

    renderNavbar();

    expect(
      screen.getByText("U")
    ).toBeInTheDocument();
  });

  // ==========================================
  // 17. UNDEFINED NAME
  // ==========================================

  test("uses fallback initial when name is undefined", () => {
    setUser({
      ...mockUser,
      name: undefined,
    });

    renderNavbar();

    expect(
      screen.getByText("U")
    ).toBeInTheDocument();
  });

  // ==========================================
  // 18. INITIALS ACCESSIBILITY
  // ==========================================

  test("marks decorative initials as hidden from accessibility tree", () => {
    renderNavbar();

    expect(
      screen.getByText("RK")
    ).toHaveAttribute(
      "aria-hidden",
      "true"
    );
  });

  // ==========================================
  // 19. SIGN OUT BUTTON
  // ==========================================

  test("renders Sign Out button", () => {
    renderNavbar();

    expect(
      signOutButton()
    ).toBeInTheDocument();

    expect(
      signOutButton()
    ).toBeEnabled();

    expect(
      signOutButton()
    ).toHaveAttribute(
      "type",
      "button"
    );
  });

  // ==========================================
  // 20. LOGOUT FUNCTION
  // ==========================================

  test("calls logout when Sign Out is clicked", async () => {
    const user = userEvent.setup();

    renderNavbar();

    await user.click(signOutButton());

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 21. MULTIPLE LOGOUT CLICKS
  // ==========================================

  test("calls logout for each Sign Out click", async () => {
    const user = userEvent.setup();

    renderNavbar();

    await user.click(signOutButton());
    await user.click(signOutButton());

    expect(mockLogout).toHaveBeenCalledTimes(2);
  });

  // ==========================================
  // 22-24. SIGN OUT FOR ALL ROLES
  // ==========================================

  test.each([
    "Admin",
    "Pharmacist",
    "Customer",
  ])(
    "allows %s to sign out",
    async (role) => {
      const user = userEvent.setup();

      setUser({
        ...mockUser,
        role,
      });

      renderNavbar();

      await user.click(signOutButton());

      expect(mockLogout).toHaveBeenCalledTimes(1);
    }
  );

  // ==========================================
  // 25. MENU BUTTON
  // ==========================================

  test("renders mobile navigation button", () => {
    renderNavbar();

    expect(
      menuButton()
    ).toBeInTheDocument();

    expect(
      menuButton()
    ).toHaveAttribute(
      "type",
      "button"
    );
  });

  // ==========================================
  // 26. OPEN MOBILE MENU
  // ==========================================

  test("calls onOpenMenu when menu button is clicked", async () => {
    const user = userEvent.setup();

    renderNavbar();

    await user.click(menuButton());

    expect(
      mockOpenMenu
    ).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 27. CLOSED MENU STATE
  // ==========================================

  test("sets aria-expanded false when menu is closed", () => {
    renderNavbar({
      menuOpen: false,
    });

    expect(
      menuButton()
    ).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  // ==========================================
  // 28. OPEN MENU STATE
  // ==========================================

  test("sets aria-expanded true when menu is open", () => {
    renderNavbar({
      menuOpen: true,
    });

    expect(
      menuButton()
    ).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  // ==========================================
  // 29. MENU ARIA CONTROLS
  // ==========================================

  test("connects menu button to navigation dialog", () => {
    renderNavbar({
      menuId: "test-mobile-drawer",
    });

    expect(
      menuButton()
    ).toHaveAttribute(
      "aria-controls",
      "test-mobile-drawer"
    );
  });

  // ==========================================
  // 30. MENU PROPS CHANGE
  // ==========================================

  test("updates menu accessibility state when props change", () => {
    const { rerender } = renderNavbar({
      menuOpen: false,
    });

    expect(
      menuButton()
    ).toHaveAttribute(
      "aria-expanded",
      "false"
    );

    rerender(
      <MemoryRouter>
        <Navbar
          onOpenMenu={mockOpenMenu}
          menuOpen={true}
          menuId="mobile-navigation"
        />
      </MemoryRouter>
    );

    expect(
      menuButton()
    ).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  // ==========================================
  // 31. MENU DOES NOT LOG OUT
  // ==========================================

  test("opening menu does not trigger logout", async () => {
    const user = userEvent.setup();

    renderNavbar();

    await user.click(menuButton());

    expect(
      mockOpenMenu
    ).toHaveBeenCalledTimes(1);

    expect(
      mockLogout
    ).not.toHaveBeenCalled();
  });

  // ==========================================
  // 32. PROFILE DOES NOT LOG OUT
  // ==========================================

  test("clicking profile link does not trigger logout", async () => {
    const user = userEvent.setup();

    renderNavbar();

    await user.click(profileLink());

    expect(
      mockLogout
    ).not.toHaveBeenCalled();

    expect(
      mockOpenMenu
    ).not.toHaveBeenCalled();
  });

  // ==========================================
  // 33. AUTHENTICATED USER CHANGES
  // ==========================================

  test("updates navbar when authenticated user changes", () => {
    const { rerender } = renderNavbar();

    expect(
      screen.getByText("Ravi Kumar")
    ).toBeInTheDocument();

    setUser({
      user_id: 10,
      name: "Anita Sharma",
      email: "anita@example.com",
      role: "Admin",
    });

    rerender(
      <MemoryRouter>
        <Navbar
          onOpenMenu={mockOpenMenu}
          menuOpen={false}
          menuId="mobile-navigation"
        />
      </MemoryRouter>
    );

    expect(
      screen.getByText("Anita Sharma")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Admin workspace")
    ).toBeInTheDocument();

    expect(
      screen.getByText("AS")
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Ravi Kumar")
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: "Open my profile: Anita Sharma",
      })
    ).toHaveAttribute("href", "/profile");
  });
});
