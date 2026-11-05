
import { useState } from "react";

import {
  describe,
  test,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";

import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";

import {
  MemoryRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
} from "react-router";

import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";

// ============================================
// 1. CONFIGURATION
// ============================================

const API_BASE = "http://127.0.0.1:4179/api";

let Login;
let AuthProvider;
let useAuth;
let ProtectedRoute;
let Navbar;

// ============================================
// 2. TEST USER AND JWT
// ============================================

function createToken(expiresInSeconds = 3600) {
  const payload = {
    exp:
      Math.floor(Date.now() / 1000) +
      expiresInSeconds,
  };

  return [
    "header",
    btoa(JSON.stringify(payload)),
    "signature",
  ].join(".");
}

function createUser(role = "Admin") {
  return {
    user_id: 1,
    name: "Ravi Kumar",
    email: "ravi@example.com",
    role,
    is_active: true,
  };
}

function loginSuccess({
  role = "Admin",
  token = createToken(),
  user = createUser(role),
} = {}) {
  return {
    success: true,
    message: "Login successful.",
    data: {
      token,
      user,
    },
  };
}

// ============================================
// 3. MSW LOGIN HANDLER
// ============================================

function mockLogin({
  status = 200,
  response = loginSuccess(),
} = {}) {
  const requests = [];

  server.use(
    http.post(
      `${API_BASE}/users/login`,
      async ({ request }) => {
        requests.push({
          body: await request.json(),
          authorization:
            request.headers.get("authorization"),
          contentType:
            request.headers.get("content-type"),
          accept:
            request.headers.get("accept"),
        });

        return HttpResponse.json(
          response,
          { status }
        );
      }
    )
  );

  return requests;
}

// ============================================
// 4. AUTHENTICATION STATUS PROBE
// ============================================

// This component exposes real AuthProvider
// state to the test without mocking it.

function SessionProbe() {
  const {
    user,
    isAuthenticated,
    logout,
    authenticatedRequest,
  } = useAuth();

  const location = useLocation();

  const [result, setResult] = useState("");

  async function makeRequest(
    path,
    options = {}
  ) {
    try {
      const response =
        await authenticatedRequest(
          path,
          options
        );

      setResult(
        `SUCCESS: ${response.message ?? "OK"}`
      );
    } catch (error) {
      setResult(
        `ERROR ${error.status}: ${error.message}`
      );
    }
  }

  return (
    <div>
      <output data-testid="current-path">
        {location.pathname}
      </output>

      <output data-testid="auth-state">
        {isAuthenticated
          ? "authenticated"
          : "guest"}
      </output>

      <output data-testid="current-user">
        {user
          ? `${user.name} | ${user.role}`
          : "no user"}
      </output>

      {isAuthenticated && (
        <div>
          <button
            type="button"
            onClick={() =>
              makeRequest("/users")
            }
          >
            Test Protected API
          </button>

          <button
            type="button"
            onClick={() =>
              makeRequest(
                "/users/change-password",
                {
                  method: "PATCH",
                  body: {
                    currentPassword: "Old123!",
                    newPassword: "New456!",
                  },
                }
              )
            }
          >
            Test Password API
          </button>

          <button
            type="button"
            onClick={logout}
          >
            Probe Logout
          </button>
        </div>
      )}

      <output data-testid="api-result">
        {result}
      </output>
    </div>
  );
}

// ============================================
// 5. LOGIN ROUTE
// ============================================

function LoginRoute() {
  const { isAuthenticated } = useAuth();

  return isAuthenticated ? (
    <Navigate
      to="/dashboard"
      replace
    />
  ) : (
    <Login />
  );
}

// ============================================
// 6. TEST DASHBOARD
// ============================================

// We intentionally avoid mounting the real
// dashboard data widgets. They belong to
// their own integration test suites.

function TestDashboard() {
  return (
    <section>
      <Navbar
        onOpenMenu={() => {}}
        menuOpen={false}
        menuId="test-mobile-menu"
      />

      <h1>Dashboard ready</h1>

      <Link to="/admin">
        Admin Area
      </Link>

      <Link to="/pharmacist">
        Pharmacist Area
      </Link>

      <Link to="/customer">
        Customer Area
      </Link>
    </section>
  );
}

// ============================================
// 7. REAL ROUTER + REAL AUTH PROVIDER
// ============================================

function renderApp(initialPath = "/login") {
  return render(
    <MemoryRouter
      initialEntries={[initialPath]}
    >
      <AuthProvider>
        <SessionProbe />

        <Routes>
          <Route
            path="/login"
            element={<LoginRoute />}
          />

          <Route
            element={<ProtectedRoute />}
          >
            <Route
              path="/dashboard"
              element={<TestDashboard />}
            />

            <Route
              element={
                <ProtectedRoute
                  allowedRoles={["Admin"]}
                />
              }
            >
              <Route
                path="/admin"
                element={
                  <h1>Admin Only Area</h1>
                }
              />
            </Route>

            <Route
              element={
                <ProtectedRoute
                  allowedRoles={["Pharmacist"]}
                />
              }
            >
              <Route
                path="/pharmacist"
                element={
                  <h1>Pharmacist Only Area</h1>
                }
              />
            </Route>

            <Route
              element={
                <ProtectedRoute
                  allowedRoles={["Customer"]}
                />
              }
            >
              <Route
                path="/customer"
                element={
                  <h1>Customer Only Area</h1>
                }
              />
            </Route>

            <Route
              path="/forbidden"
              element={
                <h1>Access denied</h1>
              }
            />
          </Route>

          <Route
            path="*"
            element={
              <Navigate
                to="/login"
                replace
              />
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

// ============================================
// 8. FORM HELPERS
// ============================================

function fillLoginForm({
  email = "ravi@example.com",
  password = "Password123!",
} = {}) {
  fireEvent.change(
    screen.getByRole("textbox", {
      name: "Email address",
    }),
    {
      target: { value: email },
    }
  );

  fireEvent.change(
    screen.getByLabelText("Password"),
    {
      target: { value: password },
    }
  );
}

function submitLogin() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "Sign In",
    })
  );
}

