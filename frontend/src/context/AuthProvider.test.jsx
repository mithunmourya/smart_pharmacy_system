
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
  act,
  cleanup,
} from "@testing-library/react";

import AuthProvider from "./AuthProvider";
import useAuth from "../hooks/useAuth";
import { apiRequest, ApiError } from "../services/api";

// ============================================
// MOCK API REQUESTS
// ============================================

// Keep the real ApiError class.
// Mock only the HTTP request function.

vi.mock("../services/api", async (importOriginal) => {
  const original = await importOriginal();

  return {
    ...original,
    apiRequest: vi.fn(),
  };
});

// ============================================
// TEST DATA
// ============================================

const mockUser = {
  user_id: 7,
  name: "Ravi Kumar",
  email: "ravi@example.com",
  role: "Pharmacist",
};

const anotherUser = {
  user_id: 8,
  name: "Anita Sharma",
  email: "anita@example.com",
  role: "Admin",
};

const FIXED_TIME = new Date(
  "2026-11-04T12:00:00.000Z"
);

let currentAuth;

// ============================================
// JWT HELPER
// ============================================

// AuthProvider decodes the JWT payload to
// check exp. These are synthetic JWT strings,
// not cryptographically signed tokens.
// That is sufficient for this unit test.

function createToken(
  expiresInSeconds = 3600,
  extraClaims = {}
) {
  const payload = {
    exp:
      Math.floor(Date.now() / 1000) +
      expiresInSeconds,
    ...extraClaims,
  };

  const encoded = btoa(
    JSON.stringify(payload)
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `test-header.${encoded}.test-signature`;
}

// ============================================
// AUTH CONTEXT CONSUMER
// ============================================

function AuthConsumer() {
  const auth = useAuth();

  currentAuth = auth;

  return (
    <div>
      <output data-testid="authenticated">
        {String(auth.isAuthenticated)}
      </output>

      <output data-testid="user-name">
        {auth.user?.name ?? "none"}
      </output>

      <output data-testid="user-email">
        {auth.user?.email ?? "none"}
      </output>

      <output data-testid="user-role">
        {auth.user?.role ?? "none"}
      </output>

      <output data-testid="user-id">
        {auth.user?.user_id ?? "none"}
      </output>
    </div>
  );
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function renderProvider() {
  return render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>
  );
}

function loginUser(
  user = mockUser,
  token = createToken()
) {
  act(() => {
    currentAuth.login({
      token,
      user,
    });
  });

  return token;
}

function expectAuthenticated() {
  expect(
    screen.getByTestId("authenticated")
  ).toHaveTextContent("true");
}

function expectLoggedOut() {
  expect(
    screen.getByTestId("authenticated")
  ).toHaveTextContent("false");

  expect(
    screen.getByTestId("user-name")
  ).toHaveTextContent("none");
}

async function successfulRequest(
  path,
  options
) {
  let response;

  await act(async () => {
    response =
      await currentAuth.authenticatedRequest(
        path,
        options
      );
  });

  return response;
}

async function failedRequest(
  path,
  options
) {
  let caughtError;

  await act(async () => {
    try {
      await currentAuth.authenticatedRequest(
        path,
        options
      );
    } catch (error) {
      caughtError = error;
    }
  });

  return caughtError;
}

function useFixedTime() {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_TIME);
}

function deferred() {
  let resolve;
  let reject;

  const promise = new Promise(
    (resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    }
  );

  return { promise, resolve, reject };
}

// ============================================
// SETUP AND CLEANUP
// ============================================

