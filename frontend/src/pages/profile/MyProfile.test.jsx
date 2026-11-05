
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

import { MemoryRouter } from "react-router";

import MyProfile from "./MyProfile";
import useAuth from "../../hooks/useAuth";

// =============================================
// MOCK DEPENDENCIES
// =============================================

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

// =============================================
// TEST USER
// =============================================

const mockUser = {
  user_id: 1,
  name: "Ravi Kumar",
  email: "ravi@example.com",
  role: "Customer",
};

// =============================================
// HELPER FUNCTIONS
// =============================================

function setUser(user) {
  useAuth.mockReturnValue({ user });
}

function renderProfile() {
  return render(
    <MemoryRouter>
      <MyProfile />
    </MemoryRouter>
  );
}

function profileDetails() {
  return screen
    .getByRole("heading", {
      name: mockUser.name,
    })
    .closest("section");
}

function passwordSection() {
  return screen
    .getByRole("heading", {
      name: "Password",
    })
    .closest("section");
}

// =============================================
// MY PROFILE TESTS
// =============================================

describe("MyProfile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setUser(mockUser);
  });

  // ===========================================
  // 1. PAGE HEADING
  // ===========================================

  test("renders My Profile heading", () => {
    renderProfile();

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "My Profile",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText("Account")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 2. PAGE DESCRIPTION
  // ===========================================

  test("displays profile page description", () => {
    renderProfile();

    expect(
      screen.getByText(
        "View your account information and manage your password."
      )
    ).toBeInTheDocument();
  });

  // ===========================================
  // 3. AUTHENTICATED USER NAME
  // ===========================================

  test("displays the logged-in user's name", () => {
    renderProfile();

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Ravi Kumar",
      })
    ).toBeInTheDocument();

    expect(
      screen.getAllByText("Ravi Kumar")
    ).toHaveLength(2);
  });

  // ===========================================
  // 4. FULL NAME FIELD
  // ===========================================

  test("displays the full name in profile details", () => {
    renderProfile();

    const details = profileDetails();

    expect(
      within(details).getByText("Full name")
    ).toBeInTheDocument();

    expect(
      within(details).getAllByText("Ravi Kumar")
    ).toHaveLength(2);
  });

  // ===========================================
  // 5. EMAIL FIELD
  // ===========================================

  test("displays the user's email address", () => {
    renderProfile();

    const details = profileDetails();

    expect(
      within(details).getByText("Email address")
    ).toBeInTheDocument();

    expect(
      within(details).getByText(
        "ravi@example.com"
      )
    ).toBeInTheDocument();
  });

  // ===========================================
  // 6. ACCOUNT ROLE
  // ===========================================

  test("displays the user's account role", () => {
    renderProfile();

    const details = profileDetails();

    expect(
      within(details).getByText("Account role")
    ).toBeInTheDocument();

    // Role appears in the badge and details.
    expect(
      within(details).getAllByText("Customer")
    ).toHaveLength(2);
  });

  // ===========================================
  // 7. INITIALS FROM TWO NAMES
  // ===========================================

  test("generates initials using first and last names", () => {
    renderProfile();

    expect(
      screen.getByText("RK")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 8. INITIALS FROM LONG NAMES
  // ===========================================

  test("uses only the first two words for initials", () => {
    setUser({
      ...mockUser,
      name: "Priya Sharma Reddy",
    });

    renderProfile();

    expect(
      screen.getByText("PS")
    ).toBeInTheDocument();

    expect(
      screen.queryByText("PSR")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 9. WHITESPACE IN NAME
  // ===========================================

  test("handles extra spaces while generating initials", () => {
    setUser({
      ...mockUser,
      name: "  Priya   Sharma  ",
    });

    renderProfile();

    expect(
      screen.getByText("PS")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 10. SINGLE-WORD NAME
  // ===========================================

  test("generates one initial for a single-word name", () => {
    setUser({
      ...mockUser,
      name: "Anita",
    });

    renderProfile();

    expect(
      screen.getByText("A")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 11. UPPERCASE INITIALS
  // ===========================================

  test("converts name initials to uppercase", () => {
    setUser({
      ...mockUser,
      name: "rahul singh",
    });

    renderProfile();

    expect(
      screen.getByText("RS")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 12. BLANK NAME FALLBACK
  // ===========================================

  test("uses U as the initial when name is blank", () => {
    setUser({
      ...mockUser,
      name: "   ",
    });

    renderProfile();

    expect(
      screen.getByText("U")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 13. ADMIN INFORMATION
  // ===========================================

  test("shows user-management instructions for Admin", () => {
    setUser({
      ...mockUser,
      role: "Admin",
    });

    renderProfile();

    expect(
      screen.getByText(
        "Name and email changes are managed through Users management."
      )
    ).toBeInTheDocument();

    expect(
      screen.queryByText(
        /please contact your administrator/
      )
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 14-15. NON-ADMIN INFORMATION
  // ===========================================

  test.each([
    "Pharmacist",
    "Customer",
  ])(
    "shows administrator contact instructions for %s",
    (role) => {
      setUser({
        ...mockUser,
        role,
      });

      renderProfile();

      expect(
        screen.getByText(
          /To update your name or email address, please contact your administrator/
        )
      ).toBeInTheDocument();

      expect(
        screen.queryByText(
          /managed through Users management/
        )
      ).not.toBeInTheDocument();
    }
  );

  // ===========================================
  // 16. PASSWORD SECTION
  // ===========================================

  test("renders the password management section", () => {
    renderProfile();

    const section = passwordSection();

    expect(
      within(section).getByRole("heading", {
        name: "Password",
      })
    ).toBeInTheDocument();

    expect(section).toHaveTextContent(
      "Use your current password to set a new one."
    );
  });

  // ===========================================
  // 17. CHANGE PASSWORD LINK
  // ===========================================

  test("links to the change-password page", () => {
    renderProfile();

    expect(
      screen.getByRole("link", {
        name: "Change Password",
      })
    ).toHaveAttribute(
      "href",
      "/settings/change-password"
    );
  });

  // ===========================================
  // 18. NO DIRECT PROFILE EDITING
  // ===========================================

  test("does not expose editable profile fields", () => {
    renderProfile();

    expect(
      screen.queryByRole("textbox")
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: /Save|Update profile/i,
      })
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 19. CHANGING AUTHENTICATED USER
  // ===========================================

  test("updates profile when authenticated user changes", () => {
    const { rerender } = renderProfile();

    expect(
      screen.getByRole("heading", {
        name: "Ravi Kumar",
      })
    ).toBeInTheDocument();

    setUser({
      user_id: 2,
      name: "Anita Sharma",
      email: "anita@example.com",
      role: "Pharmacist",
    });

    rerender(
      <MemoryRouter>
        <MyProfile />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", {
        name: "Anita Sharma",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText("anita@example.com")
    ).toBeInTheDocument();

    expect(
      screen.getByText("AS")
    ).toBeInTheDocument();

    expect(
      screen.queryByText("ravi@example.com")
    ).not.toBeInTheDocument();
  });
});