async function signIn({
  role = "Admin",
  token,
} = {}) {
  mockLogin({
    response: loginSuccess({
      role,
      ...(token ? { token } : {}),
    }),
  });

  renderApp();

  fillLoginForm();
  submitLogin();

  await screen.findByRole("heading", {
    name: "Dashboard ready",
  });
}

// ============================================
// 9. TEST LIFECYCLE
// ============================================

beforeAll(async () => {
  vi.stubEnv(
    "VITE_API_BASE_URL",
    API_BASE
  );

  // Dynamic imports ensure that api.js
  // reads the temporary test base URL.

  ({ default: Login } =
    await import(
      "../../pages/auth/Login.jsx"
    ));

  ({ default: AuthProvider } =
    await import(
      "../../context/AuthProvider.jsx"
    ));

  ({ default: useAuth } =
    await import(
      "../../hooks/useAuth.js"
    ));

  ({ default: ProtectedRoute } =
    await import(
      "../../routes/ProtectedRoute.jsx"
    ));

  ({ default: Navbar } =
    await import(
      "../../components/Navbar.jsx"
    ));

  server.listen({
    onUnhandledRequest: "error",
  });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.restoreAllMocks();
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

// ============================================
// 10. LOGIN REQUEST INTEGRATION
// ============================================

describe("Auth Integration - Login Requests", () => {
  test("1. renders the login page without a session", () => {
    renderApp();

    expect(
      screen.getByRole("heading", {
        name: "Sign in to your account",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByTestId("auth-state")
    ).toHaveTextContent("guest");
  });

  test("2. redirects unauthenticated access to protected routes", async () => {
    renderApp("/dashboard");

    await waitFor(() => {
      expect(
        screen.getByTestId("current-path")
      ).toHaveTextContent("/login");
    });

    expect(
      screen.getByTestId("auth-state")
    ).toHaveTextContent("guest");
  });

  test("3. redirects unauthenticated access to admin-only route", async () => {
    renderApp("/admin");

    await waitFor(() => {
      expect(
        screen.getByTestId("current-path")
      ).toHaveTextContent("/login");
    });
  });

  test("4. submits JSON credentials through the real API utility", async () => {
    const requests = mockLogin();

    renderApp();

    fillLoginForm();
    submitLogin();

    await screen.findByRole("heading", {
      name: "Dashboard ready",
    });

    expect(requests).toHaveLength(1);

    expect(requests[0].body).toEqual({
      email: "ravi@example.com",
      password: "Password123!",
    });

    expect(
      requests[0].contentType
    ).toContain("application/json");

    expect(requests[0].accept).toBe(
      "application/json"
    );

    // A login request does not require
    // a pre-existing JWT.
    expect(
      requests[0].authorization
    ).toBeNull();
  });

  test("5. preserves password characters in the HTTP request", async () => {
    const requests = mockLogin();

    renderApp();

    fillLoginForm({
      password: "  Password123!  ",
    });

    submitLogin();

    await screen.findByRole("heading", {
      name: "Dashboard ready",
    });

    expect(
      requests[0].body.password
    ).toBe("  Password123!  ");
  });

  test("6. does not send HTTP request for empty form", () => {
    const requests = mockLogin();

    renderApp();
    submitLogin();

    expect(
      screen.getByText(
        "Enter your email address."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Enter your password."
      )
    ).toBeInTheDocument();

    expect(requests).toHaveLength(0);
  });

  test("7. does not send HTTP request for invalid email", () => {
    const requests = mockLogin();

    renderApp();

    fillLoginForm({
      email: "invalid-email",
    });

    submitLogin();

    expect(
      screen.getByText(
        "Enter a valid email address."
      )
    ).toBeInTheDocument();

    expect(requests).toHaveLength(0);
  });

  test("8. does not send HTTP request for missing password", () => {
    const requests = mockLogin();

    renderApp();

    fillLoginForm({
      password: "",
    });

    submitLogin();

    expect(
      screen.getByText(
        "Enter your password."
      )
    ).toBeInTheDocument();

    expect(requests).toHaveLength(0);
  });

  test("9. toggles password visibility without an API request", () => {
    const requests = mockLogin();

    renderApp();

    fillLoginForm();

    expect(
      screen.getByLabelText("Password")
    ).toHaveAttribute("type", "password");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Show password",
      })
    );

    expect(
      screen.getByLabelText("Password")
    ).toHaveAttribute("type", "text");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Hide password",
      })
    );

    expect(
      screen.getByLabelText("Password")
    ).toHaveAttribute("type", "password");

    expect(requests).toHaveLength(0);
  });

  test("10. blocks duplicate submissions while login is pending", async () => {
    let releaseRequest;
    let postCount = 0;

    const pending = new Promise((resolve) => {
      releaseRequest = resolve;
    });

    server.use(
      http.post(
        `${API_BASE}/users/login`,
        async () => {
          postCount += 1;

          await pending;

          return HttpResponse.json(
            loginSuccess()
          );
        }
      )
    );

    renderApp();

    fillLoginForm();
    submitLogin();

    await waitFor(() => {
      expect(postCount).toBe(1);
    });

    expect(
      screen.getByRole("button", {
        name: "Signing in...",
      })
    ).toBeDisabled();

    expect(
      screen.getByRole("textbox", {
        name: "Email address",
      })
    ).toBeDisabled();

    expect(
      screen.getByLabelText("Password")
    ).toBeDisabled();

    expect(
      screen.getByText(
        "Checking your credentials..."
      )
    ).toBeInTheDocument();

    const form = screen
      .getByRole("button", {
        name: "Signing in...",
      })
      .closest("form");

    fireEvent.submit(form);

    expect(postCount).toBe(1);

    await act(async () => {
      releaseRequest();
    });

    await screen.findByRole("heading", {
      name: "Dashboard ready",
    });

    expect(postCount).toBe(1);
  });
});

