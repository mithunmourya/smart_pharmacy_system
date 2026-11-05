
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
// 1. CONFIGURATION
// ============================================

const API_BASE = "http://127.0.0.1:4179/api";

let AuthProvider;
let useAuth;
let Medicines;

// ============================================
// 2. TEST DATA
// ============================================

function initialManufacturers() {
  return [
    {
      manufacturer_id: 1,
      name: "Acme Pharma",
      is_active: 1,
      created_at: "2026-09-01",
    },
    {
      manufacturer_id: 2,
      name: "Inactive Pharma",
      is_active: 0,
      created_at: "2026-09-02",
    },
    {
      manufacturer_id: 3,
      name: "Zenith Laboratories",
      is_active: 1,
      created_at: "2026-09-03",
    },
  ];
}

function initialMedicines() {
  return [
    {
      medicine_id: 10,
      name: "Paracetamol 500mg",
      manufacturer_id: 1,
      manufacturer: "Acme Pharma",
      manufacturer_is_active: 1,
      category: "Tablet",
      reorder_level: "20",
      created_at: "2026-10-01",
      medicine_is_active: 1,
    },
    {
      medicine_id: 20,
      name: "Cetirizine 10mg",
      manufacturer_id: 1,
      manufacturer: "Acme Pharma",
      manufacturer_is_active: 1,
      category: "Tablet",
      reorder_level: "5",
      created_at: "2026-10-02",
      medicine_is_active: 0,
    },
    {
      medicine_id: 30,
      name: "Ibuprofen 200mg",
      manufacturer_id: 2,
      manufacturer: "Inactive Pharma",
      manufacturer_is_active: 0,
      category: "Capsule",
      reorder_level: "15",
      created_at: "2026-10-03",
      medicine_is_active: 1,
    },
    {
      medicine_id: 40,
      name: "Vitamin Syrup",
      manufacturer_id: 3,
      manufacturer: "Zenith Laboratories",
      manufacturer_is_active: 1,
      category: "Syrup",
      reorder_level: "30",
      created_at: "2026-10-04",
      medicine_is_active: 1,
    },
  ];
}

// ============================================
// 3. CREATE JWT
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

