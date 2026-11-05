
import { useEffect } from "react";

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

import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";

// ============================================
// 1. API CONFIGURATION
// ============================================

const API_BASE = "http://127.0.0.1:4179/api";

let AuthProvider;
let useAuth;
let Manufacturers;

// ============================================
// 2. TEST DATA
// ============================================

function initialManufacturers() {
  return [
    {
      manufacturer_id: 1,
      name: "ABC Pharma",
      is_active: 1,
      created_at: "2026-10-01",
    },
    {
      manufacturer_id: 2,
      name: "XYZ Labs",
      is_active: 0,
      created_at: "2026-10-02",
    },
  ];
}

// ============================================
// 3. JWT GENERATION
// ============================================

function createTestToken() {
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
// 4. REAL AUTHENTICATION WRAPPER
// ============================================

function AuthenticatedPage({ role = "Admin" }) {
  const { login, isAuthenticated } = useAuth();

  useEffect(() => {
    login({
      token: createTestToken(),
      user: {
        user_id: 1,
        name: "Test User",
        email: "user@example.com",
        role,
      },
    });
  }, [login, role]);

  return (
    <>
      <span data-testid="auth-state">
        {isAuthenticated ? "authenticated" : "guest"}
      </span>

      {isAuthenticated && <Manufacturers />}
    </>
  );
}

function renderPage(role = "Admin") {
  return render(
    <AuthProvider>
      <AuthenticatedPage role={role} />
    </AuthProvider>
  );
}

// ============================================
// 5. MOCK BACKEND WITH IN-MEMORY RECORDS
// ============================================

function installManufacturerApi(
  initial = initialManufacturers()
) {
  const records = initial.map((item) => ({
    ...item,
  }));

  const requests = [];

  let getCount = 0;

  // GET /manufacturers
  server.use(
    http.get(
      `${API_BASE}/manufacturers`,
      ({ request }) => {
        getCount += 1;

        requests.push({
          method: "GET",
          authorization:
            request.headers.get("authorization"),
          accept:
            request.headers.get("accept"),
        });

        return HttpResponse.json({
          success: true,
          data: records.map((item) => ({
            ...item,
          })),
        });
      }
    ),

    // POST /manufacturers
    http.post(
      `${API_BASE}/manufacturers`,
      async ({ request }) => {
        const body = await request.json();

        requests.push({
          method: "POST",
          authorization:
            request.headers.get("authorization"),
          contentType:
            request.headers.get("content-type"),
          body,
        });

        const newId =
          Math.max(
            0,
            ...records.map(
              (item) => Number(item.manufacturer_id)
            )
          ) + 1;

        records.push({
          manufacturer_id: newId,
          name: body.name,
          is_active: 1,
          created_at: "2026-10-10",
        });

        return HttpResponse.json(
          {
            success: true,
            message:
              "Manufacturer created successfully.",
            data: {
              manufacturer_id: newId,
            },
          },
          { status: 201 }
        );
      }
    ),

    // PUT /manufacturers/:id
    http.put(
      `${API_BASE}/manufacturers/:id`,
      async ({ request, params }) => {
        const body = await request.json();
        const id = Number(params.id);

        requests.push({
          method: "PUT",
          id,
          body,
        });

        const manufacturer = records.find(
          (item) => item.manufacturer_id === id
        );

        if (!manufacturer) {
          return HttpResponse.json(
            {
              success: false,
              message: "Manufacturer not found.",
            },
            { status: 404 }
          );
        }

        manufacturer.name = body.name;

        return HttpResponse.json({
          success: true,
          message: "Manufacturer updated successfully.",
        });
      }
    ),

    // PATCH /manufacturers/:id/deactivate
    http.patch(
      `${API_BASE}/manufacturers/:id/deactivate`,
      ({ params }) => {
        const id = Number(params.id);

        requests.push({
          method: "PATCH_DEACTIVATE",
          id,
        });

        const manufacturer = records.find(
          (item) => item.manufacturer_id === id
        );

        if (!manufacturer) {
          return HttpResponse.json(
            {
              success: false,
              message: "Manufacturer not found.",
            },
            { status: 404 }
          );
        }

        manufacturer.is_active = 0;

        return HttpResponse.json({
          success: true,
          message: "Manufacturer deactivated.",
        });
      }
    ),

    // PATCH /manufacturers/:id/restore
    http.patch(
      `${API_BASE}/manufacturers/:id/restore`,
      ({ params }) => {
        const id = Number(params.id);

        requests.push({
          method: "PATCH_RESTORE",
          id,
        });

        const manufacturer = records.find(
          (item) => item.manufacturer_id === id
        );

        if (!manufacturer) {
          return HttpResponse.json(
            {
              success: false,
              message: "Manufacturer not found.",
            },
            { status: 404 }
          );
        }

        manufacturer.is_active = 1;

        return HttpResponse.json({
          success: true,
          message: "Manufacturer restored.",
        });
      }
    )
  );

  return {
    records,
    requests,
    get getCount() {
      return getCount;
    },
  };
}

// ============================================
// 6. UI HELPERS
// ============================================

async function renderLoadedPage(role = "Admin") {
  renderPage(role);

  return screen.findByRole("row", {
    name: /ABC Pharma/i,
  });
}

function getDialog() {
  return screen.getByRole("dialog");
}

function changeManufacturerName(name) {
  fireEvent.change(
    within(getDialog()).getByRole("textbox", {
      name: "Manufacturer name",
    }),
    {
      target: { value: name },
    }
  );
}

function clickDialogButton(name) {
  fireEvent.click(
    within(getDialog()).getByRole("button", {
      name,
      exact: true,
    })
  );
}

function getManufacturerRow(name) {
  return screen.getByRole("row", {
    name: new RegExp(name, "i"),
  });
}

function openCreateModal() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "Add Manufacturer",
    })
  );
}

