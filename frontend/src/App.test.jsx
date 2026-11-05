
import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
} from "vitest";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  useLocation,
  useNavigationType,
} from "react-router";

import App from "./App";
import useAuth from "./hooks/useAuth";

// ============================================
// MOCK AUTHENTICATION (NOT ProtectedRoute)
// ============================================

vi.mock("./hooks/useAuth", () => ({
  default: vi.fn(),
}));

// Layout mocks keep routing through Outlet,
// without requiring the real navbar/sidebar.
vi.mock("./layouts/AuthLayout", () => ({
  default: ({ children }) => (
    <div data-testid="auth-layout">{children}</div>
  ),
}));

vi.mock("./layouts/DashboardLayout", async () => {
  const { Outlet } = await import("react-router");
  return {
    default: () => (
      <div data-testid="dashboard-layout">
        <Outlet />
      </div>
    ),
  };
});

// Page mocks make each route easy to identify.
// App.jsx and ProtectedRoute.jsx remain REAL.
vi.mock("./pages/auth/Login", () => ({
  default: () => <h1 data-testid="page-login">Login page</h1>,
}));
vi.mock("./pages/Dashboard", () => ({
  default: () => <h1 data-testid="page-dashboard">Dashboard page</h1>,
}));
vi.mock("./pages/profile/MyProfile", () => ({
  default: () => <h1 data-testid="page-profile">Profile page</h1>,
}));
vi.mock("./pages/settings/ChangePassword", () => ({
  default: () => (
    <h1 data-testid="page-change-password">Change password page</h1>
  ),
}));
vi.mock("./pages/users/Users", () => ({
  default: () => <h1 data-testid="page-users">Users page</h1>,
}));
vi.mock("./pages/manufacturers/Manufacturers", () => ({
  default: () => (
    <h1 data-testid="page-manufacturers">Manufacturers page</h1>
  ),
}));
vi.mock("./pages/medicines/Medicines", () => ({
  default: () => <h1 data-testid="page-medicines">Medicines page</h1>,
}));
vi.mock("./pages/batches/Batches", () => ({
  default: () => <h1 data-testid="page-batches">Batches page</h1>,
}));
vi.mock("./pages/sales/SalesHistory", () => ({
  default: () => (
    <h1 data-testid="page-sales-history">Sales history page</h1>
  ),
}));
vi.mock("./pages/sales/NewSale", () => ({
  default: () => <h1 data-testid="page-new-sale">New sale page</h1>,
}));
vi.mock("./pages/purchases/MyPurchases", () => ({
  default: () => (
    <h1 data-testid="page-my-purchases">My purchases page</h1>
  ),
}));
vi.mock("./pages/inventory/StockOverview", () => ({
  default: ({ mode }) => (
    <h1 data-testid={`page-stock-${mode}`}>Stock mode: {mode}</h1>
  ),
}));

// ============================================
// ROUTE MATRIX FROM YOUR REAL App.jsx
// ============================================

const roles = ["Admin", "Pharmacist", "Customer"];

const routeMatrix = [
  { path: "/dashboard", page: "page-dashboard", roles },
  { path: "/profile", page: "page-profile", roles },
  {
    path: "/settings/change-password",
    page: "page-change-password",
    roles,
  },
  { path: "/users", page: "page-users", roles: ["Admin"] },
  {
    path: "/manufacturers",
    page: "page-manufacturers",
    roles: ["Admin"],
  },
  { path: "/medicines", page: "page-medicines", roles: ["Admin"] },
  { path: "/batches", page: "page-batches", roles: ["Admin"] },
  {
    path: "/sales",
    page: "page-sales-history",
    roles: ["Admin"],
  },
  {
    path: "/inventory",
    page: "page-stock-inventory",
    roles: ["Admin", "Pharmacist"],
  },
  {
    path: "/low-stock",
    page: "page-stock-low-stock",
    roles: ["Admin", "Pharmacist"],
  },
  {
    path: "/sales/new",
    page: "page-new-sale",
    roles: ["Pharmacist"],
  },
  {
    path: "/my-purchases",
    page: "page-my-purchases",
    roles: ["Customer"],
  },
];

const allowedCases = routeMatrix.flatMap((route) =>
  route.roles.map((role) => [role, route.path, route.page])
);

const deniedCases = routeMatrix.flatMap((route) =>
  roles
    .filter((role) => !route.roles.includes(role))
    .map((role) => [role, route.path, route.page])
);

// ============================================
// TEST HELPERS
// ============================================

function mockAuth(role = null) {
  useAuth.mockReturnValue({
    isAuthenticated: role !== null,
    user:
      role === null
        ? null
        : {
            user_id: 1,
            name: "Test User",
            email: "test@example.com",
            role,
          },
  });
}

function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();

  return (
    <div aria-hidden="true">
      <span data-testid="current-path">{location.pathname}</span>
      <span data-testid="navigation-type">{navigationType}</span>
    </div>
  );
}

function renderAt(path, role = null) {
  mockAuth(role);

  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <App />
    </MemoryRouter>
  );
}

function expectPath(path) {
  expect(screen.getByTestId("current-path")).toHaveTextContent(path);
}

// ============================================
// APP ROUTING TESTS
// ============================================