function AuthenticatedPage({
  role = "Admin",
}) {
  const {
    login,
    isAuthenticated,
  } = useAuth();

  useEffect(() => {
    login({
      token: createTestToken(),
      user: {
        user_id: 1,
        name: "Test User",
        email: "test@example.com",
        role,
      },
    });
  }, [login, role]);

  return (
    <>
      <output data-testid="auth-state">
        {isAuthenticated
          ? "authenticated"
          : "guest"}
      </output>

      {isAuthenticated && <Medicines />}
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
// 5. MOCK BACKEND USING MSW
// ============================================

function installMedicineApi({
  medicines = initialMedicines(),
  manufacturers = initialManufacturers(),
} = {}) {
  const db = {
    medicines: medicines.map((item) => ({
      ...item,
    })),
    manufacturers: manufacturers.map(
      (item) => ({
        ...item,
      })
    ),
  };

  const requests = [];

  let medicineGetCount = 0;
  let manufacturerGetCount = 0;

  function recordRequest({
    method,
    path,
    request,
    body,
  }) {
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
    // ========================================
    // GET /medicines
    // ========================================

    http.get(
      `${API_BASE}/medicines`,
      ({ request }) => {
        medicineGetCount++;

        recordRequest({
          method: "GET",
          path: "/medicines",
          request,
        });

        return HttpResponse.json({
          success: true,
          data: db.medicines.map(
            (medicine) => ({
              ...medicine,
            })
          ),
        });
      }
    ),

    // ========================================
    // GET /manufacturers
    // ========================================

    http.get(
      `${API_BASE}/manufacturers`,
      ({ request }) => {
        manufacturerGetCount++;

        recordRequest({
          method: "GET",
          path: "/manufacturers",
          request,
        });

        return HttpResponse.json({
          success: true,
          data: db.manufacturers.map(
            (manufacturer) => ({
              ...manufacturer,
            })
          ),
        });
      }
    ),

    // ========================================
    // POST /medicines
    // ========================================

    http.post(
      `${API_BASE}/medicines`,
      async ({ request }) => {
        const body = await request.json();

        recordRequest({
          method: "POST",
          path: "/medicines",
          request,
          body,
        });

        const manufacturer =
          db.manufacturers.find(
            (item) =>
              Number(item.manufacturer_id) ===
              Number(body.manufacturer_id)
          );

        const newId =
          Math.max(
            0,
            ...db.medicines.map(
              (item) =>
                Number(item.medicine_id)
            )
          ) + 1;

        db.medicines.push({
          medicine_id: newId,
          name: body.name,
          manufacturer_id:
            body.manufacturer_id,
          manufacturer:
            manufacturer?.name ?? "",
          manufacturer_is_active:
            manufacturer?.is_active ?? 0,
          category: body.category,
          reorder_level:
            body.reorder_level,
          created_at: "2026-11-01",
          medicine_is_active: 1,
        });

        return HttpResponse.json(
          {
            success: true,
            message:
              "Medicine created successfully.",
            data: {
              medicine_id: newId,
            },
          },
          { status: 201 }
        );
      }
    ),

    // ========================================
    // PUT /medicines/:id
    // ========================================

    http.put(
      `${API_BASE}/medicines/:id`,
      async ({ request, params }) => {
        const body = await request.json();
        const id = Number(params.id);

        recordRequest({
          method: "PUT",
          path: `/medicines/${id}`,
          request,
          body,
        });

        const medicine =
          db.medicines.find(
            (item) =>
              Number(item.medicine_id) === id
          );

        if (!medicine) {
          return HttpResponse.json(
            {
              success: false,
              message: "Medicine not found.",
            },
            { status: 404 }
          );
        }

        const manufacturer =
          db.manufacturers.find(
            (item) =>
              Number(item.manufacturer_id) ===
              Number(body.manufacturer_id)
          );

        Object.assign(medicine, {
          name: body.name,
          manufacturer_id:
            body.manufacturer_id,
          manufacturer:
            manufacturer?.name ?? "",
          manufacturer_is_active:
            manufacturer?.is_active ?? 0,
          category: body.category,
          reorder_level:
            body.reorder_level,
        });

        return HttpResponse.json({
          success: true,
          message:
            "Medicine updated successfully.",
        });
      }
    ),

    // ========================================
    // PATCH /medicines/:id/deactivate
    // ========================================

    http.patch(
      `${API_BASE}/medicines/:id/deactivate`,
      ({ request, params }) => {
        const id = Number(params.id);

        recordRequest({
          method: "PATCH",
          path:
            `/medicines/${id}/deactivate`,
          request,
        });

        const medicine =
          db.medicines.find(
            (item) =>
              Number(item.medicine_id) === id
          );

        if (!medicine) {
          return HttpResponse.json(
            {
              success: false,
              message: "Medicine not found.",
            },
            { status: 404 }
          );
        }

        medicine.medicine_is_active = 0;

        return HttpResponse.json({
          success: true,
          message:
            "Medicine deactivated successfully.",
        });
      }
    ),

    // ========================================
    // PATCH /medicines/:id/restore
    // ========================================

    http.patch(
      `${API_BASE}/medicines/:id/restore`,
      ({ request, params }) => {
        const id = Number(params.id);

        recordRequest({
          method: "PATCH",
          path:
            `/medicines/${id}/restore`,
          request,
        });

        const medicine =
          db.medicines.find(
            (item) =>
              Number(item.medicine_id) === id
          );

        if (!medicine) {
          return HttpResponse.json(
            {
              success: false,
              message: "Medicine not found.",
            },
            { status: 404 }
          );
        }

        medicine.medicine_is_active = 1;

        return HttpResponse.json({
          success: true,
          message:
            "Medicine restored successfully.",
        });
      }
    )
  );

  return {
    db,
    requests,

    get medicineGetCount() {
      return medicineGetCount;
    },

    get manufacturerGetCount() {
      return manufacturerGetCount;
    },

    count(method, path) {
      return requests.filter(
        (request) =>
          request.method === method &&
          request.path === path
      ).length;
    },

    find(method, path) {
      return requests.find(
        (request) =>
          request.method === method &&
          request.path === path
      );
    },
  };
}

// ============================================
// 6. PAGE HELPERS
// ============================================

async function renderLoadedPage(
  role = "Admin"
) {
  renderPage(role);

  return screen.findByRole("row", {
    name: /Paracetamol 500mg/i,
  });
}

function getMedicineRow(name) {
  return screen.getByRole("row", {
    name: new RegExp(name, "i"),
  });
}

function getDialog() {
  return screen.getByRole("dialog");
}

function dialogButton(name) {
  return within(getDialog()).getByRole(
    "button",
    { name, exact: true }
  );
}

function changeField(name, value) {
  fireEvent.change(
    within(getDialog()).getByLabelText(
      name
    ),
    {
      target: { value },
    }
  );
}

async function openCreateModal() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "Add Medicine",
    })
  );

  await within(getDialog()).findByRole(
    "option",
    { name: "Acme Pharma" }
  );

  await waitFor(() => {
    expect(
      dialogButton("Add Medicine")
    ).toBeEnabled();
  });
}