function openEditModal(name) {
  fireEvent.click(
    screen.getByRole("button", {
      name: `Edit ${name}`,
    })
  );
}

// ============================================
// 7. SETUP AND CLEANUP
// ============================================

beforeAll(async () => {
  vi.stubEnv(
    "VITE_API_BASE_URL",
    API_BASE
  );

  ({ default: AuthProvider } =
    await import("../../context/AuthProvider.jsx"));

  ({ default: useAuth } =
    await import("../../hooks/useAuth.js"));

  ({ default: Manufacturers } =
    await import(
      "../../pages/manufacturers/Manufacturers.jsx"
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
// 8. GET MANUFACTURERS INTEGRATION
// ============================================

describe("Manufacturers - GET Integration", () => {
  test("1. loads manufacturers through real services and sends JWT", async () => {
    const api = installManufacturerApi();

    await renderLoadedPage();

    expect(
      getManufacturerRow("ABC Pharma")
    ).toBeInTheDocument();

    expect(
      getManufacturerRow("XYZ Labs")
    ).toBeInTheDocument();

    expect(
      within(
        getManufacturerRow("ABC Pharma")
      ).getByText("Active")
    ).toBeInTheDocument();

    expect(
      within(
        getManufacturerRow("XYZ Labs")
      ).getByText("Inactive")
    ).toBeInTheDocument();

    expect(api.requests[0]).toMatchObject({
      method: "GET",
      accept: "application/json",
    });

    expect(
      api.requests[0].authorization
    ).toMatch(/^Bearer \S+$/);
  });

  test("2. shows loading state while waiting for the backend", async () => {
    let releaseRequest;

    const pending = new Promise((resolve) => {
      releaseRequest = resolve;
    });

    server.use(
      http.get(
        `${API_BASE}/manufacturers`,
        async () => {
          await pending;

          return HttpResponse.json({
            success: true,
            data: initialManufacturers(),
          });
        }
      )
    );

    renderPage();

    expect(
      (
        await screen.findAllByText(
          "Loading manufacturers..."
        )
      ).length
    ).toBeGreaterThan(0);

    await act(async () => {
      releaseRequest();
    });

    expect(
      await screen.findByRole("row", {
        name: /ABC Pharma/i,
      })
    ).toBeInTheDocument();
  });

  test("3. displays empty state for expected HTTP 404", async () => {
    server.use(
      http.get(
        `${API_BASE}/manufacturers`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "No manufacturers found.",
            },
            { status: 404 }
          )
      )
    );

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "No manufacturers found",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Manufacturers will appear here once added."
      )
    ).toBeInTheDocument();
  });

  test("4. rejects invalid manufacturer list returned by backend", async () => {
    server.use(
      http.get(
        `${API_BASE}/manufacturers`,
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
      "The server returned an invalid manufacturers list."
    );
  });

  test("5. handles HTTP 200 response with success false", async () => {
    server.use(
      http.get(
        `${API_BASE}/manufacturers`,
        () =>
          HttpResponse.json({
            success: false,
            message: "Unable to fetch manufacturers.",
          })
      )
    );

    renderPage();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to fetch manufacturers."
    );
  });

  test("6. displays HTTP 500 backend errors", async () => {
    server.use(
      http.get(
        `${API_BASE}/manufacturers`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Database unavailable.",
            },
            { status: 500 }
          )
      )
    );

    renderPage();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Database unavailable."
    );
  });

  test("7. displays HTTP 403 without logging out", async () => {
    server.use(
      http.get(
        `${API_BASE}/manufacturers`,
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
    ).toHaveTextContent("authenticated");
  });

  test("8. logs out user when API returns HTTP 401", async () => {
    server.use(
      http.get(
        `${API_BASE}/manufacturers`,
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
  });

  test("9. shows network connection errors", async () => {
    server.use(
      http.get(
        `${API_BASE}/manufacturers`,
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

  test("10. retries successfully after an initial server error", async () => {
    let calls = 0;

    server.use(
      http.get(
        `${API_BASE}/manufacturers`,
        () => {
          calls += 1;

          if (calls === 1) {
            return HttpResponse.json(
              {
                success: false,
                message: "Temporary server error.",
              },
              { status: 500 }
            );
          }

          return HttpResponse.json({
            success: true,
            data: initialManufacturers(),
          });
        }
      )
    );

    renderPage();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Temporary server error."
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reload manufacturers",
      })
    );

    expect(
      await screen.findByRole("row", {
        name: /ABC Pharma/i,
      })
    ).toBeInTheDocument();

    expect(calls).toBe(2);

    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });
});

// ============================================
// 9. FILTERS, SORTING AND RELOAD
// ============================================

describe("Manufacturers - UI and API Integration", () => {
  test("11. reloads manufacturer data after clicking refresh", async () => {
    const api = installManufacturerApi();

    await renderLoadedPage();

    api.records.push({
      manufacturer_id: 3,
      name: "North Pharma",
      is_active: 1,
      created_at: "2026-10-03",
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reload manufacturers",
      })
    );

    expect(
      await screen.findByRole("row", {
        name: /North Pharma/i,
      })
    ).toBeInTheDocument();

    expect(api.getCount).toBe(2);
  });

  test("12. searches and filters API-loaded manufacturer data", async () => {
    const api = installManufacturerApi();

    await renderLoadedPage();

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search manufacturers",
      }),
      {
        target: { value: "  xyz  " },
      }
    );

    fireEvent.change(
      screen.getByRole("combobox", {
        name: "Status",
      }),
      {
        target: { value: "Inactive" },
      }
    );

    expect(
      getManufacturerRow("XYZ Labs")
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("row", {
        name: /ABC Pharma/i,
      })
    ).not.toBeInTheDocument();

    // Filtering must happen locally.
    expect(api.getCount).toBe(1);
  });

  test("13. clears filters without another API request", async () => {
    const api = installManufacturerApi();

    await renderLoadedPage();

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search manufacturers",
      }),
      {
        target: { value: "XYZ" },
      }
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Clear filters",
      })
    );

    expect(
      getManufacturerRow("ABC Pharma")
    ).toBeInTheDocument();

    expect(
      getManufacturerRow("XYZ Labs")
    ).toBeInTheDocument();

    expect(api.getCount).toBe(1);
  });

  test("14. sorts backend records locally without refetching", async () => {
    const api = installManufacturerApi();

    await renderLoadedPage();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Manufacturer name: sort descending",
      })
    );

    const rows = screen
      .getAllByRole("row")
      .slice(1);

    expect(rows[0]).toHaveTextContent(
      "XYZ Labs"
    );

    expect(rows[1]).toHaveTextContent(
      "ABC Pharma"
    );

    expect(api.getCount).toBe(1);
  });
});

