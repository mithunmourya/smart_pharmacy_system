
import { useEffect, useState } from "react";
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
  within,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import {
  MemoryRouter,
  Routes,
  Route,
} from "react-router";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";

// ============================================
// 1. CONFIGURATION
// ============================================

const API_BASE = "http://127.0.0.1:4179/api";

let AuthProvider;
let useAuth;
let ProtectedRoute;
let Users;

// ============================================
// 2. TEST DATA
// ============================================

function initialUsers() {
  return [
    {
      user_id: 1,
      name: "Admin One",
      email: "admin@example.com",
      role: "Admin",
      is_active: "1",
      created_at: "2026-01-01",
    },
    {
      user_id: 2,
      name: "Bina Pharmacist",
      email: "bina@example.com",
      role: "Pharmacist",
      is_active: 1,
      created_at: "2026-02-01",
    },
    {
      user_id: 3,
      name: "Chandra Customer",
      email: "chandra@example.com",
      role: "Customer",
      is_active: true,
      created_at: "2026-03-01",
    },
    {
      user_id: 4,
      name: "Dinesh Inactive",
      email: "dinesh@example.com",
      role: "Customer",
      is_active: 0,
      created_at: "2026-04-01",
    },
    {
      user_id: 5,
      name: "Esha Customer",
      email: "esha@example.com",
      role: "Customer",
      is_active: "1",
      created_at: null,
    },
  ];
}

function testToken() {
  return [
    "header",
    btoa(
      JSON.stringify({
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ),
    "signature",
  ].join(".");
}

// ============================================
// 3. STATEFUL MOCK BACKEND
// ============================================

function installUserApi({
  users = initialUsers(),
} = {}) {
  const db = {
    users: structuredClone(users),
  };

  const requests = [];

  function record(method, path, request, body) {
    requests.push({
      method,
      path,
      body,
      authorization:
        request.headers.get("authorization"),
      accept:
        request.headers.get("accept"),
      contentType:
        request.headers.get("content-type"),
    });
  }

  server.use(
    // GET /users
    http.get(
      `${API_BASE}/users`,
      ({ request }) => {
        record("GET", "/users", request);

        return HttpResponse.json({
          success: true,
          data: structuredClone(db.users),
        });
      }
    ),

    // POST /users/register
    http.post(
      `${API_BASE}/users/register`,
      async ({ request }) => {
        const body = await request.json();

        record(
          "POST",
          "/users/register",
          request,
          body
        );

        const duplicate = db.users.some(
          (user) =>
            user.email.toLowerCase() ===
            body.email.toLowerCase()
        );

        if (duplicate) {
          return HttpResponse.json(
            {
              success: false,
              message:
                "Email already registered.",
            },
            { status: 409 }
          );
        }

        const newId =
          Math.max(
            0,
            ...db.users.map(
              (user) => Number(user.user_id)
            )
          ) + 1;

        db.users.push({
          user_id: newId,
          name: body.name,
          email: body.email,
          role: body.role,
          is_active: 1,
          created_at: "2026-11-05",
        });

        return HttpResponse.json(
          {
            success: true,
            message:
              "User created successfully.",
            data: {
              user_id: newId,
            },
          },
          { status: 201 }
        );
      }
    ),

    // PUT /users/:id
    http.put(
      `${API_BASE}/users/:id`,
      async ({ request, params }) => {
        const body = await request.json();
        const path = `/users/${params.id}`;

        record("PUT", path, request, body);

        const user = db.users.find(
          (item) =>
            String(item.user_id) ===
            String(params.id)
        );

        if (!user) {
          return HttpResponse.json(
            {
              success: false,
              message: "User not found.",
            },
            { status: 404 }
          );
        }

        user.name = body.name;
        user.email = body.email;

        return HttpResponse.json({
          success: true,
          message:
            "User updated successfully.",
        });
      }
    ),

    // PATCH /users/:id/deactivate
    http.patch(
      `${API_BASE}/users/:id/deactivate`,
      ({ request, params }) => {
        const path =
          `/users/${params.id}/deactivate`;

        record("PATCH", path, request);

        const user = db.users.find(
          (item) =>
            String(item.user_id) ===
            String(params.id)
        );

        if (!user) {
          return HttpResponse.json(
            {
              success: false,
              message: "User not found.",
            },
            { status: 404 }
          );
        }

        user.is_active = 0;

        return HttpResponse.json({
          success: true,
          message:
            "User deactivated successfully.",
        });
      }
    ),

    // PATCH /users/:id/restore
    http.patch(
      `${API_BASE}/users/:id/restore`,
      ({ request, params }) => {
        const path =
          `/users/${params.id}/restore`;

        record("PATCH", path, request);

        const user = db.users.find(
          (item) =>
            String(item.user_id) ===
            String(params.id)
        );

        if (!user) {
          return HttpResponse.json(
            {
              success: false,
              message: "User not found.",
            },
            { status: 404 }
          );
        }

        user.is_active = 1;

        return HttpResponse.json({
          success: true,
          message:
            "User restored successfully.",
        });
      }
    )
  );

  return {
    db,
    requests,

    count(method, path) {
      return requests.filter(
        (item) =>
          item.method === method &&
          item.path === path
      ).length;
    },

    find(method, path) {
      return requests.find(
        (item) =>
          item.method === method &&
          item.path === path
      );
    },
  };
}

// ============================================
// 4. REAL AUTHENTICATION AND ROUTING
// ============================================

function TestRoutes({
  role = "Admin",
  autoLogin = true,
}) {
  const {
    login,
    isAuthenticated,
    user,
  } = useAuth();

  const [ready, setReady] = useState(
    !autoLogin
  );

  useEffect(() => {
    if (!autoLogin) return;

    login({
      token: testToken(),
      user: {
        user_id: 1,
        name: "Admin One",
        email: "admin@example.com",
        role,
      },
    });

    setReady(true);
  }, [login, role, autoLogin]);

  return (
    <>
      <output data-testid="auth-state">
        {isAuthenticated
          ? "authenticated"
          : "guest"}
      </output>

      <output data-testid="current-user-name">
        {user?.name ?? "guest"}
      </output>

      <output data-testid="current-user-email">
        {user?.email ?? ""}
      </output>

      {ready && (
        <Routes>
          <Route
            path="/login"
            element={
              <h1>Login required</h1>
            }
          />

          <Route
            path="/forbidden"
            element={
              <h1>Access denied</h1>
            }
          />

          <Route
            element={<ProtectedRoute />}
          >
            <Route
              element={
                <ProtectedRoute
                  allowedRoles={["Admin"]}
                />
              }
            >
              <Route
                path="/users"
                element={<Users />}
              />
            </Route>
          </Route>
        </Routes>
      )}
    </>
  );
}

function renderPage({
  role = "Admin",
  autoLogin = true,
} = {}) {
  return render(
    <MemoryRouter
      initialEntries={["/users"]}
    >
      <AuthProvider>
        <TestRoutes
          role={role}
          autoLogin={autoLogin}
        />
      </AuthProvider>
    </MemoryRouter>
  );
}

// ============================================
// 5. REUSABLE HELPERS
// ============================================

async function loadUsers() {
  renderPage();

  return screen.findByRole("row", {
    name: /Admin One/i,
  });
}

function userRow(name) {
  return screen.getByRole("row", {
    name: new RegExp(name, "i"),
  });
}

function tableRows() {
  return within(
    screen.getByRole("table")
  )
    .getAllByRole("row")
    .slice(1);
}

function searchUsers(value) {
  fireEvent.change(
    screen.getByRole("searchbox", {
      name: "Search users",
    }),
    {
      target: { value },
    }
  );
}

function filterUsers(name, value) {
  fireEvent.change(
    screen.getByRole("combobox", {
      name,
    }),
    {
      target: { value },
    }
  );
}

function reloadUsers() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "Reload users",
    })
  );
}

