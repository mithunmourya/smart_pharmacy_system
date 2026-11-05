
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

import {
  MemoryRouter,
  Routes,
  Route,
  useNavigate,
} from "react-router";

import Dashboard from "./Dashboard";
import useAuth from "../hooks/useAuth";

// =============================================
// MOCK DEPENDENCIES
// =============================================

vi.mock("../hooks/useAuth", () => ({
  default: vi.fn(),
}));

vi.mock("./dashboard/AdminDashboard", () => ({
  default: () => (
    <div data-testid="admin-dashboard">
      Admin Dashboard Content
    </div>
  ),
}));

vi.mock("./dashboard/PharmacistDashboard", () => ({
  default: () => (
    <div data-testid="pharmacist-dashboard">
      Pharmacist Dashboard Content
    </div>
  ),
}));

vi.mock("./dashboard/CustomerDashboard", () => ({
  default: () => (
    <div data-testid="customer-dashboard">
      Customer Dashboard Content
    </div>
  ),
}));

// =============================================
// TEST HELPERS
// =============================================

function mockUser(role) {
  useAuth.mockReturnValue({
    user: {
      user_id: 1,
      name: "Test User",
      email: "test@example.com",
      role,
    },
  });
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route
          path="/dashboard"
          element={<Dashboard />}
        />

        <Route
          path="/forbidden"
          element={<h1>Access forbidden</h1>}
        />
      </Routes>
    </MemoryRouter>
  );
}

// =============================================
// DASHBOARD TESTS
// =============================================

describe("Dashboard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================
  // 1. ADMIN DASHBOARD
  // ===========================================

  test("renders AdminDashboard for Admin user", () => {
    mockUser("Admin");

    renderDashboard();

    expect(
      screen.getByTestId("admin-dashboard")
    ).toBeInTheDocument();

    expect(
      screen.queryByTestId("pharmacist-dashboard")
    ).not.toBeInTheDocument();

    expect(
      screen.queryByTestId("customer-dashboard")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 2. PHARMACIST DASHBOARD
  // ===========================================

  test("renders PharmacistDashboard for Pharmacist user", () => {
    mockUser("Pharmacist");

    renderDashboard();

    expect(
      screen.getByTestId("pharmacist-dashboard")
    ).toBeInTheDocument();

    expect(
      screen.queryByTestId("admin-dashboard")
    ).not.toBeInTheDocument();

    expect(
      screen.queryByTestId("customer-dashboard")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 3. CUSTOMER DASHBOARD
  // ===========================================

  test("renders CustomerDashboard for Customer user", () => {
    mockUser("Customer");

    renderDashboard();

    expect(
      screen.getByTestId("customer-dashboard")
    ).toBeInTheDocument();

    expect(
      screen.queryByTestId("admin-dashboard")
    ).not.toBeInTheDocument();

    expect(
      screen.queryByTestId("pharmacist-dashboard")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 4. NO AUTHENTICATED USER
  // ===========================================

  test("renders nothing when user is null", () => {
    useAuth.mockReturnValue({
      user: null,
    });

    renderDashboard();

    expect(
      screen.queryByTestId("admin-dashboard")
    ).not.toBeInTheDocument();

    expect(
      screen.queryByTestId("pharmacist-dashboard")
    ).not.toBeInTheDocument();

    expect(
      screen.queryByTestId("customer-dashboard")
    ).not.toBeInTheDocument();

    expect(
      screen.queryByText("Access forbidden")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 5. UNKNOWN USER ROLE
  // ===========================================

  test("redirects unknown roles to forbidden page", () => {
    mockUser("Manager");

    renderDashboard();

    expect(
      screen.getByRole("heading", {
        name: "Access forbidden",
      })
    ).toBeInTheDocument();

    expect(
      screen.queryByTestId("admin-dashboard")
    ).not.toBeInTheDocument();

    expect(
      screen.queryByTestId("pharmacist-dashboard")
    ).not.toBeInTheDocument();

    expect(
      screen.queryByTestId("customer-dashboard")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 6. UNDEFINED ROLE
  // ===========================================

  test("redirects when user role is undefined", () => {
    mockUser(undefined);

    renderDashboard();

    expect(
      screen.getByText("Access forbidden")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 7. ROLE CASE SENSITIVITY
  // ===========================================

  test("does not allow lowercase admin role", () => {
    mockUser("admin");

    renderDashboard();

    expect(
      screen.getByText("Access forbidden")
    ).toBeInTheDocument();

    expect(
      screen.queryByTestId("admin-dashboard")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 8. ROLE CHANGES
  // ===========================================

  test("updates rendered dashboard when user role changes", () => {
    mockUser("Admin");

    const { rerender } = render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Dashboard />
      </MemoryRouter>
    );

    expect(
      screen.getByTestId("admin-dashboard")
    ).toBeInTheDocument();

    // Simulate user role changing.
    mockUser("Pharmacist");

    rerender(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Dashboard />
      </MemoryRouter>
    );

    expect(
      screen.getByTestId("pharmacist-dashboard")
    ).toBeInTheDocument();

    expect(
      screen.queryByTestId("admin-dashboard")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 9. EMPTY ROLE
  // ===========================================

  test("redirects when user role is empty", () => {
    mockUser("");

    renderDashboard();

    expect(
      screen.getByText("Access forbidden")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 10. REDIRECT USES REPLACE
  // ===========================================

  test("replaces browser history for forbidden redirect", async () => {
    const user = userEvent.setup();

    mockUser("UnauthorizedRole");

    function BackButton() {
      const navigate = useNavigate();

      return (
        <button
          type="button"
          onClick={() => navigate(-1)}
        >
          Go back
        </button>
      );
    }

    render(
      <MemoryRouter
        initialEntries={[
          "/previous",
          "/dashboard",
        ]}
        initialIndex={1}
      >
        <Routes>
          <Route
            path="/previous"
            element={
              <h1>Previous page</h1>
            }
          />

          <Route
            path="/dashboard"
            element={<Dashboard />}
          />

          <Route
            path="/forbidden"
            element={
              <h1>Access forbidden</h1>
            }
          />
        </Routes>

        <BackButton />
      </MemoryRouter>
    );

    expect(
      screen.getByText("Access forbidden")
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Go back",
      })
    );

    // replace=true means /dashboard was replaced.
    // Going back should reach /previous.
    expect(
      screen.getByText("Previous page")
    ).toBeInTheDocument();
  });
});
