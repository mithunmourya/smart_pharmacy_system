
import { describe, test, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import useAuth from "./useAuth";
import { AuthContext } from "../context/AuthContext";

describe("useAuth Hook", () => {

  // 1. Hook used inside provider
  test("should return authentication context", () => {

    // Arrange
    const mockAuth = {
      user: { user_id: 1, role: "Admin" },
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    };

    const wrapper = ({ children }) => (
      <AuthContext.Provider value={mockAuth}>
        {children}
      </AuthContext.Provider>
    );

    // Act
    const { result } = renderHook(() => useAuth(), {
      wrapper,
    });

    // Assert
    expect(result.current).toBe(mockAuth);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user.role).toBe("Admin");
  });

  // 2. Hook used outside provider
  test("should throw error outside AuthProvider", () => {

    // Act & Assert
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow(
      "useAuth must be used inside AuthProvider."
    );
  });

});