function summary() {
  return screen.getByRole("group", {
    name: "Summary before filtering",
  });
}

function getDialog() {
  return screen.getByRole("dialog");
}

function modalButton(name) {
  return within(getDialog()).getByRole(
    "button",
    {
      name,
      exact: true,
    }
  );
}

function changeField(label, value) {
  fireEvent.change(
    within(getDialog()).getByLabelText(
      label
    ),
    {
      target: {
        value: String(value),
      },
    }
  );
}

function openCreate() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "Create User",
    })
  );

  return screen.getByRole("dialog", {
    name: "Create user",
  });
}

function fillCreateForm({
  name = "  New Customer  ",
  email = "  new@example.com  ",
  password = "StrongPass123!",
  confirmPassword = "StrongPass123!",
  role = "Customer",
} = {}) {
  changeField("Full name", name);
  changeField("Email address", email);
  changeField("Initial password", password);
  changeField(
    "Confirm password",
    confirmPassword
  );
  changeField("Account role", role);
}

function submitCreate() {
  fireEvent.click(modalButton("Create User"));
}

function openEdit(name) {
  fireEvent.click(
    screen.getByRole("button", {
      name: `Edit ${name}`,
    })
  );

  return screen.getByRole("dialog", {
    name: "Edit user",
  });
}

function fillEditForm({
  name,
  email,
} = {}) {
  if (name !== undefined) {
    changeField("Full name", name);
  }

  if (email !== undefined) {
    changeField("Email address", email);
  }
}

function openAction(action, name) {
  fireEvent.click(
    screen.getByRole("button", {
      name: `${action} ${name}`,
    })
  );

  return screen.getByRole("dialog", {
    name:
      action === "Deactivate"
        ? "Deactivate account"
        : "Restore account",
  });
}

function submitAction(action) {
  fireEvent.click(modalButton(action));
}

function closeModal() {
  fireEvent.click(modalButton("Cancel"));
}

// ============================================
// 6. TEST LIFECYCLE
// ============================================

