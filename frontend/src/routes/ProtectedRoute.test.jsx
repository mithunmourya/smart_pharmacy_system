
import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
} from "vitest";

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";

import ProtectedRoute from "./ProtectedRoute";
import useAuth from "../hooks/useAuth";

// Mock authentication hook
vi.mock("../hooks/useAuth", () => ({
  default: vi.fn(),
}));

// Helper to render protected routes
function renderProtectedRoute(allowedRoles) {
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route
          element={
            <ProtectedRoute allowedRoles={allowedRoles} />
          }
        >
          <Route
            path="/admin"
            element={<h1>Admin Dashboard</h1>}
          />
        </Route>

        <Route
          path="/login"
          element={<h1>Login Page</h1>}
        />

        <Route
          path="/forbidden"
          element={<h1>Forbidden Page</h1>}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // 1. NOT AUTHENTICATED
  test("should redirect unauthenticated user to login", () => {
    // Arrange
    useAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
    });

    // Act
    renderProtectedRoute(["Admin"]);

    // Assert
    expect(
      screen.getByText("Login Page")
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Admin Dashboard")
    ).not.toBeInTheDocument();
  });

  // 2. ADMIN ACCESS
  test("should allow Admin to access Admin route", () => {
    // Arrange
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { role: "Admin" },
    });

    // Act
    renderProtectedRoute(["Admin"]);

    // Assert
    expect(
      screen.getByText("Admin Dashboard")
    ).toBeInTheDocument();
  });

  // 3. CUSTOMER DENIED
  test("should deny Customer access to Admin route", () => {
    // Arrange
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { role: "Customer" },
    });

    // Act
    renderProtectedRoute(["Admin"]);

    // Assert
    expect(
      screen.getByText("Forbidden Page")
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Admin Dashboard")
    ).not.toBeInTheDocument();
  });

  // 4. PHARMACIST DENIED
  test("should deny Pharmacist access to Admin route", () => {
    // Arrange
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { role: "Pharmacist" },
    });

    // Act
    renderProtectedRoute(["Admin"]);

    // Assert
    expect(
      screen.getByText("Forbidden Page")
    ).toBeInTheDocument();
  });

  // 5. MULTIPLE ALLOWED ROLES
  test("should allow Pharmacist when multiple roles are permitted", () => {
    // Arrange
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { role: "Pharmacist" },
    });

    // Act
    renderProtectedRoute(["Admin", "Pharmacist"]);

    // Assert
    expect(
      screen.getByText("Admin Dashboard")
    ).toBeInTheDocument();
  });

  // 6. NO ROLE RESTRICTION
  test("should allow authenticated user when allowedRoles is not provided", () => {
    // Arrange
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { role: "Customer" },
    });

    // Act
    renderProtectedRoute();

    // Assert
    expect(
      screen.getByText("Admin Dashboard")
    ).toBeInTheDocument();
  });
});