// ============================================
// 11. SUCCESSFUL LOGIN AND ROUTES
// ============================================

describe("Auth Integration - Successful Login", () => {
  test.each([
    "Admin",
    "Pharmacist",
    "Customer",
  ])(
    "11. authenticates %s and redirects to dashboard",
    async (role) => {
      await signIn({ role });

      expect(
        screen.getByTestId("auth-state")
      ).toHaveTextContent(
        "authenticated"
      );

      expect(
        screen.getByTestId("current-user")
      ).toHaveTextContent(role);

      expect(
        screen.getByTestId("current-path")
      ).toHaveTextContent("/dashboard");

      expect(
        screen.queryByRole("button", {
          name: "Sign In",
        })
      ).not.toBeInTheDocument();
    }
  );

  test("12. preserves user information in real AuthProvider", async () => {
    await signIn();

    expect(
      screen.getByTestId("current-user")
    ).toHaveTextContent(
      "Ravi Kumar | Admin"
    );

    expect(
      screen.getByRole("link", {
        name: "Open my profile: Ravi Kumar",
      })
    ).toBeInTheDocument();
  });

  test("13. allows Admin to access admin-protected route", async () => {
    await signIn({
      role: "Admin",
    });

    fireEvent.click(
      screen.getByRole("link", {
        name: "Admin Area",
      })
    );

    expect(
      await screen.findByRole("heading", {
        name: "Admin Only Area",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByTestId("current-path")
    ).toHaveTextContent("/admin");
  });

  test("14. allows Pharmacist to access pharmacist-protected route", async () => {
    await signIn({
      role: "Pharmacist",
    });

    fireEvent.click(
      screen.getByRole("link", {
        name: "Pharmacist Area",
      })
    );

    expect(
      await screen.findByRole("heading", {
        name: "Pharmacist Only Area",
      })
    ).toBeInTheDocument();
  });

  test("15. allows Customer to access customer-protected route", async () => {
    await signIn({
      role: "Customer",
    });

    fireEvent.click(
      screen.getByRole("link", {
        name: "Customer Area",
      })
    );

    expect(
      await screen.findByRole("heading", {
        name: "Customer Only Area",
      })
    ).toBeInTheDocument();
  });

  test.each([
    ["Pharmacist", "Admin Area"],
    ["Customer", "Admin Area"],
    ["Admin", "Pharmacist Area"],
    ["Customer", "Pharmacist Area"],
    ["Admin", "Customer Area"],
    ["Pharmacist", "Customer Area"],
  ])(
    "16. denies %s access to %s",
    async (role, target) => {
      await signIn({ role });

      fireEvent.click(
        screen.getByRole("link", {
          name: target,
        })
      );

      expect(
        await screen.findByRole("heading", {
          name: "Access denied",
        })
      ).toBeInTheDocument();

      expect(
        screen.getByTestId("auth-state")
      ).toHaveTextContent(
        "authenticated"
      );
    }
  );

  test("17. logs out through the real Navbar", async () => {
    await signIn();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Sign Out",
      })
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("auth-state")
      ).toHaveTextContent("guest");
    });

    expect(
      screen.getByTestId("current-user")
    ).toHaveTextContent("no user");

    expect(
      screen.getByTestId("current-path")
    ).toHaveTextContent("/login");

    expect(
      screen.getByRole("heading", {
        name: "Sign in to your account",
      })
    ).toBeInTheDocument();
  });
});