beforeAll(async () => {
  vi.stubEnv(
    "VITE_API_BASE_URL",
    API_BASE
  );

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

  ({ default: Users } =
    await import(
      "../../pages/users/Users.jsx"
    ));

  server.listen({
    onUnhandledRequest: "error",
  });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

// ============================================
// 7. GET USERS INTEGRATION
// ============================================

describe("Users - GET Integration", () => {
  test("1. loads users through real service with JWT", async () => {
    const api = installUserApi();

    await loadUsers();

    expect(tableRows()).toHaveLength(5);

    expect(
      userRow("Bina Pharmacist")
    ).toBeInTheDocument();

    expect(
      userRow("Chandra Customer")
    ).toBeInTheDocument();

    expect(
      userRow("Dinesh Inactive")
    ).toBeInTheDocument();

    const request = api.find(
      "GET",
      "/users"
    );

    expect(request.authorization).toMatch(
      /^Bearer \S+$/
    );

    expect(request.accept).toBe(
      "application/json"
    );

    expect(api.count("GET", "/users")).toBe(1);
  });

  test("2. normalizes string, number and boolean active states", async () => {
    installUserApi();

    await loadUsers();

    expect(
      within(
        userRow("Admin One")
      ).getByText("Active")
    ).toBeInTheDocument();

    expect(
      within(
        userRow("Bina Pharmacist")
      ).getByText("Active")
    ).toBeInTheDocument();

    expect(
      within(
        userRow("Chandra Customer")
      ).getByText("Active")
    ).toBeInTheDocument();

    expect(
      within(
        userRow("Dinesh Inactive")
      ).getByText("Inactive")
    ).toBeInTheDocument();
  });

  test("3. identifies the currently signed-in Admin", async () => {
    installUserApi();

    await loadUsers();

    expect(
      within(
        userRow("Admin One")
      ).getByText("You")
    ).toBeInTheDocument();

    expect(
      within(
        userRow("Bina Pharmacist")
      ).queryByText("You")
    ).not.toBeInTheDocument();
  });

 
test("4. shows summary counts before filtering", async () => {
  installUserApi();

  await loadUsers();

  expect(summary()).toHaveTextContent(/5\s*total/);

  expect(summary()).toHaveTextContent(/4\s*active/);

  expect(summary()).toHaveTextContent(/1\s*inactive/);
});


  test("5. shows loading while GET is pending", async () => {
    let release;

    const pending = new Promise(
      (resolve) => {
        release = resolve;
      }
    );

    server.use(
      http.get(
        `${API_BASE}/users`,
        async () => {
          await pending;

          return HttpResponse.json({
            success: true,
            data: initialUsers(),
          });
        }
      )
    );

    renderPage();

    expect(
      (
        await screen.findAllByText(
          "Loading users..."
        )
      ).length
    ).toBeGreaterThan(0);

    expect(
      screen.getByRole("button", {
        name: "Reload users",
      })
    ).toBeDisabled();

    await act(async () => {
      release();
    });

    expect(
      await screen.findByRole("row", {
        name: /Admin One/i,
      })
    ).toBeInTheDocument();
  });

  test("6. displays empty users list", async () => {
    installUserApi({ users: [] });

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "No users found",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Use Create User to add an account."
      )
    ).toBeInTheDocument();
  });

  test("7. treats expected HTTP 404 as empty users", async () => {
    server.use(
      http.get(
        `${API_BASE}/users`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "No users found.",
            },
            { status: 404 }
          )
      )
    );

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "No users found",
      })
    ).toBeInTheDocument();
  });

  test("8. preserves unexpected HTTP 404 as an error", async () => {
    server.use(
      http.get(
        `${API_BASE}/users`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Route not found.",
            },
            { status: 404 }
          )
      )
    );

    renderPage();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Route not found."
    );
  });

  test("9. rejects non-array users data", async () => {
    server.use(
      http.get(
        `${API_BASE}/users`,
        () =>
          HttpResponse.json({
            success: true,
            data: {},
          })
      )
    );

    renderPage();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "The server returned an invalid users list."
    );
  });

  test("10. rejects missing users data", async () => {
    server.use(
      http.get(
        `${API_BASE}/users`,
        () =>
          HttpResponse.json({
            success: true,
          })
      )
    );

    renderPage();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "The server returned an invalid users list."
    );
  });

  test("11. handles success:false with HTTP 200", async () => {
    server.use(
      http.get(
        `${API_BASE}/users`,
        () =>
          HttpResponse.json({
            success: false,
            message:
              "Unable to load users.",
          })
      )
    );

    renderPage();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to load users."
    );
  });

  test("12. handles invalid JSON from backend", async () => {
    server.use(
      http.get(
        `${API_BASE}/users`,
        () =>
          HttpResponse.text(
            "not valid JSON",
            { status: 200 }
          )
      )
    );

    renderPage();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "The server returned an invalid response."
    );
  });

  test.each([500, 503])(
    "13. displays HTTP %s server errors",
    async (status) => {
      server.use(
        http.get(
          `${API_BASE}/users`,
          () =>
            HttpResponse.json(
              {
                success: false,
                message:
                  `User service error ${status}.`,
              },
              { status }
            )
        )
      );

      renderPage();

      expect(
        await screen.findByRole("alert")
      ).toHaveTextContent(
        `User service error ${status}.`
      );
    }
  );

  test("14. preserves session on HTTP 403", async () => {
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

    renderPage();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Access forbidden."
    );

    expect(
      screen.getByTestId("auth-state")
    ).toHaveTextContent(
      "authenticated"
    );
  });

  test("15. logs out after HTTP 401", async () => {
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

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByTestId("auth-state")
      ).toHaveTextContent("guest");
    });

    expect(
      await screen.findByRole("heading", {
        name: "Login required",
      })
    ).toBeInTheDocument();
  });

  test("16. displays network connection failures", async () => {
    server.use(
      http.get(
        `${API_BASE}/users`,
        () => HttpResponse.error()
      )
    );

    renderPage();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to connect to the server."
    );
  });

  test("17. retries successfully after temporary error", async () => {
    let attempts = 0;

    server.use(
      http.get(
        `${API_BASE}/users`,
        () => {
          attempts++;

          if (attempts === 1) {
            return HttpResponse.json(
              {
                success: false,
                message: "Temporary error.",
              },
              { status: 500 }
            );
          }

          return HttpResponse.json({
            success: true,
            data: initialUsers(),
          });
        }
      )
    );

    renderPage();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Temporary error."
    );

    reloadUsers();

    expect(
      await screen.findByRole("row", {
        name: /Admin One/i,
      })
    ).toBeInTheDocument();

    expect(attempts).toBe(2);
  });

  test("18. refreshes newly returned user data", async () => {
    const api = installUserApi();

    await loadUsers();

    api.db.users.push({
      user_id: 6,
      name: "New Employee",
      email: "employee@example.com",
      role: "Pharmacist",
      is_active: 1,
      created_at: "2026-11-05",
    });

    reloadUsers();

    expect(
      await screen.findByRole("row", {
        name: /New Employee/i,
      })
    ).toBeInTheDocument();

    expect(
      api.count("GET", "/users")
    ).toBe(2);
  });
});

// ============================================
// 8. SEARCH, FILTERS AND SORTING
// ============================================