function openEditModal(name) {
  fireEvent.click(
    screen.getByRole("button", {
      name: `Edit ${name}`,
    })
  );
}

async function waitForManufacturers() {
  await within(getDialog()).findByRole(
    "option",
    {
      name: "Acme Pharma",
    }
  );

  await waitFor(() => {
    expect(
      within(getDialog()).getByRole(
        "combobox",
        { name: "Manufacturer" }
      )
    ).toBeEnabled();
  });
}

function fillMedicineForm({
  name = "  Vitamin D3  ",
  manufacturerId = "1",
  category = "Tablet",
  reorderLevel = "25",
} = {}) {
  changeField("Medicine name", name);
  changeField(
    "Manufacturer",
    manufacturerId
  );
  changeField("Category", category);
  changeField(
    "Reorder level",
    reorderLevel
  );
}

// ============================================
// 7. TEST LIFECYCLE
// ============================================

beforeAll(async () => {
  // The real api.js reads the URL at
  // module import time.
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

  ({ default: Medicines } =
    await import(
      "../../pages/medicines/Medicines.jsx"
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
// 8. GET MEDICINES INTEGRATION
// ============================================

describe("Medicines - GET Integration", () => {
  test("1. loads medicines through real services with JWT", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    expect(
      getMedicineRow("Paracetamol 500mg")
    ).toBeInTheDocument();

    expect(
      getMedicineRow("Cetirizine 10mg")
    ).toBeInTheDocument();

    expect(
      within(
        getMedicineRow("Paracetamol 500mg")
      ).getByText("Active")
    ).toBeInTheDocument();

    expect(
      within(
        getMedicineRow("Cetirizine 10mg")
      ).getByText("Inactive")
    ).toBeInTheDocument();

    expect(
      within(
        getMedicineRow("Ibuprofen 200mg")
      ).getByText("Inactive manufacturer")
    ).toBeInTheDocument();

    expect(api.medicineGetCount).toBe(1);

    const request = api.find(
      "GET",
      "/medicines"
    );

    expect(request.authorization).toMatch(
      /^Bearer \S+$/
    );

    expect(request.accept).toBe(
      "application/json"
    );
  });

  test("2. shows loading state during a pending GET request", async () => {
    let release;

    const pending = new Promise(
      (resolve) => {
        release = resolve;
      }
    );

    server.use(
      http.get(
        `${API_BASE}/medicines`,
        async () => {
          await pending;

          return HttpResponse.json({
            success: true,
            data: initialMedicines(),
          });
        }
      )
    );

    renderPage();

   
await waitFor(() => {
  // Verify the medicines table is loading.
  expect(
    screen.getByLabelText("Medicines list")
      .querySelector('[aria-busy="true"]')
  ).toBeInTheDocument();

  // Both loading messages are intentionally shown.
  expect(
    screen.getAllByText("Loading medicines...")
  ).toHaveLength(2);
});


    await act(async () => {
      release();
    });

    expect(
      await screen.findByRole("row", {
        name: /Paracetamol 500mg/i,
      })
    ).toBeInTheDocument();
  });

  test("3. shows empty state for an empty success response", async () => {
    installMedicineApi({
      medicines: [],
    });

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "No medicines found",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Medicines will appear here once added."
      )
    ).toBeInTheDocument();
  });

  test("4. converts expected 404 into an empty list", async () => {
    server.use(
      http.get(
        `${API_BASE}/medicines`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "No medicines found.",
            },
            { status: 404 }
          )
      )
    );

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "No medicines found",
      })
    ).toBeInTheDocument();
  });

  test("5. rejects invalid medicine data", async () => {
    server.use(
      http.get(
        `${API_BASE}/medicines`,
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
      "The server returned an invalid medicines list."
    );
  });

  test("6. displays backend HTTP 500 errors", async () => {
    server.use(
      http.get(
        `${API_BASE}/medicines`,
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

  test("7. handles application failure with HTTP 200", async () => {
    server.use(
      http.get(
        `${API_BASE}/medicines`,
        () =>
          HttpResponse.json({
            success: false,
            message:
              "Medicine service unavailable.",
          })
      )
    );

    renderPage();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Medicine service unavailable."
    );
  });

  test("8. keeps authentication after HTTP 403", async () => {
    server.use(
      http.get(
        `${API_BASE}/medicines`,
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

  test("9. clears session after HTTP 401", async () => {
    server.use(
      http.get(
        `${API_BASE}/medicines`,
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

  test("10. displays network connection failures", async () => {
    server.use(
      http.get(
        `${API_BASE}/medicines`,
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

  test("11. retries successfully after HTTP 500", async () => {
    let requests = 0;

    server.use(
      http.get(
        `${API_BASE}/medicines`,
        () => {
          requests++;

          if (requests === 1) {
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
            data: initialMedicines(),
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

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reload medicines",
      })
    );

    expect(
      await screen.findByRole("row", {
        name: /Paracetamol 500mg/i,
      })
    ).toBeInTheDocument();

    expect(requests).toBe(2);
  });
});

// ============================================
// 9. FILTERS, SORTING, AND RELOAD
// ============================================

describe("Medicines - Display Integration", () => {
  test("12. refreshes the list using a new GET request", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    api.db.medicines.push({
      medicine_id: 50,
      name: "New Medicine",
      manufacturer_id: 1,
      manufacturer: "Acme Pharma",
      manufacturer_is_active: 1,
      category: "Tablet",
      reorder_level: 10,
      created_at: "2026-11-01",
      medicine_is_active: 1,
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reload medicines",
      })
    );

    expect(
      await screen.findByRole("row", {
        name: /New Medicine/i,
      })
    ).toBeInTheDocument();

    expect(api.medicineGetCount).toBe(2);
  });

  test("13. searches medicine names without refetching", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search",
      }),
      {
        target: {
          value: "  paraCETAMOL  ",
        },
      }
    );

    expect(
      getMedicineRow("Paracetamol 500mg")
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("row", {
        name: /Ibuprofen 200mg/i,
      })
    ).not.toBeInTheDocument();

    expect(api.medicineGetCount).toBe(1);
  });

  test("14. searches by manufacturer name", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search",
      }),
      {
        target: {
          value: "zenith",
        },
      }
    );

    expect(
      getMedicineRow("Vitamin Syrup")
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("row", {
        name: /Paracetamol 500mg/i,
      })
    ).not.toBeInTheDocument();

    expect(api.medicineGetCount).toBe(1);
  });

  test("15. filters medicines by category", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    fireEvent.change(
      screen.getByRole("combobox", {
        name: "Category",
      }),
      {
        target: {
          value: "Syrup",
        },
      }
    );

    expect(
      getMedicineRow("Vitamin Syrup")
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("row", {
        name: /Paracetamol 500mg/i,
      })
    ).not.toBeInTheDocument();

    expect(api.medicineGetCount).toBe(1);
  });

  test("16. filters medicines by manufacturer", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    fireEvent.change(
      screen.getByRole("combobox", {
        name: "Manufacturer",
      }),
      {
        target: {
          value: "2",
        },
      }
    );

    expect(
      getMedicineRow("Ibuprofen 200mg")
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("row", {
        name: /Paracetamol 500mg/i,
      })
    ).not.toBeInTheDocument();

    expect(api.medicineGetCount).toBe(1);
  });

  test("17. filters inactive medicines", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    fireEvent.change(
      screen.getByRole("combobox", {
        name: "Medicine status",
      }),
      {
        target: {
          value: "Inactive",
        },
      }
    );

    expect(
      getMedicineRow("Cetirizine 10mg")
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("row", {
        name: /Paracetamol 500mg/i,
      })
    ).not.toBeInTheDocument();

    expect(api.medicineGetCount).toBe(1);
  });

  test("18. combines search, category and status filters", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search",
      }),
      {
        target: {
          value: "Cetirizine",
        },
      }
    );

    fireEvent.change(
      screen.getByRole("combobox", {
        name: "Category",
      }),
      {
        target: {
          value: "Tablet",
        },
      }
    );

    fireEvent.change(
      screen.getByRole("combobox", {
        name: "Medicine status",
      }),
      {
        target: {
          value: "Inactive",
        },
      }
    );

    expect(
      getMedicineRow("Cetirizine 10mg")
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("row", {
        name: /Paracetamol 500mg/i,
      })
    ).not.toBeInTheDocument();

    expect(api.medicineGetCount).toBe(1);
  });

  test("19. clears filters without making another API request", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search",
      }),
      {
        target: {
          value: "Cetirizine",
        },
      }
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Clear filters",
      })
    );

    expect(
      getMedicineRow("Paracetamol 500mg")
    ).toBeInTheDocument();

    expect(
      getMedicineRow("Cetirizine 10mg")
    ).toBeInTheDocument();

    expect(api.medicineGetCount).toBe(1);
  });

  test("20. sorts medicine names without refetching", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Medicine: sort descending",
      })
    );

    const rows = screen
      .getAllByRole("row")
      .slice(1);

    expect(rows[0]).toHaveTextContent(
      "Vitamin Syrup"
    );

    expect(
      rows[rows.length - 1]
    ).toHaveTextContent(
      "Cetirizine 10mg"
    );

    expect(api.medicineGetCount).toBe(1);
  });

  test("21. displays no matching medicines for an unknown search", async () => {
    installMedicineApi();

    await renderLoadedPage();

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search",
      }),
      {
        target: {
          value: "NoSuchMedicine",
        },
      }
    );

    expect(
      screen.getByRole("heading", {
        name: "No matching medicines",
      })
    ).toBeInTheDocument();
  });
});