// ============================================
// 12. BACKEND LOGIN ERROR HANDLING
// ============================================

describe("Auth Integration - Login Failures", () => {
  test.each([
    [400, "Invalid login information."],
    [401, "Invalid credentials."],
    [409, "User account is inactive."],
    [500, "Internal server error."],
  ])(
    "18. displays HTTP %s error: %s",
    async (status, message) => {
      mockLogin({
        status,
        response: {
          success: false,
          message,
          data: null,
        },
      });

      renderApp();

      fillLoginForm();
      submitLogin();

      expect(
        await screen.findByRole("alert")
      ).toHaveTextContent(message);

      expect(
        screen.getByTestId("auth-state")
      ).toHaveTextContent("guest");

      expect(
        screen.getByTestId("current-path")
      ).toHaveTextContent("/login");
    }
  );

  test("19. rejects application-level failure with HTTP 200", async () => {
    mockLogin({
      response: {
        success: false,
        message: "Login rejected.",
        status: 401,
      },
    });

    renderApp();

    fillLoginForm();
    submitLogin();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Login rejected."
    );

    expect(
      screen.getByTestId("auth-state")
    ).toHaveTextContent("guest");
  });

  test("20. handles malformed JSON returned by backend", async () => {
    server.use(
      http.post(
        `${API_BASE}/users/login`,
        () =>
          HttpResponse.text(
            "not valid JSON",
            { status: 200 }
          )
      )
    );

    renderApp();

    fillLoginForm();
    submitLogin();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "The server returned an invalid response."
    );

    expect(
      screen.getByTestId("auth-state")
    ).toHaveTextContent("guest");
  });

  test("21. rejects missing session data", async () => {
    mockLogin({
      response: {
        success: true,
        data: null,
      },
    });

    renderApp();

    fillLoginForm();
    submitLogin();

    expect(
      await screen.findByRole("alert")
    ).toBeInTheDocument();

    expect(
      screen.getByTestId("auth-state")
    ).toHaveTextContent("guest");
  });

  test("22. rejects invalid JWT token", async () => {
    mockLogin({
      response: loginSuccess({
        token: "not-a-valid-jwt",
      }),
    });

    renderApp();

    fillLoginForm();
    submitLogin();

    expect(
      await screen.findByRole("alert")
    ).toBeInTheDocument();

    expect(
      screen.getByTestId("auth-state")
    ).toHaveTextContent("guest");
  });

  test("23. rejects already expired JWT token", async () => {
    mockLogin({
      response: loginSuccess({
        token: createToken(-60),
      }),
    });

    renderApp();

    fillLoginForm();
    submitLogin();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Your session has expired. Please sign in again."
    );

    expect(
      screen.getByTestId("auth-state")
    ).toHaveTextContent("guest");
  });

  test("24. handles network connection failure", async () => {
    server.use(
      http.post(
        `${API_BASE}/users/login`,
        () => HttpResponse.error()
      )
    );

    renderApp();

    fillLoginForm();
    submitLogin();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to connect to the server."
    );

    expect(
      screen.getByTestId("auth-state")
    ).toHaveTextContent("guest");
  });

  test("25. clears backend error when user edits email", async () => {
    mockLogin({
      status: 401,
      response: {
        success: false,
        message: "Invalid credentials.",
      },
    });

    renderApp();

    fillLoginForm();
    submitLogin();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Invalid credentials."
    );

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Email address",
      }),
      {
        target: {
          value: "different@example.com",
        },
      }
    );

    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  test("26. allows successful retry after failed login", async () => {
    let requestCount = 0;

    server.use(
      http.post(
        `${API_BASE}/users/login`,
        () => {
          requestCount += 1;

          if (requestCount === 1) {
            return HttpResponse.json(
              {
                success: false,
                message: "Invalid credentials.",
              },
              { status: 401 }
            );
          }

          return HttpResponse.json(
            loginSuccess()
          );
        }
      )
    );

    renderApp();

    fillLoginForm();
    submitLogin();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Invalid credentials."
    );

    submitLogin();

    await screen.findByRole("heading", {
      name: "Dashboard ready",
    });

    expect(requestCount).toBe(2);

    expect(
      screen.getByTestId("auth-state")
    ).toHaveTextContent(
      "authenticated"
    );
  });
});