describe("Users - Filters and Sorting", () => {
  test("19. searches by name without refetching", async () => {
    const api = installUserApi();

    await loadUsers();

    searchUsers("  bInA  ");

    expect(
      userRow("Bina Pharmacist")
    ).toBeInTheDocument();

    expect(tableRows()).toHaveLength(1);

    expect(
      api.count("GET", "/users")
    ).toBe(1);
  });

  test("20. searches by email", async () => {
    installUserApi();

    await loadUsers();

    searchUsers("chandra@example.com");

    expect(
      userRow("Chandra Customer")
    ).toBeInTheDocument();

    expect(tableRows()).toHaveLength(1);
  });

  test.each([
    ["Admin", 1],
    ["Pharmacist", 1],
    ["Customer", 3],
  ])(
    "21. filters %s accounts",
    async (role, expected) => {
      const api = installUserApi();

      await loadUsers();

      filterUsers("Role", role);

      expect(
        tableRows()
      ).toHaveLength(expected);

      expect(
        api.count("GET", "/users")
      ).toBe(1);
    }
  );

  test("22. filters active accounts", async () => {
    installUserApi();

    await loadUsers();

    filterUsers("Status", "Active");

    expect(tableRows()).toHaveLength(4);

    expect(
      screen.queryByRole("row", {
        name: /Dinesh Inactive/i,
      })
    ).not.toBeInTheDocument();
  });

  test("23. filters inactive accounts", async () => {
    installUserApi();

    await loadUsers();

    filterUsers("Status", "Inactive");

    expect(tableRows()).toHaveLength(1);

    expect(
      userRow("Dinesh Inactive")
    ).toBeInTheDocument();
  });

  test("24. combines name, role and status", async () => {
    installUserApi();

    await loadUsers();

    searchUsers("Dinesh");
    filterUsers("Role", "Customer");
    filterUsers("Status", "Inactive");

    expect(
      userRow("Dinesh Inactive")
    ).toBeInTheDocument();

    expect(tableRows()).toHaveLength(1);
  });

  test("25. displays no matching users", async () => {
    installUserApi();

    await loadUsers();

    searchUsers("unknown-user-999");

    expect(
      screen.getByRole("heading", {
        name: "No matching users",
      })
    ).toBeInTheDocument();

    expect(
      screen.getAllByRole("button", {
        name: "Clear filters",
      })
    ).toHaveLength(2);
  });

  test("26. clears filters without requesting users again", async () => {
    const api = installUserApi();

    await loadUsers();

    searchUsers("Dinesh");
    filterUsers("Status", "Inactive");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Clear filters",
      })
    );

    expect(tableRows()).toHaveLength(5);

    expect(
      screen.getByRole("searchbox", {
        name: "Search users",
      })
    ).toHaveValue("");

    expect(
      screen.getByRole("combobox", {
        name: "Status",
      })
    ).toHaveValue("All");

    expect(
      api.count("GET", "/users")
    ).toBe(1);
  });

  test("27. clears filters from empty state", async () => {
    installUserApi();

    await loadUsers();

    searchUsers("UNKNOWN");

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Clear filters",
      })[1]
    );

    expect(tableRows()).toHaveLength(5);
  });

  test("28. sorts names descending", async () => {
    installUserApi();

    await loadUsers();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Name: sort descending",
      })
    );

    expect(
      tableRows()[0]
    ).toHaveTextContent("Esha Customer");

    expect(
      tableRows()[4]
    ).toHaveTextContent("Admin One");
  });

  test("29. sorts emails alphabetically", async () => {
    installUserApi();

    await loadUsers();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Email: sort ascending",
      })
    );

    expect(
      tableRows()[0]
    ).toHaveTextContent(
      "admin@example.com"
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Email: sort descending",
      })
    );

    expect(
      tableRows()[0]
    ).toHaveTextContent(
      "esha@example.com"
    );
  });

  test("30. sorts accounts by role", async () => {
    installUserApi();

    await loadUsers();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Role: sort ascending",
      })
    );

    expect(
      tableRows()[0]
    ).toHaveTextContent("Admin One");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Role: sort descending",
      })
    );

    expect(
      tableRows()[0]
    ).toHaveTextContent(
      "Bina Pharmacist"
    );
  });

  test("31. sorts by creation date", async () => {
    installUserApi();

    await loadUsers();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Created: sort ascending",
      })
    );

    expect(
      tableRows()[0]
    ).toHaveTextContent("Admin One");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Created: sort descending",
      })
    );

    expect(
      tableRows()[0]
    ).toHaveTextContent(
      "Dinesh Inactive"
    );
  });

  test("32. keeps missing creation dates at bottom", async () => {
    installUserApi();

    await loadUsers();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Created: sort ascending",
      })
    );

    expect(
      tableRows()[4]
    ).toHaveTextContent("Esha Customer");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Created: sort descending",
      })
    );

    expect(
      tableRows()[4]
    ).toHaveTextContent("Esha Customer");
  });

  test("33. sorting and filtering stay client-side", async () => {
    const api = installUserApi();

    await loadUsers();

    searchUsers("Customer");
    filterUsers("Role", "Customer");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Email: sort ascending",
      })
    );

    expect(
      api.count("GET", "/users")
    ).toBe(1);
  });
});

// ============================================
// 9. CREATE USER INTEGRATION
// ============================================