// ============================================
// 10. ROLE PERMISSIONS
// ============================================

describe("Medicines - Role Permissions", () => {
  test.each([
    "Pharmacist",
    "Customer",
  ])(
    "22. %s can view medicines without management controls",
    async (role) => {
      installMedicineApi();

      await renderLoadedPage(role);

      expect(
        getMedicineRow("Paracetamol 500mg")
      ).toBeInTheDocument();

      expect(
        screen.queryByRole("button", {
          name: "Add Medicine",
        })
      ).not.toBeInTheDocument();

      expect(
        screen.queryByRole("button", {
          name: "Edit Paracetamol 500mg",
        })
      ).not.toBeInTheDocument();

      expect(
        screen.queryByRole("button", {
          name: "Deactivate Paracetamol 500mg",
        })
      ).not.toBeInTheDocument();
    }
  );
});

// ============================================
// 11. CREATE MEDICINE
// ============================================

describe("Medicines - POST Integration", () => {
  test("23. loads active manufacturers through real service", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    await openCreateModal();

    const select = within(
      getDialog()
    ).getByRole("combobox", {
      name: "Manufacturer",
    });

    expect(
      within(select).getByRole("option", {
        name: "Acme Pharma",
      })
    ).toBeInTheDocument();

    expect(
      within(select).getByRole("option", {
        name: "Zenith Laboratories",
      })
    ).toBeInTheDocument();

    expect(
      within(select).queryByRole("option", {
        name: "Inactive Pharma",
      })
    ).not.toBeInTheDocument();

    expect(
      api.manufacturerGetCount
    ).toBe(1);

    expect(
      api.find(
        "GET",
        "/manufacturers"
      ).authorization
    ).toMatch(/^Bearer \S+$/);
  });

  test("24. creates medicine via POST and refreshes UI", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    await openCreateModal();

    fillMedicineForm();

    fireEvent.click(
      dialogButton("Add Medicine")
    );

    expect(
      await screen.findByRole("row", {
        name: /Vitamin D3/i,
      })
    ).toBeInTheDocument();

    const request = api.find(
      "POST",
      "/medicines"
    );

    expect(request.body).toEqual({
      name: "Vitamin D3",
      manufacturer_id: 1,
      category: "Tablet",
      reorder_level: 25,
    });

    expect(request.contentType).toContain(
      "application/json"
    );

    expect(request.authorization).toMatch(
      /^Bearer \S+$/
    );

    expect(
      screen.getByText(
        "Medicine created successfully."
      )
    ).toBeInTheDocument();

    expect(api.medicineGetCount).toBe(2);
  });

  test("25. prevents an empty medicine name from reaching backend", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    await openCreateModal();

    fillMedicineForm({
      name: "   ",
    });

    fireEvent.click(
      dialogButton("Add Medicine")
    );

    expect(
      screen.getByText(
        "Enter the medicine name."
      )
    ).toBeInTheDocument();

    expect(
      api.count("POST", "/medicines")
    ).toBe(0);
  });

  test("26. requires an active manufacturer", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    await openCreateModal();

    fillMedicineForm({
      manufacturerId: "",
    });

    fireEvent.click(
      dialogButton("Add Medicine")
    );

    expect(
      screen.getByText(
        "Select an active manufacturer."
      )
    ).toBeInTheDocument();

    expect(
      api.count("POST", "/medicines")
    ).toBe(0);
  });

  test.each([
    "",
    "-1",
    "1.5",
    "2147483648",
  ])(
    "27. rejects invalid reorder level %j without POST",
    async (value) => {
      const api = installMedicineApi();

      await renderLoadedPage();

      await openCreateModal();

      fillMedicineForm({
        reorderLevel: value,
      });

      fireEvent.click(
        dialogButton("Add Medicine")
      );

      expect(
        screen.getByText(
          "Enter a whole number from 0 to 2147483647."
        )
      ).toBeInTheDocument();

      expect(
        api.count("POST", "/medicines")
      ).toBe(0);
    }
  );

  test("28. disables creation when no active manufacturers exist", async () => {
    installMedicineApi({
      manufacturers: [
        {
          manufacturer_id: 1,
          name: "Acme Pharma",
          is_active: 0,
        },
      ],
    });

    await renderLoadedPage();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Add Medicine",
      })
    );

    expect(
      await screen.findByText(
        "Add or restore a manufacturer before saving a medicine."
      )
    ).toBeInTheDocument();

    expect(
      dialogButton("Add Medicine")
    ).toBeDisabled();
  });

  test("29. retries loading manufacturers after HTTP 500", async () => {
    const api = installMedicineApi();

    let attempts = 0;

    server.use(
      http.get(
        `${API_BASE}/manufacturers`,
        () => {
          attempts++;

          if (attempts === 1) {
            return HttpResponse.json(
              {
                success: false,
                message:
                  "Manufacturer service unavailable.",
              },
              { status: 500 }
            );
          }

          return HttpResponse.json({
            success: true,
            data: api.db.manufacturers,
          });
        }
      )
    );

    await renderLoadedPage();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Add Medicine",
      })
    );

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Manufacturer service unavailable."
    );

    expect(
      dialogButton("Add Medicine")
    ).toBeDisabled();

    fireEvent.click(
      within(getDialog()).getByRole(
        "button",
        {
          name:
            "Retry loading manufacturers",
        }
      )
    );

    await waitForManufacturers();

    expect(attempts).toBe(2);

    expect(
      dialogButton("Add Medicine")
    ).toBeEnabled();
  });

  test("30. displays POST error without refreshing medicines", async () => {
    const api = installMedicineApi();

    server.use(
      http.post(
        `${API_BASE}/medicines`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message:
                "Unable to create medicine.",
            },
            { status: 500 }
          )
      )
    );

    await renderLoadedPage();

    await openCreateModal();

    fillMedicineForm();

    fireEvent.click(
      dialogButton("Add Medicine")
    );

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Unable to create medicine."
    );

    expect(
      screen.getByRole("dialog")
    ).toBeInTheDocument();

    expect(api.medicineGetCount).toBe(1);
  });

  test("31. restores an inactive duplicate after HTTP 409", async () => {
    const api = installMedicineApi();

    server.use(
      http.post(
        `${API_BASE}/medicines`,
        async ({ request }) => {
          const body = await request.json();

          expect(body).toEqual({
            name: "Cetirizine 10mg",
            manufacturer_id: 1,
            category: "Tablet",
            reorder_level: 25,
          });

          return HttpResponse.json(
            {
              success: false,
              message:
                "Inactive medicine already exists.",
              data: {
                medicineId: 20,
                requiresConfirmation: true,
              },
            },
            { status: 409 }
          );
        }
      )
    );

    await renderLoadedPage();

    await openCreateModal();

    fillMedicineForm({
      name: "Cetirizine 10mg",
    });

    fireEvent.click(
      dialogButton("Add Medicine")
    );

    expect(
      await screen.findByRole("dialog", {
        name: "Restore existing medicine",
      })
    ).toBeInTheDocument();

    fireEvent.click(
      dialogButton("Restore Medicine")
    );

    await waitFor(() => {
      expect(
        within(
          getMedicineRow("Cetirizine 10mg")
        ).getByText("Active")
      ).toBeInTheDocument();
    });

    expect(
      api.count(
        "PATCH",
        "/medicines/20/restore"
      )
    ).toBe(1);

    expect(api.medicineGetCount).toBe(2);
  });

  test("32. does not offer duplicate restoration for invalid ID", async () => {
    installMedicineApi();

    server.use(
      http.post(
        `${API_BASE}/medicines`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message:
                "Medicine already exists.",
              data: {
                medicineId: "invalid",
                requiresConfirmation: true,
              },
            },
            { status: 409 }
          )
      )
    );

    await renderLoadedPage();

    await openCreateModal();

    fillMedicineForm();

    fireEvent.click(
      dialogButton("Add Medicine")
    );

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Medicine already exists."
    );

    expect(
      screen.queryByRole("dialog", {
        name: "Restore existing medicine",
      })
    ).not.toBeInTheDocument();
  });

  test("33. returns to form after duplicate restoration offer", async () => {
    const api = installMedicineApi();

    server.use(
      http.post(
        `${API_BASE}/medicines`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message:
                "Inactive duplicate medicine.",
              data: {
                medicineId: 20,
                requiresConfirmation: true,
              },
            },
            { status: 409 }
          )
      )
    );

    await renderLoadedPage();

    await openCreateModal();

    fillMedicineForm({
      name: "Cetirizine 10mg",
    });

    fireEvent.click(
      dialogButton("Add Medicine")
    );

    expect(
      await screen.findByRole("button", {
        name: "Restore Medicine",
      })
    ).toBeInTheDocument();

    fireEvent.click(
      dialogButton(
        "Back to medicine details"
      )
    );

    expect(
      within(getDialog()).getByLabelText(
        "Medicine name"
      )
    ).toHaveValue(
      "Cetirizine 10mg"
    );

    expect(
      dialogButton("Add Medicine")
    ).toBeEnabled();

    expect(
      api.count(
        "PATCH",
        "/medicines/20/restore"
      )
    ).toBe(0);
  });

  test("34. cancelling creation sends no POST request", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    await openCreateModal();

    fillMedicineForm();

    fireEvent.click(
      dialogButton("Cancel")
    );

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    expect(
      api.count("POST", "/medicines")
    ).toBe(0);
  });

  test("35. prevents duplicate POST submissions while saving", async () => {
    const api = installMedicineApi();

    let release;
    let postCount = 0;

    const pending = new Promise(
      (resolve) => {
        release = resolve;
      }
    );

    server.use(
      http.post(
        `${API_BASE}/medicines`,
        async () => {
          postCount++;

          await pending;

          return HttpResponse.json(
            {
              success: true,
              message: "Medicine created.",
            },
            { status: 201 }
          );
        }
      )
    );

    await renderLoadedPage();

    await openCreateModal();

    fillMedicineForm();

    fireEvent.click(
      dialogButton("Add Medicine")
    );

    await waitFor(() => {
      expect(postCount).toBe(1);
    });

    expect(
      dialogButton("Saving...")
    ).toBeDisabled();

    expect(
      dialogButton("Cancel")
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
        "Medicine created."
      )
    ).toBeInTheDocument();

    expect(postCount).toBe(1);
    expect(api.medicineGetCount).toBe(2);
  });
});