beforeEach(() => {
  vi.resetAllMocks();

  currentAuth = null;

  apiRequest.mockResolvedValue({
    success: true,
    data: [],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ============================================
// 1. AUTH CONTEXT AND INITIAL STATE
// ============================================

describe("AuthProvider initial state", () => {
  test("starts unauthenticated", () => {
    renderProvider();

    expectLoggedOut();
  });

  test("exposes authentication functions through useAuth", () => {
    renderProvider();

    expect(
      typeof currentAuth.login
    ).toBe("function");

    expect(
      typeof currentAuth.logout
    ).toBe("function");

    expect(
      typeof currentAuth.authenticatedRequest
    ).toBe("function");

    expect(
      typeof currentAuth.updateCurrentUser
    ).toBe("function");
  });

  test("throws when useAuth is used outside AuthProvider", () => {
    function InvalidConsumer() {
      useAuth();
      return null;
    }

    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      expect(() => {
        render(<InvalidConsumer />);
      }).toThrow(
        "useAuth must be used inside AuthProvider."
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

// ============================================
// 2. LOGIN
// ============================================

describe("AuthProvider login", () => {
  test("logs in successfully with valid JWT", () => {
    renderProvider();

    loginUser();

    expectAuthenticated();

    expect(
      screen.getByTestId("user-name")
    ).toHaveTextContent("Ravi Kumar");

    expect(
      screen.getByTestId("user-email")
    ).toHaveTextContent(
      "ravi@example.com"
    );

    expect(
      screen.getByTestId("user-role")
    ).toHaveTextContent("Pharmacist");

    expect(
      screen.getByTestId("user-id")
    ).toHaveTextContent("7");
  });

  test("does not make an API request during login", () => {
    renderProvider();

    loginUser();

    expect(
      apiRequest
    ).not.toHaveBeenCalled();
  });

  test("rejects an expired JWT", () => {
    renderProvider();

    const expiredToken = createToken(-60);

    expect(() => {
      act(() => {
        currentAuth.login({
          token: expiredToken,
          user: mockUser,
        });
      });
    }).toThrow(
      "Your session has expired. Please sign in again."
    );

    expectLoggedOut();
  });

  test("rejects a JWT expiring at the current time", () => {
    useFixedTime();
    renderProvider();

    expect(() => {
      act(() => {
        currentAuth.login({
          token: createToken(0),
          user: mockUser,
        });
      });
    }).toThrow(/session has expired/i);

    expectLoggedOut();
  });

  test("rejects a malformed JWT", () => {
    renderProvider();

    expect(() => {
      act(() => {
        currentAuth.login({
          token: "invalid-token",
          user: mockUser,
        });
      });
    }).toThrow(/session has expired/i);

    expectLoggedOut();
  });

  test("rejects a JWT without exp claim", () => {
    renderProvider();

    const token = createToken(
      3600,
      { exp: undefined }
    );

    expect(() => {
      act(() => {
        currentAuth.login({
          token,
          user: mockUser,
        });
      });
    }).toThrow(/session has expired/i);

    expectLoggedOut();
  });

  test("rejects a JWT with non-numeric exp", () => {
    renderProvider();

    const token = createToken(
      3600,
      { exp: "tomorrow" }
    );

    expect(() => {
      act(() => {
        currentAuth.login({
          token,
          user: mockUser,
        });
      });
    }).toThrow(/session has expired/i);

    expectLoggedOut();
  });

  test("replaces current user when a new login occurs", () => {
    renderProvider();

    loginUser(mockUser);

    expect(
      screen.getByTestId("user-name")
    ).toHaveTextContent("Ravi Kumar");

    loginUser(
      anotherUser,
      createToken(3600, { jti: "second-login" })
    );

    expectAuthenticated();

    expect(
      screen.getByTestId("user-name")
    ).toHaveTextContent("Anita Sharma");

    expect(
      screen.getByTestId("user-role")
    ).toHaveTextContent("Admin");
  });

  test("does not persist session when provider remounts", () => {
    const { unmount } = renderProvider();

    loginUser();

    expectAuthenticated();

    unmount();

    renderProvider();

    expectLoggedOut();
  });
});

// ============================================
// 3. LOGOUT
// ============================================

describe("AuthProvider logout", () => {
  test("clears authenticated session", () => {
    renderProvider();
    loginUser();

    expectAuthenticated();

    act(() => {
      currentAuth.logout();
    });

    expectLoggedOut();
  });

  test("allows logout when already signed out", () => {
    renderProvider();

    act(() => {
      currentAuth.logout();
    });

    expectLoggedOut();
  });

  test("allows login again after logout", () => {
    renderProvider();

    loginUser();

    act(() => {
      currentAuth.logout();
    });

    expectLoggedOut();

    loginUser(anotherUser);

    expectAuthenticated();

    expect(
      screen.getByTestId("user-name")
    ).toHaveTextContent("Anita Sharma");
  });
});

// ============================================
// 4. UPDATE CURRENT USER
// ============================================

describe("AuthProvider updateCurrentUser", () => {
  test("updates name and email for matching user ID", () => {
    renderProvider();
    loginUser();

    act(() => {
      currentAuth.updateCurrentUser(7, {
        name: "Updated Ravi",
        email: "updated@example.com",
      });
    });

    expect(
      screen.getByTestId("user-name")
    ).toHaveTextContent("Updated Ravi");

    expect(
      screen.getByTestId("user-email")
    ).toHaveTextContent(
      "updated@example.com"
    );
  });

  test("accepts a numeric string for matching user ID", () => {
    renderProvider();
    loginUser();

    act(() => {
      currentAuth.updateCurrentUser("7", {
        name: "Ravi Updated",
        email: "new@example.com",
      });
    });

    expect(
      screen.getByTestId("user-name")
    ).toHaveTextContent("Ravi Updated");
  });

  test("ignores updates for another user ID", () => {
    renderProvider();
    loginUser();

    act(() => {
      currentAuth.updateCurrentUser(99, {
        name: "Wrong User",
        email: "wrong@example.com",
      });
    });

    expect(
      screen.getByTestId("user-name")
    ).toHaveTextContent("Ravi Kumar");

    expect(
      screen.getByTestId("user-email")
    ).toHaveTextContent(
      "ravi@example.com"
    );
  });

  test("does nothing when no user is logged in", () => {
    renderProvider();

    act(() => {
      currentAuth.updateCurrentUser(7, {
        name: "New Name",
        email: "new@example.com",
      });
    });

    expectLoggedOut();
  });

  test("preserves user ID and role during profile update", () => {
    renderProvider();
    loginUser();

    act(() => {
      currentAuth.updateCurrentUser(7, {
        name: "Updated Name",
        email: "updated@example.com",
        role: "Admin",
      });
    });

    expect(
      screen.getByTestId("user-id")
    ).toHaveTextContent("7");

    expect(
      screen.getByTestId("user-role")
    ).toHaveTextContent("Pharmacist");
  });
});

// ============================================
// 5. AUTHENTICATED REQUESTS
// ============================================

describe("AuthProvider authenticatedRequest", () => {
  test("rejects API requests before login", async () => {
    renderProvider();

    const error = await failedRequest(
      "/users"
    );

    expect(error).toBeInstanceOf(ApiError);

    expect(error.message).toBe(
      "Please sign in again."
    );

    expect(error.status).toBe(401);

    expect(
      apiRequest
    ).not.toHaveBeenCalled();
  });

  test("sends JWT with authenticated API request", async () => {
    renderProvider();

    const token = loginUser();

    await successfulRequest(
      "/inventory",
      {
        method: "GET",
      }
    );

    expect(
      apiRequest
    ).toHaveBeenCalledWith(
      "/inventory",
      {
        method: "GET",
        token,
      }
    );
  });

  test("forwards PATCH method and request body", async () => {
    renderProvider();

    const token = loginUser();

    await successfulRequest(
      "/users/change-password",
      {
        method: "PATCH",
        body: {
          currentPassword: "Old123!",
          newPassword: "New456!",
        },
      }
    );

    expect(
      apiRequest
    ).toHaveBeenCalledWith(
      "/users/change-password",
      {
        method: "PATCH",
        body: {
          currentPassword: "Old123!",
          newPassword: "New456!",
        },
        token,
      }
    );
  });

  test("supports request without options", async () => {
    renderProvider();

    const token = loginUser();

    await successfulRequest(
      "/medicines"
    );

    expect(
      apiRequest
    ).toHaveBeenCalledWith(
      "/medicines",
      { token }
    );
  });

  test("does not allow request options to override session token", async () => {
    renderProvider();

    const token = loginUser();

    await successfulRequest(
      "/inventory",
      {
        method: "GET",
        token: "wrong-token",
      }
    );

    expect(
      apiRequest
    ).toHaveBeenCalledWith(
      "/inventory",
      {
        method: "GET",
        token,
      }
    );
  });

  test("returns successful API response", async () => {
    const expectedResponse = {
      success: true,
      message: "Inventory loaded.",
      data: [
        {
          medicine_id: 1,
          medicine_name: "Paracetamol",
        },
      ],
    };

    apiRequest.mockResolvedValue(
      expectedResponse
    );

    renderProvider();
    loginUser();

    const response =
      await successfulRequest(
        "/inventory"
      );

    expect(response).toEqual(
      expectedResponse
    );

    expectAuthenticated();
  });

  test("keeps user logged in after HTTP 400 error", async () => {
    apiRequest.mockRejectedValue(
      new ApiError("Invalid request.", 400)
    );

    renderProvider();
    loginUser();

    const error = await failedRequest(
      "/inventory"
    );

    expect(error.status).toBe(400);

    expectAuthenticated();
  });

  test("keeps user logged in after HTTP 403 error", async () => {
    apiRequest.mockRejectedValue(
      new ApiError("Access forbidden.", 403)
    );

    renderProvider();
    loginUser();

    const error = await failedRequest(
      "/users"
    );

    expect(error.status).toBe(403);

    expectAuthenticated();
  });

  test("logs out when API returns HTTP 401", async () => {
    apiRequest.mockRejectedValue(
      new ApiError(
        "Unauthorized access.",
        401
      )
    );

    renderProvider();
    loginUser();

    const error = await failedRequest(
      "/inventory"
    );

    expect(error.status).toBe(401);

    expectLoggedOut();
  });

  test("does not log out for incorrect current password", async () => {
    apiRequest.mockRejectedValue(
      new ApiError(
        "Current password is incorrect.",
        401
      )
    );

    renderProvider();
    loginUser();

    const error = await failedRequest(
      "/users/change-password",
      {
        method: "PATCH",
        body: {
          currentPassword: "wrong",
          newPassword: "New123!",
        },
      }
    );

    expect(error.status).toBe(401);

    expect(error.message).toBe(
      "Current password is incorrect."
    );

    expectAuthenticated();
  });

  test("logs out for other 401 errors during password change", async () => {
    apiRequest.mockRejectedValue(
      new ApiError(
        "Session expired.",
        401
      )
    );

    renderProvider();
    loginUser();

    const error = await failedRequest(
      "/users/change-password"
    );

    expect(error.status).toBe(401);

    expectLoggedOut();
  });

  test("applies incorrect-password exception only to change-password endpoint", async () => {
    apiRequest.mockRejectedValue(
      new ApiError(
        "Current password is incorrect.",
        401
      )
    );

    renderProvider();
    loginUser();

    await failedRequest(
      "/users"
    );

    expectLoggedOut();
  });

  test("rethrows the original API error", async () => {
    const originalError = new ApiError(
      "Server unavailable.",
      503
    );

    apiRequest.mockRejectedValue(
      originalError
    );

    renderProvider();
    loginUser();

    const receivedError =
      await failedRequest("/inventory");

    expect(receivedError).toBe(
      originalError
    );

    expectAuthenticated();
  });

  test("rejects further API requests after logout", async () => {
    renderProvider();

    loginUser();

    act(() => {
      currentAuth.logout();
    });

    const error = await failedRequest(
      "/medicines"
    );

    expect(error.status).toBe(401);

    expect(
      apiRequest
    ).not.toHaveBeenCalled();
  });

  test("does not clear a newer session when an older request returns 401", async () => {
    const pending = deferred();

    apiRequest.mockReturnValueOnce(
      pending.promise
    );

    renderProvider();

    loginUser(
      mockUser,
      createToken(3600, { jti: "old" })
    );

    let oldRequestError;

    const oldRequest =
      currentAuth
        .authenticatedRequest("/users")
        .catch((error) => {
          oldRequestError = error;
        });

    act(() => {
      currentAuth.logout();
    });

    loginUser(
      anotherUser,
      createToken(3600, { jti: "new" })
    );

    await act(async () => {
      pending.reject(
        new ApiError(
          "Old session unauthorized.",
          401
        )
      );

      await oldRequest;
    });

    expect(oldRequestError.status).toBe(401);

    expectAuthenticated();

    expect(
      screen.getByTestId("user-name")
    ).toHaveTextContent("Anita Sharma");
  });
});

// ============================================
// 6. SESSION EXPIRY
// ============================================

describe("AuthProvider session expiry", () => {
  test("automatically logs out when JWT expires", () => {
    useFixedTime();

    renderProvider();

    loginUser(
      mockUser,
      createToken(2)
    );

    expectAuthenticated();

    act(() => {
      vi.advanceTimersByTime(1999);
    });

    expectAuthenticated();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expectLoggedOut();
  });

  test("does not let an old expiry timer log out a new session", () => {
    useFixedTime();

    renderProvider();

    loginUser(
      mockUser,
      createToken(2, { jti: "old" })
    );

    loginUser(
      anotherUser,
      createToken(10, { jti: "new" })
    );

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expectAuthenticated();

    expect(
      screen.getByTestId("user-name")
    ).toHaveTextContent("Anita Sharma");

    act(() => {
      vi.advanceTimersByTime(7500);
    });

    expectLoggedOut();
  });

  test("rejects request when token has expired", async () => {
    useFixedTime();

    renderProvider();

    loginUser(
      mockUser,
      createToken(5)
    );

    // Move the system clock without firing
    // scheduled timers. This allows us to
    // test the request-time expiry check.
    vi.setSystemTime(
      new Date(
        FIXED_TIME.getTime() + 6000
      )
    );

    const error = await failedRequest(
      "/inventory"
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);

    expect(error.message).toBe(
      "Please sign in again."
    );

    expect(
      apiRequest
    ).not.toHaveBeenCalled();

    expectLoggedOut();
  });

  test("checks expiry when browser tab becomes visible", () => {
    useFixedTime();

    let visibility = "hidden";

    const originalDescriptor =
      Object.getOwnPropertyDescriptor(
        document,
        "visibilityState"
      );

    Object.defineProperty(
      document,
      "visibilityState",
      {
        configurable: true,
        get: () => visibility,
      }
    );

    try {
      renderProvider();

      loginUser(
        mockUser,
        createToken(5)
      );

      vi.setSystemTime(
        new Date(
          FIXED_TIME.getTime() + 6000
        )
      );

      // Hidden tabs do not trigger the
      // immediate visibility-based check.
      act(() => {
        document.dispatchEvent(
          new Event("visibilitychange")
        );
      });

      expectAuthenticated();

      visibility = "visible";

      act(() => {
        document.dispatchEvent(
          new Event("visibilitychange")
        );
      });

      expectLoggedOut();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(
          document,
          "visibilityState",
          originalDescriptor
        );
      } else {
        delete document.visibilityState;
      }
    }
  });

  test("removes visibility listener on unmount", () => {
    const addSpy = vi.spyOn(
      document,
      "addEventListener"
    );

    const removeSpy = vi.spyOn(
      document,
      "removeEventListener"
    );

    const { unmount } = renderProvider();

    loginUser();

    const visibilityCall =
      addSpy.mock.calls.find(
        ([eventName]) =>
          eventName === "visibilitychange"
      );

    expect(
      visibilityCall
    ).toBeDefined();

    const listener = visibilityCall[1];

    unmount();

    expect(
      removeSpy
    ).toHaveBeenCalledWith(
      "visibilitychange",
      listener
    );
  });
});