describe("Users - POST Integration", () => {
  test("34. opens creation modal with default Customer role", async () => {
    installUserApi();

    await loadUsers();

    openCreate();

    expect(
      within(getDialog()).getByRole(
        "combobox",
        { name: "Account role" }
      )
    ).toHaveValue("Customer");

    expect(
      within(getDialog()).getByLabelText(
        "Initial password"
      )
    ).toHaveAttribute("type", "password");
  });

  test.each([
    "Customer",
    "Pharmacist",
    "Admin",
  ])(
    "35. creates a %s with correct POST payload",
    async (role) => {
      const api = installUserApi();

      await loadUsers();

      openCreate();

      fillCreateForm({
        role,
      });

      submitCreate();

      expect(
        await screen.findByRole("row", {
          name: /New Customer/i,
        })
      ).toBeInTheDocument();

      const request = api.find(
        "POST",
        "/users/register"
      );

      expect(request.body).toEqual({
        name: "New Customer",
        email: "new@example.com",
        password: "StrongPass123!",
        role,
      });

      expect(
        request.authorization
      ).toMatch(/^Bearer \S+$/);

      expect(
        request.contentType
      ).toContain("application/json");

      expect(
        within(
          userRow("New Customer")
        ).getByText(role)
      ).toBeInTheDocument();

      expect(
        api.count("GET", "/users")
      ).toBe(2);

      expect(
        screen.getByText(
          "User created successfully."
        )
      ).toBeInTheDocument();
    }
  );

  test("36. does not send confirmPassword to backend", async () => {
    const api = installUserApi();

    await loadUsers();

    openCreate();
    fillCreateForm();
    submitCreate();

    await screen.findByRole("row", {
      name: /New Customer/i,
    });

    expect(
      api.find(
        "POST",
        "/users/register"
      ).body
    ).not.toHaveProperty(
      "confirmPassword"
    );
  });

  test("37. validates all missing required fields", async () => {
    const api = installUserApi();

    await loadUsers();

    openCreate();
    submitCreate();

    expect(
      within(getDialog()).getByText(
        "Enter the user's full name."
      )
    ).toBeInTheDocument();

    expect(
      within(getDialog()).getByText(
        "Enter an email address."
      )
    ).toBeInTheDocument();

    expect(
      within(getDialog()).getByText(
        "Enter an initial password."
      )
    ).toBeInTheDocument();

    expect(
      within(getDialog()).getByText(
        "Confirm the password."
      )
    ).toBeInTheDocument();

    expect(
      api.count(
        "POST",
        "/users/register"
      )
    ).toBe(0);
  });

  test("38. rejects whitespace-only user name", async () => {
    const api = installUserApi();

    await loadUsers();

    openCreate();

    fillCreateForm({
      name: "   ",
    });

    submitCreate();

    expect(
      within(getDialog()).getByText(
        "Enter the user's full name."
      )
    ).toBeInTheDocument();

    expect(
      api.count(
        "POST",
        "/users/register"
      )
    ).toBe(0);
  });

  test("39. rejects invalid email", async () => {
    const api = installUserApi();

    await loadUsers();

    openCreate();

    fillCreateForm({
      email: "invalid-email",
    });

    submitCreate();

    expect(
      within(getDialog()).getByText(
        "Enter a valid email address."
      )
    ).toBeInTheDocument();

    expect(
      api.count(
        "POST",
        "/users/register"
      )
    ).toBe(0);
  });

  test("40. rejects mismatched passwords", async () => {
    const api = installUserApi();

    await loadUsers();

    openCreate();

    fillCreateForm({
      confirmPassword: "DifferentPass!",
    });

    submitCreate();

    expect(
      within(getDialog()).getByText(
        "Passwords do not match."
      )
    ).toBeInTheDocument();

    expect(
      api.count(
        "POST",
        "/users/register"
      )
    ).toBe(0);
  });

  test("41. rejects names longer than 100 characters", async () => {
    const api = installUserApi();

    await loadUsers();

    openCreate();

    fillCreateForm();

    // Programmatic change bypasses manual typing
    // limits, testing component validation.
    changeField(
      "Full name",
      "X".repeat(101)
    );

    submitCreate();

    expect(
      within(getDialog()).getByText(
        "Name must be 100 characters or fewer."
      )
    ).toBeInTheDocument();

    expect(
      api.count(
        "POST",
        "/users/register"
      )
    ).toBe(0);
  });

  test("42. toggles password visibility", async () => {
    installUserApi();

    await loadUsers();

    openCreate();

    const password = within(
      getDialog()
    ).getByLabelText(
      "Initial password"
    );

    expect(password).toHaveAttribute(
      "type",
      "password"
    );

    fireEvent.click(
      within(getDialog()).getByRole(
        "checkbox",
        { name: "Show passwords" }
      )
    );

    expect(password).toHaveAttribute(
      "type",
      "text"
    );

    expect(
      within(getDialog()).getByLabelText(
        "Confirm password"
      )
    ).toHaveAttribute("type", "text");
  });

  test("43. clears validation error when corrected", async () => {
    installUserApi();

    await loadUsers();

    openCreate();
    submitCreate();

    expect(
      within(getDialog()).getByText(
        "Enter the user's full name."
      )
    ).toBeInTheDocument();

    changeField(
      "Full name",
      "Valid Name"
    );

    expect(
      within(getDialog()).queryByText(
        "Enter the user's full name."
      )
    ).not.toBeInTheDocument();
  });

  test("44. cancels creation without POST", async () => {
    const api = installUserApi();

    await loadUsers();

    openCreate();
    fillCreateForm();
    closeModal();

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    expect(
      api.count(
        "POST",
        "/users/register"
      )
    ).toBe(0);
  });

  test("45. closes creation modal using header close", async () => {
    const api = installUserApi();

    await loadUsers();

    openCreate();

    fireEvent.click(
      within(getDialog()).getByRole(
        "button",
        { name: "Close create user dialog" }
      )
    );

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    expect(
      api.count(
        "POST",
        "/users/register"
      )
    ).toBe(0);
  });

  test("46. shows duplicate email HTTP 409", async () => {
    const api = installUserApi();

    await loadUsers();

    openCreate();

    fillCreateForm({
      email: "bina@example.com",
    });

    submitCreate();

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Email already registered."
    );

    expect(
      getDialog()
    ).toBeInTheDocument();

    expect(
      api.count("GET", "/users")
    ).toBe(1);
  });

  test("47. displays POST HTTP 500 failure", async () => {
    const api = installUserApi();

    server.use(
      http.post(
        `${API_BASE}/users/register`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message:
                "Unable to create user.",
            },
            { status: 500 }
          )
      )
    );

    await loadUsers();

    openCreate();
    fillCreateForm();
    submitCreate();

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Unable to create user."
    );

    expect(
      api.count("GET", "/users")
    ).toBe(1);
  });

  test("48. allows retry after failed POST", async () => {
    const api = installUserApi();

    let attempts = 0;

    server.use(
      http.post(
        `${API_BASE}/users/register`,
        async ({ request }) => {
          attempts++;

          if (attempts === 1) {
            return HttpResponse.json(
              {
                success: false,
                message:
                  "Temporary failure.",
              },
              { status: 500 }
            );
          }

          const body = await request.json();

          api.db.users.push({
            user_id: 6,
            name: body.name,
            email: body.email,
            role: body.role,
            is_active: 1,
            created_at: "2026-11-05",
          });

          return HttpResponse.json(
            {
              success: true,
              message: "User created.",
            },
            { status: 201 }
          );
        }
      )
    );

    await loadUsers();

    openCreate();
    fillCreateForm();
    submitCreate();

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Temporary failure."
    );

    submitCreate();

    expect(
      await screen.findByRole("row", {
        name: /New Customer/i,
      })
    ).toBeInTheDocument();

    expect(attempts).toBe(2);
  });

  test("49. prevents duplicate POST during submission", async () => {
    installUserApi();

    let release;
    let postCount = 0;

    const pending = new Promise(
      (resolve) => {
        release = resolve;
      }
    );

    server.use(
      http.post(
        `${API_BASE}/users/register`,
        async () => {
          postCount++;

          await pending;

          return HttpResponse.json(
            {
              success: true,
              message:
                "User created successfully.",
            },
            { status: 201 }
          );
        }
      )
    );

    await loadUsers();

    openCreate();
    fillCreateForm();
    submitCreate();

    await waitFor(() => {
      expect(postCount).toBe(1);
    });

    expect(
      modalButton("Creating...")
    ).toBeDisabled();

    expect(
      modalButton("Cancel")
    ).toBeDisabled();

    fireEvent.submit(
      getDialog().querySelector("form")
    );

    expect(postCount).toBe(1);

    await act(async () => {
      release();
    });

    expect(
      await screen.findByText(
        "User created successfully."
      )
    ).toBeInTheDocument();

    expect(postCount).toBe(1);
  });

  test("50. clears session on create HTTP 401", async () => {
    installUserApi();

    server.use(
      http.post(
        `${API_BASE}/users/register`,
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

    await loadUsers();

    openCreate();
    fillCreateForm();
    submitCreate();

    await waitFor(() => {
      expect(
        screen.getByTestId("auth-state")
      ).toHaveTextContent("guest");
    });

    expect(
      await screen.findByRole("heading", {
        name: "Login required",
      })
    ).toBeInTheDocument();
  });
});