// ============================================
// 10. ROLE AND PERMISSION INTEGRATION
// ============================================

describe("Manufacturers - Role Permissions", () => {
  test.each([
    "Pharmacist",
    "Customer",
  ])(
    "15. %s can view manufacturers but cannot manage them",
    async (role) => {
      installManufacturerApi();

      await renderLoadedPage(role);

      expect(
        getManufacturerRow("ABC Pharma")
      ).toBeInTheDocument();

      expect(
        screen.queryByRole("button", {
          name: "Add Manufacturer",
        })
      ).not.toBeInTheDocument();

      expect(
        screen.queryByRole("button", {
          name: "Edit ABC Pharma",
        })
      ).not.toBeInTheDocument();

      expect(
        screen.queryByRole("button", {
          name: "Deactivate ABC Pharma",
        })
      ).not.toBeInTheDocument();
    }
  );
});

// ============================================
// 11. CREATE MANUFACTURER INTEGRATION
// ============================================

describe("Manufacturers - POST Integration", () => {
  test("16. creates manufacturer using POST and refreshes list", async () => {
    const api = installManufacturerApi();

    await renderLoadedPage();

    openCreateModal();

    changeManufacturerName(
      "  North Laboratories  "
    );

    clickDialogButton("Add Manufacturer");

    expect(
      await screen.findByRole("row", {
        name: /North Laboratories/i,
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Manufacturer created successfully."
      )
    ).toBeInTheDocument();

    const postRequest = api.requests.find(
      (request) => request.method === "POST"
    );

    expect(postRequest.body).toEqual({
      name: "North Laboratories",
    });

    expect(postRequest.contentType).toContain(
      "application/json"
    );

    expect(
      postRequest.authorization
    ).toMatch(/^Bearer \S+$/);

    expect(api.getCount).toBe(2);
  });

  test("17. prevents empty manufacturer name from reaching backend", async () => {
    const api = installManufacturerApi();

    await renderLoadedPage();

    openCreateModal();

    changeManufacturerName("   ");

    clickDialogButton("Add Manufacturer");

    expect(
      screen.getByText(
        "Enter the manufacturer name."
      )
    ).toBeInTheDocument();

    expect(
      api.requests.filter(
        (request) => request.method === "POST"
      )
    ).toHaveLength(0);
  });

  test("18. rejects manufacturer names longer than 100 characters", async () => {
    const api = installManufacturerApi();

    await renderLoadedPage();

    openCreateModal();

    changeManufacturerName(
      "A".repeat(101)
    );

    clickDialogButton("Add Manufacturer");

    expect(
      screen.getByText(
        "Name must be 100 characters or fewer."
      )
    ).toBeInTheDocument();

    expect(
      api.requests.some(
        (request) => request.method === "POST"
      )
    ).toBe(false);
  });

  test("19. cancelling creation does not send POST", async () => {
    const api = installManufacturerApi();

    await renderLoadedPage();

    openCreateModal();

    changeManufacturerName("New Pharma");

    clickDialogButton("Cancel");

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    expect(
      api.requests.some(
        (request) => request.method === "POST"
      )
    ).toBe(false);
  });

  test("20. displays backend validation error during creation", async () => {
    const api = installManufacturerApi();

    server.use(
      http.post(
        `${API_BASE}/manufacturers`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Manufacturer name is reserved.",
            },
            { status: 400 }
          )
      )
    );

    await renderLoadedPage();

    openCreateModal();

    changeManufacturerName("Reserved Pharma");

    clickDialogButton("Add Manufacturer");

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Manufacturer name is reserved."
    );

    expect(
      screen.getByRole("dialog")
    ).toBeInTheDocument();

    expect(api.getCount).toBe(1);
  });

  test("21. handles duplicate inactive manufacturer and restores it", async () => {
    const api = installManufacturerApi();

    server.use(
      http.post(
        `${API_BASE}/manufacturers`,
        async ({ request }) => {
          const body = await request.json();

          expect(body).toEqual({
            name: "XYZ Labs",
          });

          return HttpResponse.json(
            {
              success: false,
              message:
                "An inactive manufacturer already exists.",
              data: {
                manufacturerId: 2,
                requiresConfirmation: true,
              },
            },
            { status: 409 }
          );
        }
      )
    );

    await renderLoadedPage();

    openCreateModal();

    changeManufacturerName("  XYZ Labs  ");

    clickDialogButton("Add Manufacturer");

    expect(
      await screen.findByRole("dialog", {
        name: "Restore existing manufacturer",
      })
    ).toBeInTheDocument();

    clickDialogButton("Restore Manufacturer");

    await waitFor(() => {
      expect(
        within(
          getManufacturerRow("XYZ Labs")
        ).getByText("Active")
      ).toBeInTheDocument();
    });

    expect(
      api.requests.some(
        (request) =>
          request.method === "PATCH_RESTORE" &&
          request.id === 2
      )
    ).toBe(true);

    expect(
      screen.getByText(
        "Manufacturer restored."
      )
    ).toBeInTheDocument();

    expect(api.getCount).toBe(2);
  });

  test("22. allows returning to create form after duplicate detection", async () => {
    installManufacturerApi();

    server.use(
      http.post(
        `${API_BASE}/manufacturers`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Inactive duplicate.",
              data: {
                manufacturerId: 2,
                requiresConfirmation: true,
              },
            },
            { status: 409 }
          )
      )
    );

    await renderLoadedPage();

    openCreateModal();

    changeManufacturerName("XYZ Labs");

    clickDialogButton("Add Manufacturer");

    expect(
      await screen.findByRole("dialog", {
        name: "Restore existing manufacturer",
      })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Use a different name",
      })
    );

    expect(
      screen.getByRole("dialog", {
        name: "Add manufacturer",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("textbox", {
        name: "Manufacturer name",
      })
    ).toHaveValue("XYZ Labs");
  });

  test("23. does not offer restoration for invalid duplicate details", async () => {
    installManufacturerApi();

    server.use(
      http.post(
        `${API_BASE}/manufacturers`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Manufacturer already exists.",
              data: {
                manufacturerId: null,
                requiresConfirmation: false,
              },
            },
            { status: 409 }
          )
      )
    );

    await renderLoadedPage();

    openCreateModal();

    changeManufacturerName("Duplicate Pharma");

    clickDialogButton("Add Manufacturer");

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Manufacturer already exists."
    );

    expect(
      screen.queryByRole("dialog", {
        name: "Restore existing manufacturer",
      })
    ).not.toBeInTheDocument();
  });
});