// ============================================
// 13. AUTHENTICATED HTTP REQUESTS
// ============================================

describe("Auth Integration - Protected API", () => {
  test("27. adds JWT Authorization header to protected requests", async () => {
    let capturedAuthorization;

    server.use(
      http.get(
        `${API_BASE}/users`,
        ({ request }) => {
          capturedAuthorization =
            request.headers.get(
              "authorization"
            );

          return HttpResponse.json({
            success: true,
            message: "Users loaded.",
            data: [],
          });
        }
      )
    );

    await signIn();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Test Protected API",
      })
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("api-result")
      ).toHaveTextContent(
        "SUCCESS: Users loaded."
      );
    });

    expect(
      capturedAuthorization
    ).toMatch(/^Bearer \S+$/);

    expect(
      screen.getByTestId("auth-state")
    ).toHaveTextContent(
      "authenticated"
    );
  });

  test("28. keeps session active for HTTP 403", async () => {
    server.use(
      http.get(
        `${API_BASE}/users`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Access forbidden.",
            },
            { status: 403 }
          )
      )
    );

    await signIn();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Test Protected API",
      })
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("api-result")
      ).toHaveTextContent(
        "ERROR 403: Access forbidden."
      );
    });

    expect(
      screen.getByTestId("auth-state")
    ).toHaveTextContent(
      "authenticated"
    );

    expect(
      screen.getByTestId("current-path")
    ).toHaveTextContent("/dashboard");
  });

  test("29. logs out after HTTP 401 from a protected API", async () => {
    server.use(
      http.get(
        `${API_BASE}/users`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Session expired.",
            },
            { status: 401 }
          )
      )
    );

    await signIn();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Test Protected API",
      })
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("auth-state")
      ).toHaveTextContent("guest");
    });

    