// ============================================
// 10. EDIT USER - PUT
// ============================================

describe("Users - PUT Integration", () => {
  test("51. opens edit modal with existing details", async () => {
    installUserApi();

    await loadUsers();

    openEdit("Bina Pharmacist");

    expect(
      within(getDialog()).getByLabelText(
        "Full name"
      )
    ).toHaveValue("Bina Pharmacist");

    expect(
      within(getDialog()).getByLabelText(
        "Email address"
      )
    ).toHaveValue("bina@example.com");

    expect(
      within(getDialog()).getByText(
        "Role changes are not available."
      )
    ).toBeInTheDocument();

    expect(
      within(getDialog()).queryByRole(
        "combobox",
        { name: "Account role" }
      )
    ).not.toBeInTheDocument();
  });

  test("52. disables save when nothing changed", async () => {
    const api = installUserApi();

    await loadUsers();

    openEdit("Bina Pharmacist");

    expect(
      modalButton("Save Changes")
    ).toBeDisabled();

    expect(
      api.count(
        "PUT",
        "/users/2"
      )
    ).toBe(0);
  });

  test("53. updates name and email using PUT", async () => {
    const api = installUserApi();

    await loadUsers();

    openEdit("Bina Pharmacist");

    fillEditForm({
      name: "  Bina Updated  ",
      email: "  bina.new@example.com  ",
    });

    submitAction("Save Changes");

    expect(
      await screen.findByRole("row", {
        name: /Bina Updated/i,
      })
    ).toBeInTheDocument();

    const request = api.find(
      "PUT",
      "/users/2"
    );

    expect(request.body).toEqual({
      name: "Bina Updated",
      email: "bina.new@example.com",
    });

    expect(request.authorization).toMatch(
      /^Bearer \S+$/
    );

    expect(
      request.body
    ).not.toHaveProperty("role");

    expect(
      api.count("GET", "/users")
    ).toBe(2);

    expect(
      screen.getByText(
        "User updated successfully."
      )
    ).toBeInTheDocument();
  });

  
test("54. updates current Admin in auth context", async () => {
  const api = installUserApi();

  await loadUsers();

  openEdit("Admin One");

  fillEditForm({
    name: "Admin Updated",
    email: "updated-admin@example.com",
  });

  submitAction("Save Changes");

  // 1. Verify authenticated user's name is updated.
  await waitFor(() => {
    expect(
      screen.getByTestId("current-user-name")
    ).toHaveTextContent("Admin Updated");
  });

  // 2. Verify authenticated user's email is updated.
  expect(
    screen.getByTestId("current-user-email")
  ).toHaveTextContent(
    "updated-admin@example.com"
  );

  // 3. Wait for the refreshed users table.
  const updatedRow = await screen.findByRole("row", {
    name: /Admin Updated/i,
  });

  // 4. Verify Admin is still identified as current user.
  expect(updatedRow).toHaveTextContent("You");

  // 5. Verify the PUT request was sent exactly once.
  expect(
    api.count("PUT", "/users/1")
  ).toBe(1);

  // 6. Verify the users list was refreshed.
  expect(
    api.count("GET", "/users")
  ).toBe(2);
});


  test("55. editing another user does not change current session", async () => {
    installUserApi();

    await loadUsers();

    openEdit("Bina Pharmacist");

    fillEditForm({
      name: "Bina Changed",
    });

    submitAction("Save Changes");

    await screen.findByRole("row", {
      name: /Bina Changed/i,
    });

    expect(
      screen.getByTestId(
        "current-user-name"
      )
    ).toHaveTextContent("Admin One");
  });

  test("56. rejects empty name during edit", async () => {
    const api = installUserApi();

    await loadUsers();

    openEdit("Bina Pharmacist");

    fillEditForm({
      name: "   ",
    });

    submitAction("Save Changes");

    expect(
      within(getDialog()).getByText(
        "Enter the user's full name."
      )
    ).toBeInTheDocument();

    expect(
      api.count(
        "PUT",
        "/users/2"
      )
    ).toBe(0);
  });

  test("57. rejects invalid edited email", async () => {
    const api = installUserApi();

    await loadUsers();

    openEdit("Bina Pharmacist");

    fillEditForm({
      email: "not-an-email",
    });

    submitAction("Save Changes");

    expect(
      within(getDialog()).getByText(
        "Enter a valid email address."
      )
    ).toBeInTheDocument();

    expect(
      api.count(
        "PUT",
        "/users/2"
      )
    ).toBe(0);
  });

  test("58. prevents editing inactive accounts", async () => {
    const api = installUserApi();

    await loadUsers();

    expect(
      screen.getByRole("button", {
        name: "Edit Dinesh Inactive",
      })
    ).toBeDisabled();

    expect(
      userRow("Dinesh Inactive")
    ).toHaveTextContent(
      "Restore before editing."
    );

    expect(
      api.count(
        "PUT",
        "/users/4"
      )
    ).toBe(0);
  });

  test("59. canceling edit makes no PUT request", async () => {
    const api = installUserApi();

    await loadUsers();

    openEdit("Bina Pharmacist");

    fillEditForm({
      name: "Should Not Save",
    });

    closeModal();

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    expect(
      api.count(
        "PUT",
        "/users/2"
      )
    ).toBe(0);
  });

  test("60. handles duplicate email PUT error", async () => {
    const api = installUserApi();

    server.use(
      http.put(
        `${API_BASE}/users/:id`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Email already exists.",
            },
            { status: 409 }
          )
      )
    );

    await loadUsers();

    openEdit("Bina Pharmacist");

    fillEditForm({
      email: "admin@example.com",
    });

    submitAction("Save Changes");

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Email already exists."
    );

    expect(
      userRow("Bina Pharmacist")
    ).toBeInTheDocument();

    expect(
      api.count("GET", "/users")
    ).toBe(1);
  });

  test("61. handles PUT HTTP 500 without changing user", async () => {
    const api = installUserApi();

    server.use(
      http.put(
        `${API_BASE}/users/:id`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message:
                "Unable to update user.",
            },
            { status: 500 }
          )
      )
    );

    await loadUsers();

    openEdit("Bina Pharmacist");

    fillEditForm({
      name: "Bina Failed",
    });

    submitAction("Save Changes");

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Unable to update user."
    );

    expect(
      userRow("Bina Pharmacist")
    ).toBeInTheDocument();

    expect(
      api.count("GET", "/users")
    ).toBe(1);
  });

  test("62. prevents duplicate PUT submissions", async () => {
    installUserApi();

    let release;
    let putCount = 0;

    const pending = new Promise(
      (resolve) => {
        release = resolve;
      }
    );

    server.use(
      http.put(
        `${API_BASE}/users/:id`,
        async () => {
          putCount++;

          await pending;

          return HttpResponse.json({
            success: true,
            message: "User updated.",
          });
        }
      )
    );

    await loadUsers();

    openEdit("Bina Pharmacist");

    fillEditForm({
      name: "Bina Updated",
    });

    submitAction("Save Changes");

    await waitFor(() => {
      expect(putCount).toBe(1);
    });

    expect(
      modalButton("Saving...")
    ).toBeDisabled();

    expect(
      modalButton("Cancel")
    ).toBeDisabled();

    fireEvent.submit(
      getDialog().querySelector("form")
    );

    expect(putCount).toBe(1);

    await act(async () => {
      release();
    });

    expect(
      await screen.findByText(
        "User updated."
      )
    ).toBeInTheDocument();

    expect(putCount).toBe(1);
  });
});