// ============================================
// 12. UPDATE MANUFACTURER INTEGRATION
// ============================================

describe("Manufacturers - PUT Integration", () => {
  test("24. edits manufacturer using PUT and updates UI", async () => {
    const api = installManufacturerApi();

    await renderLoadedPage();

    openEditModal("ABC Pharma");

    changeManufacturerName(
      "  ABC Laboratories  "
    );

    clickDialogButton("Save Changes");

    expect(
      await screen.findByRole("row", {
        name: /ABC Laboratories/i,
      })
    ).toBeInTheDocument();

    const putRequest = api.requests.find(
      (request) => request.method === "PUT"
    );

    expect(putRequest).toEqual({
      method: "PUT",
      id: 1,
      body: {
        name: "ABC Laboratories",
      },
    });

    expect(api.getCount).toBe(2);
  });

  test("25. unchanged manufacturer name cannot be submitted", async () => {
    const api = installManufacturerApi();

    await renderLoadedPage();

    openEditModal("ABC Pharma");

    expect(
      within(getDialog()).getByRole(
        "button",
        { name: "Save Changes" }
      )
    ).toBeDisabled();

    expect(
      api.requests.some(
        (request) => request.method === "PUT"
      )
    ).toBe(false);
  });

  test("26. failed PUT displays error without refreshing the list", async () => {
    const api = installManufacturerApi();

    server.use(
      http.put(
        `${API_BASE}/manufacturers/:id`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Unable to update manufacturer.",
            },
            { status: 500 }
          )
      )
    );

    await renderLoadedPage();

    openEditModal("ABC Pharma");

    changeManufacturerName(
      "Updated Pharma"
    );

    clickDialogButton("Save Changes");

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to update manufacturer."
    );

    expect(
      getManufacturerRow("ABC Pharma")
    ).toBeInTheDocument();

    expect(api.getCount).toBe(1);
  });
});