// ============================================
// 12. UPDATE MEDICINE
// ============================================

describe("Medicines - PUT Integration", () => {
  test("36. updates medicine through real PUT service", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    openEditModal("Paracetamol 500mg");

    await waitForManufacturers();

    changeField(
      "Medicine name",
      "Paracetamol Plus"
    );

    changeField(
      "Manufacturer",
      "3"
    );

    changeField(
      "Category",
      "Capsule"
    );

    changeField(
      "Reorder level",
      "55"
    );

    fireEvent.click(
      dialogButton("Save Changes")
    );

    expect(
      await screen.findByRole("row", {
        name: /Paracetamol Plus/i,
      })
    ).toBeInTheDocument();

    const request = api.find(
      "PUT",
      "/medicines/10"
    );

    expect(request.body).toEqual({
      name: "Paracetamol Plus",
      manufacturer_id: 3,
      category: "Capsule",
      reorder_level: 55,
    });

    expect(
      getMedicineRow("Paracetamol Plus")
    ).toHaveTextContent(
      "Zenith Laboratories"
    );

    expect(api.medicineGetCount).toBe(2);
  });

  test("37. prevents PUT when nothing has changed", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    openEditModal("Paracetamol 500mg");

    await waitForManufacturers();

    expect(
      dialogButton("Save Changes")
    ).toBeDisabled();

    expect(
      api.count(
        "PUT",
        "/medicines/10"
      )
    ).toBe(0);
  });

  test("38. inactive medicine cannot be edited before restore", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    expect(
      screen.getByRole("button", {
        name: "Edit Cetirizine 10mg",
      })
    ).toBeDisabled();

    expect(
      api.count(
        "PUT",
        "/medicines/20"
      )
    ).toBe(0);
  });

  test("39. edit requires an active manufacturer", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    openEditModal("Ibuprofen 200mg");

    await waitForManufacturers();

    expect(
      screen.getByText(
        /Select an active manufacturer, or restore/
      )
    ).toBeInTheDocument();

    changeField(
      "Medicine name",
      "Ibuprofen Plus"
    );

    fireEvent.click(
      dialogButton("Save Changes")
    );

    expect(
      screen.getByText(
        "Select an active manufacturer."
      )
    ).toBeInTheDocument();

    expect(
      api.count(
        "PUT",
        "/medicines/30"
      )
    ).toBe(0);
  });

  test("40. failed PUT displays backend error and preserves old data", async () => {
    const api = installMedicineApi();

    server.use(
      http.put(
        `${API_BASE}/medicines/:id`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message:
                "Unable to update medicine.",
            },
            { status: 500 }
          )
      )
    );

    await renderLoadedPage();

    openEditModal("Paracetamol 500mg");

    await waitForManufacturers();

    changeField(
      "Medicine name",
      "Updated Medicine"
    );

    fireEvent.click(
      dialogButton("Save Changes")
    );

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Unable to update medicine."
    );

    expect(
      getMedicineRow("Paracetamol 500mg")
    ).toBeInTheDocument();

    expect(api.medicineGetCount).toBe(1);
  });
});