// ============================================
// 11. DEACTIVATE USER
// ============================================

describe("Users - Deactivation Integration", () => {
  test("63. deactivates user and refreshes table", async () => {
    const api = installUserApi();

    await loadUsers();

    openAction(
      "Deactivate",
      "Bina Pharmacist"
    );

    expect(
      getDialog()
    ).toHaveTextContent(
      "The user will not be able to sign in again"
    );

    submitAction("Deactivate");

    await waitFor(() => {
      expect(
        within(
          userRow("Bina Pharmacist")
        ).getByText("Inactive")
      ).toBeInTheDocument();
    });

    expect(
      api.count(
        "PATCH",
        "/users/2/deactivate"
      )
    ).toBe(1);

    expect(
      api.find(
        "PATCH",
        "/users/2/deactivate"
      ).authorization
    ).toMatch(/^Bearer \S+$/);

    expect(
      api.count("GET", "/users")
    ).toBe(2);
  });

  test("64. prevents Admin from deactivating self", async () => {
    const api = installUserApi();

    await loadUsers();

    expect(
      within(
        userRow("Admin One")
      ).queryByRole("button", {
        name: "Deactivate Admin One",
      })
    ).not.toBeInTheDocument();

    expect(
      within(
        userRow("Admin One")
      ).getByRole("button", {
        name: "Edit Admin One",
      })
    ).toBeEnabled();

    expect(
      api.count(
        "PATCH",
        "/users/1/deactivate"
      )
    ).toBe(0);
  });

  test("65. canceling deactivation sends no PATCH", async () => {
    const api = installUserApi();

    await loadUsers();

    openAction(
      "Deactivate",
      "Bina Pharmacist"
    );

    closeModal();

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    expect(
      api.count(
        "PATCH",
        "/users/2/deactivate"
      )
    ).toBe(0);
  });

  test("66. failed deactivation preserves active state", async () => {
    const api = installUserApi();

    server.use(
      http.patch(
        `${API_BASE}/users/:id/deactivate`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message:
                "User cannot be deactivated.",
            },
            { status: 409 }
          )
      )
    );

    await loadUsers();

    openAction(
      "Deactivate",
      "Bina Pharmacist"
    );

    submitAction("Deactivate");

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "User cannot be deactivated."
    );

    expect(
      within(
        userRow("Bina Pharmacist")
      ).getByText("Active")
    ).toBeInTheDocument();

    expect(
      api.count("GET", "/users")
    ).toBe(1);
  });

  test("67. prevents duplicate deactivation PATCH", async () => {
    installUserApi();

    let release;
    let patchCount = 0;

    const pending = new Promise(
      (resolve) => {
        release = resolve;
      }
    );

    server.use(
      http.patch(
        `${API_BASE}/users/:id/deactivate`,
        async () => {
          patchCount++;

          await pending;

          return HttpResponse.json({
            success: true,
            message: "User deactivated.",
          });
        }
      )
    );

    await loadUsers();

    openAction(
      "Deactivate",
      "Bina Pharmacist"
    );

    submitAction("Deactivate");

    await waitFor(() => {
      expect(patchCount).toBe(1);
    });

    expect(
      modalButton("Saving...")
    ).toBeDisabled();

    fireEvent.submit(
      getDialog().querySelector("form")
    );

    expect(patchCount).toBe(1);

    await act(async () => {
      release();
    });

    expect(
      await screen.findByText(
        "User deactivated."
      )
    ).toBeInTheDocument();

    expect(patchCount).toBe(1);
  });
});