// ============================================
// 13. DEACTIVATE AND RESTORE INTEGRATION
// ============================================

describe("Manufacturers - PATCH Integration", () => {
  test("27. deactivates manufacturer and updates status", async () => {
    const api = installManufacturerApi();

    await renderLoadedPage();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Deactivate ABC Pharma",
      })
    );

    expect(
      screen.getByRole("dialog", {
        name: "Deactivate manufacturer",
      })
    ).toBeInTheDocument();

    clickDialogButton("Deactivate");

    await waitFor(() => {
      expect(
        within(
          getManufacturerRow("ABC Pharma")
        ).getByText("Inactive")
      ).toBeInTheDocument();
    });

    expect(
      api.requests.some(
        (request) =>
          request.method === "PATCH_DEACTIVATE" &&
          request.id === 1
      )
    ).toBe(true);

    expect(api.getCount).toBe(2);
  });

  test("28. restores inactive manufacturer and enables editing", async () => {
    const api = installManufacturerApi();

    await renderLoadedPage();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Restore XYZ Labs",
      })
    );

    expect(
      screen.getByRole("dialog", {
        name: "Restore manufacturer",
      })
    ).toBeInTheDocument();

    clickDialogButton("Restore");

    await waitFor(() => {
      expect(
        within(
          getManufacturerRow("XYZ Labs")
        ).getByText("Active")
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", {
        name: "Edit XYZ Labs",
      })
    ).toBeEnabled();

    expect(
      api.requests.some(
        (request) =>
          request.method === "PATCH_RESTORE" &&
          request.id === 2
      )
    ).toBe(true);

    expect(api.getCount).toBe(2);
  });

  test("29. inactive manufacturer cannot be edited before restoration", async () => {
    installManufacturerApi();

    await renderLoadedPage();

    expect(
      screen.getByRole("button", {
        name: "Edit XYZ Labs",
      })
    ).toBeDisabled();

    expect(
      screen.getByText(
        "Restore before editing."
      )
    ).toBeInTheDocument();
  });

  test("30. failed deactivation preserves active status", async () => {
    const api = installManufacturerApi();

    server.use(
      http.patch(
        `${API_BASE}/manufacturers/:id/deactivate`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Manufacturer cannot be deactivated.",
            },
            { status: 409 }
          )
      )
    );

    await renderLoadedPage();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Deactivate ABC Pharma",
      })
    );

    clickDialogButton("Deactivate");

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Manufacturer cannot be deactivated."
    );

    expect(
      within(
        getManufacturerRow("ABC Pharma")
      ).getByText("Active")
    ).toBeInTheDocument();

    expect(api.getCount).toBe(1);
  });

  test("31. failed restoration preserves inactive status", async () => {
    const api = installManufacturerApi();

    server.use(
      http.patch(
        `${API_BASE}/manufacturers/:id/restore`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Manufacturer cannot be restored.",
            },
            { status: 500 }
          )
      )
    );

    await renderLoadedPage();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Restore XYZ Labs",
      })
    );

    clickDialogButton("Restore");

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Manufacturer cannot be restored."
    );

    expect(
      within(
        getManufacturerRow("XYZ Labs")
      ).getByText("Inactive")
    ).toBeInTheDocument();

    expect(api.getCount).toBe(1);
  });
});