describe("App routing and authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth();
  });

  // ------------------------------------------
  // PUBLIC LOGIN AND DEFAULT ROUTES
  // ------------------------------------------

  test("shows login in AuthLayout for unauthenticated users", () => {
    renderAt("/login");

    expect(screen.getByTestId("page-login")).toBeInTheDocument();
    expect(screen.getByTestId("auth-layout")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-layout")).not.toBeInTheDocument();
    expectPath("/login");
  });

  test("redirects authenticated users away from login", async () => {
    renderAt("/login", "Admin");

    expect(await screen.findByTestId("page-dashboard")).toBeInTheDocument();
    expect(screen.queryByTestId("page-login")).not.toBeInTheDocument();
    expect(screen.getByTestId("navigation-type")).toHaveTextContent("REPLACE");
    expectPath("/dashboard");
  });

  test("redirects guest visiting root to login", async () => {
    renderAt("/");

    expect(await screen.findByTestId("page-login")).toBeInTheDocument();
    expectPath("/login");
    expect(screen.getByTestId("navigation-type")).toHaveTextContent("REPLACE");
  });

  test.each(roles)(
    "redirects authenticated %s visiting root to dashboard",
    async (role) => {
      renderAt("/", role);

      expect(await screen.findByTestId("page-dashboard")).toBeInTheDocument();
      expectPath("/dashboard");
    }
  );

  test("redirects unknown guest routes to login", async () => {
    renderAt("/something-that-does-not-exist");

    expect(await screen.findByTestId("page-login")).toBeInTheDocument();
    expectPath("/login");
  });

  test.each(roles)(
    "redirects unknown routes to dashboard for %s",
    async (role) => {
      renderAt("/not-found", role);

      expect(await screen.findByTestId("page-dashboard")).toBeInTheDocument();
      expectPath("/dashboard");
    }
  );

  // ------------------------------------------
  // UNAUTHENTICATED ACCESS: ALL PRIVATE ROUTES
  // ------------------------------------------

  test.each(routeMatrix.map((route) => [route.path, route.page]))(
    "redirects unauthenticated visitor from %s to login",
    async (path, page) => {
      renderAt(path);

      expect(await screen.findByTestId("page-login")).toBeInTheDocument();
      expectPath("/login");
      expect(screen.getByTestId("navigation-type")).toHaveTextContent("REPLACE");
      expect(screen.queryByTestId(page)).not.toBeInTheDocument();
      expect(screen.queryByTestId("dashboard-layout")).not.toBeInTheDocument();
    }
  );

  // ------------------------------------------
  // ALLOWED ACCESS: ACTUAL NESTED ROUTE GUARDS
  // ------------------------------------------

  test.each(allowedCases)(
    "allows %s to access %s",
    async (role, path, page) => {
      renderAt(path, role);

      expect(await screen.findByTestId(page)).toBeInTheDocument();
      expect(screen.getByTestId("dashboard-layout")).toBeInTheDocument();
      expect(screen.queryByTestId("page-login")).not.toBeInTheDocument();
      expectPath(path);
    }
  );

  // ------------------------------------------
  // DENIED ACCESS: ROLE GUARDS
  // ------------------------------------------

  test.each(deniedCases)(
    "denies %s access to %s",
    async (role, path, page) => {
      renderAt(path, role);

      expect(
        await screen.findByRole("heading", { name: "Access denied" })
      ).toBeInTheDocument();

      expectPath("/forbidden");
      expect(screen.queryByTestId(page)).not.toBeInTheDocument();
      expect(screen.getByTestId("dashboard-layout")).toBeInTheDocument();
      expect(screen.getByTestId("navigation-type")).toHaveTextContent("REPLACE");
    }
  );

  // ------------------------------------------
  // FORBIDDEN PAGE AND RETURN NAVIGATION
  // ------------------------------------------

  test("shows forbidden page to a signed-in user", () => {
    renderAt("/forbidden", "Customer");

    expect(
      screen.getByRole("heading", { name: "Access denied" })
    ).toBeInTheDocument();

    expect(screen.getByText(
      "Your account does not have permission to view this page."
    )).toBeInTheDocument();

    expect(screen.getByRole("link", {
      name: "Return to dashboard",
    })).toHaveAttribute("href", "/dashboard");
  });

  test("returns to dashboard from forbidden page", async () => {
    const user = userEvent.setup();
    renderAt("/users", "Customer");

    expect(
      await screen.findByRole("heading", { name: "Access denied" })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("link", {
      name: "Return to dashboard",
    }));

    expect(await screen.findByTestId("page-dashboard")).toBeInTheDocument();
    expectPath("/dashboard");
  });

  test("requires authentication for the forbidden page too", async () => {
    renderAt("/forbidden");

    expect(await screen.findByTestId("page-login")).toBeInTheDocument();
    expectPath("/login");
    expect(screen.queryByText("Access denied")).not.toBeInTheDocument();
  });

  // ------------------------------------------
  // ROLE SPELLING AND INVENTORY MODE
  // ------------------------------------------

  test("does not treat lowercase admin as Admin", async () => {
    renderAt("/users", "admin");

    expect(
      await screen.findByRole("heading", { name: "Access denied" })
    ).toBeInTheDocument();
    expectPath("/forbidden");
    expect(screen.queryByTestId("page-users")).not.toBeInTheDocument();
  });

  test("denies unknown role access to admin pages", async () => {
    renderAt("/batches", "Manager");

    expect(
      await screen.findByRole("heading", { name: "Access denied" })
    ).toBeInTheDocument();
    expectPath("/forbidden");
  });

  test.each(["Admin", "Pharmacist"])(
    "passes inventory mode to StockOverview for %s",
    async (role) => {
      renderAt("/inventory", role);

      expect(
        await screen.findByTestId("page-stock-inventory")
      ).toHaveTextContent("Stock mode: inventory");
    }
  );

  test.each(["Admin", "Pharmacist"])(
    "passes low-stock mode to StockOverview for %s",
    async (role) => {
      renderAt("/low-stock", role);

      expect(
        await screen.findByTestId("page-stock-low-stock")
      ).toHaveTextContent("Stock mode: low-stock");
    }
  );
});