// ============================================
// 12. RESTORE USER
// ============================================

describe("Users - Restoration Integration", () => {
  test("68. restores an inactive account", async () => {
    const api = installUserApi();

    await loadUsers();

    openAction(
      "Restore",
      "Dinesh Inactive"
    );

    expect(
      getDialog()
    ).toHaveTextContent(
      "The user will be able to sign in again."
    );

    submitAction("Restore");

    await waitFor(() => {
      expect(
        within(
          userRow("Dinesh Inactive")
        ).getByText("Active")
      ).toBeInTheDocument();
    });

    expect(
      api.count(
        "PATCH",
        "/users/4/restore"
      )
    ).toBe(1);

    expect(
      screen.getByRole("button", {
        name: "Edit Dinesh Inactive",
      })
    ).toBeEnabled();

    expect(
      api.count("GET", "/users")
    ).toBe(2);
  });

  test("69. canceling restoration sends no PATCH", async () => {
    const api = installUserApi();

    await loadUsers();

    openAction(
      "Restore",
      "Dinesh Inactive"
    );

    closeModal();

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    expect(
      api.count(
        "PATCH",
        "/users/4/restore"
      )
    ).toBe(0);
  });

  test("70. failed restoration keeps user inactive", async () => {
    const api = installUserApi();

    server.use(
      http.patch(
        `${API_BASE}/users/:id/restore`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message:
                "User cannot be restored.",
            },
            { status: 500 }
          )
      )
    );

    await loadUsers();

    openAction(
      "Restore",
      "Dinesh Inactive"
    );

    submitAction("Restore");

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "User cannot be restored."
    );

    expect(
      within(
        userRow("Dinesh Inactive")
      ).getByText("Inactive")
    ).toBeInTheDocument();

    expect(
      api.count("GET", "/users")
    ).toBe(1);
  });

  test("71. restoring preserves user name, email and role", async () => {
    installUserApi();

    await loadUsers();

    openAction(
      "Restore",
      "Dinesh Inactive"
    );

    submitAction("Restore");

    await waitFor(() => {
      expect(
        within(
          userRow("Dinesh Inactive")
        ).getByText("Active")
      ).toBeInTheDocument();
    });

    const row = userRow("Dinesh Inactive");

    expect(row).toHaveTextContent(
      "dinesh@example.com"
    );

    expect(row).toHaveTextContent(
      "Customer"
    );
  });
});

// ============================================
// 13. ROUTE PERMISSIONS
// ============================================

describe("Users - Route Permissions", () => {
  test("72. allows Admin to access Users page", async () => {
    const api = installUserApi();

    renderPage({
      role: "Admin",
    });

    expect(
      await screen.findByRole("heading", {
        name: "Users",
      })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        api.count("GET", "/users")
      ).toBe(1);
    });
  });

  test.each([
    "Pharmacist",
    "Customer",
  ])(
    "73. denies %s access to Users page",
    async (role) => {
      const api = installUserApi();

      renderPage({
        role,
      });

      expect(
        await screen.findByRole("heading", {
          name: "Access denied",
        })
      ).toBeInTheDocument();

      expect(
        api.requests
      ).toHaveLength(0);
    }
  );

  test("74. redirects unauthenticated users to login", async () => {
    const api = installUserApi();

    renderPage({
      autoLogin: false,
    });

    expect(
      await screen.findByRole("heading", {
        name: "Login required",
      })
    ).toBeInTheDocument();

    expect(
      api.requests
    ).toHaveLength(0);
  });
});