await waitFor(() => {
  expect(
    screen.getByTestId("current-path")
  ).toHaveTextContent("/login");
});


    expect(
      screen.getByRole("heading", {
        name: "Sign in to your account",
      })
    ).toBeInTheDocument();
  });

  test("30. keeps session for incorrect current password error", async () => {
    server.use(
      http.patch(
        `${API_BASE}/users/change-password`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message:
                "Current password is incorrect.",
            },
            { status: 401 }
          )
      )
    );

    await signIn();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Test Password API",
      })
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("api-result")
      ).toHaveTextContent(
        "ERROR 401: Current password is incorrect."
      );
    });

    // This specific 401 must NOT log out
    // the current user.
    expect(
      screen.getByTestId("auth-state")
    ).toHaveTextContent(
      "authenticated"
    );
  });

  test("31. logs out for other 401 password API errors", async () => {
    server.use(
      http.patch(
        `${API_BASE}/users/change-password`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Session revoked.",
            },
            { status: 401 }
          )
      )
    );

    await signIn();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Test Password API",
      })
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("auth-state")
      ).toHaveTextContent("guest");
    });

   
await waitFor(() => {
  expect(
    screen.getByTestId("current-path")
  ).toHaveTextContent("/login");
});

  });

  test("32. rejects an expired local session without calling backend", async () => {
    let protectedRequestCount = 0;

    server.use(
      http.get(
        `${API_BASE}/users`,
        () => {
          protectedRequestCount += 1;

          return HttpResponse.json({
            success: true,
            data: [],
          });
        }
      )
    );

    await signIn();

    // Move the logical clock past JWT expiry
    // without waiting one real hour.
    const future =
      Date.now() + 2 * 60 * 60 * 1000;

    vi.spyOn(Date, "now").mockReturnValue(
      future
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Test Protected API",
      })
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("auth-state")
      ).toHaveTextContent("guest");
    });

    expect(
      protectedRequestCount
    ).toBe(0);

    expect(
      screen.getByTestId("current-path")
    ).toHaveTextContent("/login");
  });
});