// ============================================
// 13. DEACTIVATE AND RESTORE
// ============================================

describe("Medicines - PATCH Integration", () => {
  test("41. deactivates medicine and refreshes its status", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    fireEvent.click(
      screen.getByRole("button", {
        name:
          "Deactivate Paracetamol 500mg",
      })
    );

    expect(
      screen.getByRole("dialog", {
        name: "Deactivate medicine",
      })
    ).toBeInTheDocument();

    fireEvent.click(
      dialogButton("Deactivate")
    );

    await waitFor(() => {
      expect(
        within(
          getMedicineRow("Paracetamol 500mg")
        ).getByText("Inactive")
      ).toBeInTheDocument();
    });

    expect(
      api.count(
        "PATCH",
        "/medicines/10/deactivate"
      )
    ).toBe(1);

    expect(api.medicineGetCount).toBe(2);
  });

  test("42. restores inactive medicine and enables editing", async () => {
    const api = installMedicineApi();

    await renderLoadedPage();

    fireEvent.click(
      screen.getByRole("button", {
        name:
          "Restore Cetirizine 10mg",
      })
    );

    expect(
      screen.getByRole("dialog", {
        name: "Restore medicine",
      })
    ).toBeInTheDocument();

    fireEvent.click(
      dialogButton("Restore")
    );

    await waitFor(() => {
      expect(
        within(
          getMedicineRow("Cetirizine 10mg")
        ).getByText("Active")
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", {
        name: "Edit Cetirizine 10mg",
      })
    ).toBeEnabled();

    expect(
      api.count(
        "PATCH",
        "/medicines/20/restore"
      )
    ).toBe(1);

    expect(api.medicineGetCount).toBe(2);
  });

  test("43. warns when restoring a medicine linked to inactive manufacturer", async () => {
    const api = installMedicineApi();

    api.db.medicines.find(
      (item) =>
        item.medicine_id === 30
    ).medicine_is_active = 0;

    renderPage();

    await screen.findByRole("row", {
      name: /Ibuprofen 200mg/i,
    });

    fireEvent.click(
      screen.getByRole("button", {
        name:
          "Restore Ibuprofen 200mg",
      })
    );

    expect(
      screen.getByText(
        /The manufacturer was inactive when this list loaded/
      )
    ).toBeInTheDocument();

    expect(
      api.count(
        "PATCH",
        "/medicines/30/restore"
      )
    ).toBe(0);
  });

  test("44. failed deactivation keeps the medicine active", async () => {
    const api = installMedicineApi();

    server.use(
      http.patch(
        `${API_BASE}/medicines/:id/deactivate`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message:
                "Medicine cannot be deactivated.",
            },
            { status: 409 }
          )
      )
    );

    await renderLoadedPage();

    fireEvent.click(
      screen.getByRole("button", {
        name:
          "Deactivate Paracetamol 500mg",
      })
    );

    fireEvent.click(
      dialogButton("Deactivate")
    );

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Medicine cannot be deactivated."
    );

    expect(
      within(
        getMedicineRow("Paracetamol 500mg")
      ).getByText("Active")
    ).toBeInTheDocument();

    expect(api.medicineGetCount).toBe(1);
  });

  test("45. failed restoration keeps the medicine inactive", async () => {
    const api = installMedicineApi();

    server.use(
      http.patch(
        `${API_BASE}/medicines/:id/restore`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message:
                "Medicine cannot be restored.",
            },
            { status: 500 }
          )
      )
    );

    await renderLoadedPage();

    fireEvent.click(
      screen.getByRole("button", {
        name:
          "Restore Cetirizine 10mg",
      })
    );

    fireEvent.click(
      dialogButton("Restore")
    );

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Medicine cannot be restored."
    );

    expect(
      within(
        getMedicineRow("Cetirizine 10mg")
      ).getByText("Inactive")
    ).toBeInTheDocument();

    expect(api.medicineGetCount).toBe(1);
  });
});