// ============================================
// 14. PENDING REQUEST INTEGRATION
// ============================================

describe("Manufacturers - Request Reliability", () => {
  test("32. prevents duplicate POST submissions while saving", async () => {
    installManufacturerApi();

    let releaseRequest;
    let postCount = 0;

    const pending = new Promise((resolve) => {
      releaseRequest = resolve;
    });

    server.use(
      http.post(
        `${API_BASE}/manufacturers`,
        async () => {
          postCount += 1;

          await pending;

          return HttpResponse.json(
            {
              success: true,
              message: "Manufacturer created.",
            },
            { status: 201 }
          );
        }
      )
    );

    await renderLoadedPage();

    openCreateModal();

    changeManufacturerName(
      "New Manufacturer"
    );

    clickDialogButton("Add Manufacturer");

    await waitFor(() => {
      expect(postCount).toBe(1);
    });

    expect(
      within(getDialog()).getByRole("button", {
        name: "Saving...",
      })
    ).toBeDisabled();

    expect(
      within(getDialog()).getByRole("button", {
        name: "Cancel",
      })
    ).toBeDisabled();

    // Force another form submit while
    // the first request is still pending.
    fireEvent.submit(
      getDialog().querySelector("form")
    );

    expect(postCount).toBe(1);

    await act(async () => {
      releaseRequest();
    });

    expect(
      await screen.findByText(
        "Manufacturer created."
      )
    ).toBeInTheDocument();

    expect(postCount).toBe(1);
  });
});
