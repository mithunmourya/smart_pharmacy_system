
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
let Batches;

// ============================================
// 2. DYNAMIC DATE HELPERS
// ============================================

// Use dates relative to today so expiry
// tests still work in future months.

function dateAfter(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// ============================================
// 3. TEST DATA
// ============================================

function initialMedicines() {
  return [
    {
      medicine_id: 1,
      name: "Paracetamol 500mg",
      manufacturer_id: 1,
      manufacturer: "ABC Pharma",
      manufacturer_is_active: 1,
      medicine_is_active: 1,
      category: "Tablet",
      reorder_level: 10,
      created_at: "2026-01-01",
    },
    {
      medicine_id: 2,
      name: "Ibuprofen 200mg",
      manufacturer_id: 2,
      manufacturer: "Inactive Labs",
      manufacturer_is_active: 0,
      medicine_is_active: 1,
      category: "Capsule",
      reorder_level: 5,
      created_at: "2026-01-02",
    },
    {
      medicine_id: 3,
      name: "Cetirizine 10mg",
      manufacturer_id: 1,
      manufacturer: "ABC Pharma",
      manufacturer_is_active: 1,
      medicine_is_active: 0,
      category: "Tablet",
      reorder_level: 5,
      created_at: "2026-01-03",
    },
  ];
}

function initialBatches() {
  return [
    {
      batch_id: 101,
      medicine_id: 1,
      batch_number: "PAR-001",
      purchase_price: "10.50",
      selling_price: "15.75",
      stock_quantity: "20",
      expiry_date: dateAfter(40),
      is_active: 1,
      created_at: "2026-01-01",
    },
    {
      batch_id: 102,
      medicine_id: 1,
      batch_number: "PAR-002",
      purchase_price: "8.00",
      selling_price: "12.00",
      stock_quantity: "0",
      expiry_date: dateAfter(5),
      is_active: 1,
      created_at: "2026-02-01",
    },
    {
      batch_id: 103,
      medicine_id: 1,
      batch_number: "PAR-003",
      purchase_price: "7.00",
      selling_price: "11.00",
      stock_quantity: "9",
      expiry_date: dateAfter(-3),
      is_active: 0,
      created_at: "2026-03-01",
    },
    {
      batch_id: 104,
      medicine_id: 1,
      batch_number: "PAR-004",
      purchase_price: "11.00",
      selling_price: "17.00",
      stock_quantity: "15",
      expiry_date: dateAfter(365),
      is_active: 1,
      created_at: "2026-04-01",
    },
    {
      batch_id: 201,
      medicine_id: 2,
      batch_number: "IBU-001",
      purchase_price: "20.00",
      selling_price: "28.00",
      stock_quantity: "12",
      expiry_date: dateAfter(60),
      is_active: 1,
      created_at: "2026-01-10",
    },
    {
      batch_id: 301,
      medicine_id: 3,
      batch_number: "CET-001",
      purchase_price: "5.00",
      selling_price: "9.00",
      stock_quantity: "4",
      expiry_date: dateAfter(90),
      is_active: 1,
      created_at: "2026-01-15",
    },
  ];
}

// ============================================
// 4. TEST JWT
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
// 5. REAL AUTHENTICATION WRAPPER
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

      {isAuthenticated && <Batches />}
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
// 6. STATEFUL MSW BACKEND
// ============================================

function installBatchApi({
  medicines = initialMedicines(),
  batches = initialBatches(),
} = {}) {
  const db = {
    medicines: medicines.map((item) => ({
      ...item,
    })),
    batches: batches.map((item) => ({
      ...item,
    })),
  };

  const requests = [];

  function capture(method, path, request, body) {
    requests.push({
      method,
      path,
      body,
      authorization:
        request.headers.get("authorization"),
      contentType:
        request.headers.get("content-type"),
    });
  }

  server.use(
    // ========================================
    // GET MEDICINES
    // ========================================

    http.get(
      `${API_BASE}/medicines`,
      ({ request }) => {
        capture(
          "GET",
          "/medicines",
          request
        );

        return HttpResponse.json({
          success: true,
          data: db.medicines.map(
            (item) => ({ ...item })
          ),
        });
      }
    ),

    // ========================================
    // GET BATCHES BY MEDICINE
    // ========================================

    http.get(
      `${API_BASE}/batches/medicine/:id`,
      ({ request, params }) => {
        const path =
          `/batches/medicine/${params.id}`;

        capture("GET", path, request);

        const items = db.batches.filter(
          (item) =>
            String(item.medicine_id) ===
            String(params.id)
        );

        return HttpResponse.json({
          success: true,
          data: items.map(
            (item) => ({ ...item })
          ),
        });
      }
    ),

    // ========================================
    // GET ONE BATCH
    // ========================================

    http.get(
      `${API_BASE}/batches/:id`,
      ({ request, params }) => {
        const path = `/batches/${params.id}`;

        capture("GET", path, request);

        const item = db.batches.find(
          (batch) =>
            String(batch.batch_id) ===
            String(params.id)
        );

        if (!item) {
          return HttpResponse.json(
            {
              success: false,
              message: "Batch not found.",
            },
            { status: 404 }
          );
        }

        return HttpResponse.json({
          success: true,
          data: { ...item },
        });
      }
    ),

    // ========================================
    // CREATE BATCH
    // ========================================

    http.post(
      `${API_BASE}/batches`,
      async ({ request }) => {
        const body = await request.json();

        capture(
          "POST",
          "/batches",
          request,
          body
        );

        const newId =
          Math.max(
            0,
            ...db.batches.map(
              (item) => Number(item.batch_id)
            )
          ) + 1;

        db.batches.push({
          batch_id: newId,
          ...body,
          is_active: 1,
          created_at: dateAfter(0),
        });

        return HttpResponse.json(
          {
            success: true,
            message: "Batch created successfully.",
            data: {
              batch_id: newId,
            },
          },
          { status: 201 }
        );
      }
    ),

    // ========================================
    // UPDATE BATCH
    // ========================================

    http.put(
      `${API_BASE}/batches/:id`,
      async ({ request, params }) => {
        const body = await request.json();

        const path = `/batches/${params.id}`;

        capture(
          "PUT",
          path,
          request,
          body
        );

        const batch = db.batches.find(
          (item) =>
            String(item.batch_id) ===
            String(params.id)
        );

        if (!batch) {
          return HttpResponse.json(
            {
              success: false,
              message: "Batch not found.",
            },
            { status: 404 }
          );
        }

        Object.assign(batch, body);

        return HttpResponse.json({
          success: true,
          message: "Batch updated successfully.",
        });
      }
    ),

    // ========================================
    // ADJUST STOCK
    // ========================================

    http.patch(
      `${API_BASE}/batches/:id/stock`,
      async ({ request, params }) => {
        const body = await request.json();

        const path =
          `/batches/${params.id}/stock`;

        capture(
          "PATCH",
          path,
          request,
          body
        );

        const batch = db.batches.find(
          (item) =>
            String(item.batch_id) ===
            String(params.id)
        );

        if (!batch) {
          return HttpResponse.json(
            {
              success: false,
              message: "Batch not found.",
            },
            { status: 404 }
          );
        }

        batch.stock_quantity =
          Number(batch.stock_quantity) +
          Number(body.quantity);

        return HttpResponse.json({
          success: true,
          message: "Stock adjusted successfully.",
        });
      }
    ),

    // ========================================
    // DEACTIVATE BATCH
    // ========================================

    http.patch(
      `${API_BASE}/batches/:id/deactivate`,
      ({ request, params }) => {
        const path =
          `/batches/${params.id}/deactivate`;

        capture(
          "PATCH",
          path,
          request
        );

        const batch = db.batches.find(
          (item) =>
            String(item.batch_id) ===
            String(params.id)
        );

        if (!batch) {
          return HttpResponse.json(
            {
              success: false,
              message: "Batch not found.",
            },
            { status: 404 }
          );
        }

        batch.is_active = 0;

        return HttpResponse.json({
          success: true,
          message: "Batch deactivated successfully.",
        });
      }
    ),

    // ========================================
    // RESTORE BATCH
    // ========================================

    http.patch(
      `${API_BASE}/batches/:id/restore`,
      ({ request, params }) => {
        const path =
          `/batches/${params.id}/restore`;

        capture(
          "PATCH",
          path,
          request
        );

        const batch = db.batches.find(
          (item) =>
            String(item.batch_id) ===
            String(params.id)
        );

        if (!batch) {
          return HttpResponse.json(
            {
              success: false,
              message: "Batch not found.",
            },
            { status: 404 }
          );
        }

        batch.is_active = 1;

        return HttpResponse.json({
          success: true,
          message: "Batch restored successfully.",
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
// 7. UI HELPERS
// ============================================

async function selectMedicine(id = "1") {
  const select = screen.getByRole(
    "combobox",
    { name: "Medicine" }
  );

  await waitFor(() => {
    expect(select).toBeEnabled();

    expect(
      within(select).getByRole("option", {
        name:
          id === "1"
            ? /Paracetamol 500mg/i
            : id === "2"
              ? /Ibuprofen 200mg/i
              : /Cetirizine 10mg/i,
      })
    ).toBeInTheDocument();
  });

  fireEvent.change(select, {
    target: { value: id },
  });
}

async function renderSelectedPage({
  role = "Admin",
  medicineId = "1",
  batchName = "PAR-001",
} = {}) {
  renderPage(role);

  await selectMedicine(medicineId);

  if (batchName) {
    return screen.findByRole("row", {
      name: new RegExp(batchName, "i"),
    });
  }
}

function getBatchRow(name) {
  return screen.getByRole("row", {
    name: new RegExp(name, "i"),
  });
}

function getDialog() {
  return screen.getByRole("dialog");
}

function dialogButton(name) {
  return within(
    getDialog()
  ).getByRole("button", {
    name,
    exact: true,
  });
}

function changeField(label, value) {
  fireEvent.change(
    within(
      getDialog()
    ).getByLabelText(label),
    {
      target: {
        value: String(value),
      },
    }
  );
}

function fillCreateForm({
  batchNumber = "  PAR-NEW  ",
  purchasePrice = "10.50",
  sellingPrice = "15.75",
  stock = "25",
  expiry = dateAfter(90),
} = {}) {
  changeField(
    "Batch number",
    batchNumber
  );

  changeField(
    "Purchase price",
    purchasePrice
  );

  changeField(
    "Selling price",
    sellingPrice
  );

  changeField(
    "Initial stock quantity",
    stock
  );

  changeField(
    "Expiry date",
    expiry
  );
}

function openCreateModal() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "Add Batch",
    })
  );

  return screen.getByRole("dialog", {
    name: "Add batch",
  });
}

async function openAction(action, batchNumber) {
  const actionNames = {
    edit: `Edit batch ${batchNumber}`,
    stock: `Adjust stock for batch ${batchNumber}`,
    deactivate: `Deactivate batch ${batchNumber}`,
    restore: `Restore batch ${batchNumber}`,
  };

  const titles = {
    edit: "Edit batch",
    stock: "Adjust stock",
    deactivate: "Deactivate batch",
    restore: "Restore batch",
  };

  const buttonNames = {
    edit: "Save Changes",
    stock: "Confirm Adjustment",
    deactivate: "Deactivate",
    restore: "Restore",
  };

  fireEvent.click(
    screen.getByRole("button", {
      name: actionNames[action],
    })
  );

  // Wait for the initial (loading) dialog.
  await screen.findByRole("dialog", {
    name: titles[action],
  });

  // GET /batches/:id completes and React replaces
  // the loading dialog with the final action form.
  // Query the *current screen*, not the old dialog.
  await screen.findByRole("button", {
    name: buttonNames[action],
    exact: true,
  });

  return screen.getByRole("dialog", {
    name: titles[action],
  });
}

function submitDialog(name) {
  fireEvent.click(
    dialogButton(name)
  );
}

function changeFilter(name, value) {
  fireEvent.change(
    screen.getByRole("combobox", {
      name,
    }),
    {
      target: { value },
    }
  );
}

function searchBatches(value) {
  fireEvent.change(
    screen.getByRole("searchbox", {
      name: "Search batches",
    }),
    {
      target: { value },
    }
  );
}

function getTableRows() {
  // Batches has two regions named "Batches list".
  // Scope to the actual table instead.
  return within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1);
}

// ============================================
// 8. SETUP
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

  ({ default: Batches } =
    await import(
      "../../pages/batches/Batches.jsx"
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
// 9. MEDICINE SELECTOR INTEGRATION
// ============================================

describe("Batches - Medicine Selector", () => {
  test("1. does not load batches before medicine selection", async () => {
    const api = installBatchApi();

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", {
          name: "Medicine",
        })
      ).toBeEnabled();
    });

    expect(
      screen.getByText(
        "Choose a medicine above to view its batches."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Add Batch",
      })
    ).toBeDisabled();

    expect(
      api.count(
        "GET",
        "/batches/medicine/1"
      )
    ).toBe(0);

    expect(
      api.count("GET", "/medicines")
    ).toBe(1);
  });

  test("2. loads medicine options with JWT authentication", async () => {
    const api = installBatchApi();

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole("option", {
          name: /Paracetamol 500mg/i,
        })
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("option", {
        name: /Ibuprofen 200mg/i,
      })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("option", {
        name: /Cetirizine 10mg.*inactive medicine/i,
      })
    ).toBeInTheDocument();

    expect(
      api.find(
        "GET",
        "/medicines"
      ).authorization
    ).toMatch(/^Bearer \S+$/);
  });

  test("3. displays empty medicine state", async () => {
    installBatchApi({
      medicines: [],
    });

    renderPage();

    expect(
      await screen.findByText(
        "Add a medicine before creating batches."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Add Batch",
      })
    ).toBeDisabled();
  });

  test("4. handles expected medicines 404 as empty data", async () => {
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
      await screen.findByText(
        "Add a medicine before creating batches."
      )
    ).toBeInTheDocument();
  });

  test("5. reports invalid medicines response", async () => {
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

  test("6. retries medicine loading after HTTP 500", async () => {
    const api = installBatchApi();
    let attempts = 0;

    server.use(
      http.get(
        `${API_BASE}/medicines`,
        () => {
          attempts++;

          if (attempts === 1) {
            return HttpResponse.json(
              {
                success: false,
                message: "Medicine service unavailable.",
              },
              { status: 500 }
            );
          }

          return HttpResponse.json({
            success: true,
            data: api.db.medicines,
          });
        }
      )
    );

    renderPage();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Medicine service unavailable."
    );

    expect(
      screen.getByRole("combobox", {
        name: "Medicine",
      })
    ).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Retry loading medicines",
      })
    );

    await waitFor(() => {
      expect(
        screen.getByRole("option", {
          name: /Paracetamol 500mg/i,
        })
      ).toBeInTheDocument();
    });

    expect(attempts).toBe(2);
  });

  test("7. clears session when medicine lookup returns HTTP 401", async () => {
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

  test("8. displays batches for inactive medicine but disables creation", async () => {
    installBatchApi();

    await renderSelectedPage({
      medicineId: "3",
      batchName: "CET-001",
    });

    expect(
      screen.getByText(
        /Inactive medicine: existing batches remain visible/
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Add Batch",
      })
    ).toBeDisabled();

    expect(
      getBatchRow("CET-001")
    ).toBeInTheDocument();
  });

  test("9. warns when manufacturer is inactive", async () => {
    installBatchApi();

    await renderSelectedPage({
      medicineId: "2",
      batchName: "IBU-001",
    });

    expect(
      screen.getByText(
        /Inactive manufacturer: these batches are excluded/
      )
    ).toBeInTheDocument();

    expect(
      getBatchRow("IBU-001")
    ).toBeInTheDocument();
  });
});

// ============================================
// 10. GET BATCHES INTEGRATION
// ============================================

describe("Batches - GET Integration", () => {
  test("10. loads selected medicine batches with real API and JWT", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    expect(
      getBatchRow("PAR-001")
    ).toBeInTheDocument();

    expect(
      getBatchRow("PAR-002")
    ).toBeInTheDocument();

    expect(
      getBatchRow("PAR-003")
    ).toBeInTheDocument();

    expect(
      within(
        getBatchRow("PAR-001")
      ).getByText("Active")
    ).toBeInTheDocument();

    expect(
      within(
        getBatchRow("PAR-003")
      ).getByText("Inactive")
    ).toBeInTheDocument();

    expect(
      within(
        getBatchRow("PAR-002")
      ).getByText("Out of stock")
    ).toBeInTheDocument();

    expect(
      api.find(
        "GET",
        "/batches/medicine/1"
      ).authorization
    ).toMatch(/^Bearer \S+$/);

    expect(
      api.count(
        "GET",
        "/batches/medicine/1"
      )
    ).toBe(1);
  });

  test("11. displays loading state during pending batches request", async () => {
    installBatchApi();

    let release;

    const pending = new Promise(
      (resolve) => {
        release = resolve;
      }
    );

    server.use(
      http.get(
        `${API_BASE}/batches/medicine/:id`,
        async () => {
          await pending;

          return HttpResponse.json({
            success: true,
            data: initialBatches().filter(
              (item) => item.medicine_id === 1
            ),
          });
        }
      )
    );

    renderPage();

    await selectMedicine("1");

    await waitFor(() => {
      expect(
        screen.getByLabelText("Batches list")
          .querySelector('[aria-busy="true"]')
      ).toBeInTheDocument();

      expect(
        screen.getAllByText(
          "Loading batches..."
        ).length
      ).toBeGreaterThan(0);
    });

    await act(async () => {
      release();
    });

    expect(
      await screen.findByRole("row", {
        name: /PAR-001/i,
      })
    ).toBeInTheDocument();
  });

  test("12. displays no batches for an empty success response", async () => {
    installBatchApi({
      batches: [],
    });

    renderPage();

    await selectMedicine();

    expect(
      await screen.findByRole("heading", {
        name: "No batches found",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Use Add Batch to create the first batch for this medicine."
      )
    ).toBeInTheDocument();
  });

  test("13. converts expected HTTP 404 into empty batches", async () => {
    installBatchApi();

    server.use(
      http.get(
        `${API_BASE}/batches/medicine/:id`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message:
                "No batches found for this medicine.",
            },
            { status: 404 }
          )
      )
    );

    renderPage();

    await selectMedicine();

    expect(
      await screen.findByRole("heading", {
        name: "No batches found",
      })
    ).toBeInTheDocument();
  });

  test("14. rejects invalid batches list", async () => {
    installBatchApi();

    server.use(
      http.get(
        `${API_BASE}/batches/medicine/:id`,
        () =>
          HttpResponse.json({
            success: true,
            data: {},
          })
      )
    );

    renderPage();

    await selectMedicine();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "The server returned an invalid batches list."
    );
  });

  test("15. displays HTTP 500 batches error", async () => {
    installBatchApi();

    server.use(
      http.get(
        `${API_BASE}/batches/medicine/:id`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Batch database unavailable.",
            },
            { status: 500 }
          )
      )
    );

    renderPage();

    await selectMedicine();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Batch database unavailable."
    );
  });

  test("16. displays network failures", async () => {
    installBatchApi();

    server.use(
      http.get(
        `${API_BASE}/batches/medicine/:id`,
        () => HttpResponse.error()
      )
    );

    renderPage();

    await selectMedicine();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to connect to the server."
    );
  });

  test("17. keeps authentication for HTTP 403", async () => {
    installBatchApi();

    server.use(
      http.get(
        `${API_BASE}/batches/medicine/:id`,
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

    await selectMedicine();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Access forbidden."
    );

    expect(
      screen.getByTestId("auth-state")
    ).toHaveTextContent("authenticated");
  });

  test("18. logs out after HTTP 401 batches response", async () => {
    installBatchApi();

    server.use(
      http.get(
        `${API_BASE}/batches/medicine/:id`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Token expired.",
            },
            { status: 401 }
          )
      )
    );

    renderPage();

    await selectMedicine();

    await waitFor(() => {
      expect(
        screen.getByTestId("auth-state")
      ).toHaveTextContent("guest");
    });
  });

  test("19. retries batches after an initial failure", async () => {
    installBatchApi();

    let attempts = 0;

    server.use(
      http.get(
        `${API_BASE}/batches/medicine/:id`,
        () => {
          attempts++;

          if (attempts === 1) {
            return HttpResponse.json(
              {
                success: false,
                message: "Temporary batch error.",
              },
              { status: 500 }
            );
          }

          return HttpResponse.json({
            success: true,
            data: initialBatches().filter(
              (item) => item.medicine_id === 1
            ),
          });
        }
      )
    );

    renderPage();

    await selectMedicine();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Temporary batch error."
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reload batches",
      })
    );

    expect(
      await screen.findByRole("row", {
        name: /PAR-001/i,
      })
    ).toBeInTheDocument();

    expect(attempts).toBe(2);
  });

  test("20. switches medicines and loads the correct batches", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    await selectMedicine("2");

    expect(
      await screen.findByRole("row", {
        name: /IBU-001/i,
      })
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("row", {
        name: /PAR-001/i,
      })
    ).not.toBeInTheDocument();

    expect(
      api.count(
        "GET",
        "/batches/medicine/2"
      )
    ).toBe(1);
  });

  test("21. ignores stale batch response after changing medicine", async () => {
    installBatchApi();

    let releaseOld;

    const pending = new Promise(
      (resolve) => {
        releaseOld = resolve;
      }
    );

    server.use(
      http.get(
        `${API_BASE}/batches/medicine/:id`,
        async ({ params }) => {
          if (params.id === "1") {
            await pending;
          }

          return HttpResponse.json({
            success: true,
            data: initialBatches().filter(
              (item) =>
                String(item.medicine_id) ===
                String(params.id)
            ),
          });
        }
      )
    );

    renderPage();

    await selectMedicine("1");

    await waitFor(() => {
      expect(
        screen.getByLabelText("Batches list")
          .querySelector('[aria-busy="true"]')
      ).toBeInTheDocument();
    });

    await selectMedicine("2");

    expect(
      await screen.findByRole("row", {
        name: /IBU-001/i,
      })
    ).toBeInTheDocument();

    await act(async () => {
      releaseOld();
    });

    expect(
      getBatchRow("IBU-001")
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("row", {
        name: /PAR-001/i,
      })
    ).not.toBeInTheDocument();
  });
});

// ============================================
// 11. SEARCH, FILTERS AND SORTING
// ============================================

describe("Batches - Filters and Sorting", () => {
  test("22. searches batch numbers without refetching", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    searchBatches("  par-002  ");

    expect(
      getBatchRow("PAR-002")
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("row", {
        name: /PAR-001/i,
      })
    ).not.toBeInTheDocument();

    expect(
      api.count(
        "GET",
        "/batches/medicine/1"
      )
    ).toBe(1);
  });

  test("23. filters inactive batches", async () => {
    installBatchApi();

    await renderSelectedPage();

    changeFilter(
      "Batch status",
      "Inactive"
    );

    expect(
      getBatchRow("PAR-003")
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("row", {
        name: /PAR-001/i,
      })
    ).not.toBeInTheDocument();
  });

  test("24. filters batches expiring within 10 days", async () => {
    installBatchApi();

    await renderSelectedPage();

    changeFilter("Expiry", "Soon");

    expect(
      getBatchRow("PAR-002")
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("row", {
        name: /PAR-003/i,
      })
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("row", {
        name: /PAR-004/i,
      })
    ).not.toBeInTheDocument();
  });

  test("25. filters expired batches", async () => {
    installBatchApi();

    await renderSelectedPage();

    changeFilter("Expiry", "Expired");

    expect(
      getBatchRow("PAR-003")
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("row", {
        name: /PAR-002/i,
      })
    ).not.toBeInTheDocument();
  });

  test("26. filters batches with more than 10 days left", async () => {
    installBatchApi();

    await renderSelectedPage();

    changeFilter("Expiry", "Later");

    expect(
      getBatchRow("PAR-001")
    ).toBeInTheDocument();

    expect(
      getBatchRow("PAR-004")
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("row", {
        name: /PAR-002/i,
      })
    ).not.toBeInTheDocument();
  });

  test("27. combines search, status and expiry filters", async () => {
    installBatchApi();

    await renderSelectedPage();

    searchBatches("PAR-003");

    changeFilter(
      "Batch status",
      "Inactive"
    );

    changeFilter(
      "Expiry",
      "Expired"
    );

    expect(
      getBatchRow("PAR-003")
    ).toBeInTheDocument();

    expect(getTableRows()).toHaveLength(1);
  });

  test("28. clears filters without an API request", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    searchBatches("PAR-003");

    changeFilter(
      "Batch status",
      "Inactive"
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Clear filters",
      })
    );

    expect(
      getBatchRow("PAR-001")
    ).toBeInTheDocument();

    expect(
      getBatchRow("PAR-003")
    ).toBeInTheDocument();

    expect(getTableRows()).toHaveLength(4);

    expect(
      api.count(
        "GET",
        "/batches/medicine/1"
      )
    ).toBe(1);
  });

  test("29. displays no matching batches", async () => {
    installBatchApi();

    await renderSelectedPage();

    searchBatches("UNKNOWN-999");

    expect(
      screen.getByRole("heading", {
        name: "No matching batches",
      })
    ).toBeInTheDocument();

    // The filter toolbar and empty state each show
    // a "Clear filters" button.
    expect(
      screen.getAllByRole("button", {
        name: "Clear filters",
      })
    ).toHaveLength(2);
  });

  test("30. sorts batch stock locally", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Stock: sort ascending",
      })
    );

    let rows = getTableRows();

    expect(rows[0]).toHaveTextContent(
      "PAR-002"
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Stock: sort descending",
      })
    );

    rows = getTableRows();

    expect(rows[0]).toHaveTextContent(
      "PAR-001"
    );

    expect(
      api.count(
        "GET",
        "/batches/medicine/1"
      )
    ).toBe(1);
  });

  test("31. displays expired and expiring summary counts", async () => {
    installBatchApi();

    await renderSelectedPage();

    const summary = screen.getByRole(
      "group",
      {
        name: "Summary before filtering",
      }
    );

    expect(
      within(summary).getByText(
        "batches"
      )
    ).toBeInTheDocument();

    expect(
      within(summary).getByText(
        "expire within 10 days"
      )
    ).toBeInTheDocument();

    expect(
      within(summary).getByText(
        "expired"
      )
    ).toBeInTheDocument();
  });

  test("32. reloads both medicines and batches", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    api.db.batches.push({
      batch_id: 105,
      medicine_id: 1,
      batch_number: "PAR-105",
      purchase_price: 12,
      selling_price: 18,
      stock_quantity: 10,
      expiry_date: dateAfter(100),
      is_active: 1,
      created_at: dateAfter(0),
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reload batches",
      })
    );

    expect(
      await screen.findByRole("row", {
        name: /PAR-105/i,
      })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        api.count("GET", "/medicines")
      ).toBe(2);
    });

    expect(
      api.count(
        "GET",
        "/batches/medicine/1"
      )
    ).toBe(2);
  });

  test("33. resets search and filters when another medicine is selected", async () => {
    installBatchApi();

    await renderSelectedPage();

    searchBatches("PAR-003");

    changeFilter(
      "Batch status",
      "Inactive"
    );

    changeFilter(
      "Expiry",
      "Expired"
    );

    await selectMedicine("2");

    expect(
      await screen.findByRole("row", {
        name: /IBU-001/i,
      })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("searchbox", {
        name: "Search batches",
      })
    ).toHaveValue("");

    expect(
      screen.getByRole("combobox", {
        name: "Batch status",
      })
    ).toHaveValue("All");

    expect(
      screen.getByRole("combobox", {
        name: "Expiry",
      })
    ).toHaveValue("All");
  });
});

// ============================================
// 12. ROLE PERMISSIONS
// ============================================

describe("Batches - Role Permissions", () => {
  test.each([
    "Pharmacist",
    "Customer",
  ])(
    "34. %s can view batches but not manage them",
    async (role) => {
      installBatchApi();

      await renderSelectedPage({
        role,
      });

      expect(
        getBatchRow("PAR-001")
      ).toBeInTheDocument();

      expect(
        screen.queryByRole("button", {
          name: "Add Batch",
        })
      ).not.toBeInTheDocument();

      expect(
        screen.queryByRole("button", {
          name: "Edit batch PAR-001",
        })
      ).not.toBeInTheDocument();

      expect(
        screen.queryByRole("button", {
          name:
            "Adjust stock for batch PAR-001",
        })
      ).not.toBeInTheDocument();
    }
  );
});

// ============================================
// 13. CREATE BATCH - POST
// ============================================

describe("Batches - POST Integration", () => {
  test("35. creates a batch with correct JSON and refreshes UI", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    openCreateModal();

    fillCreateForm();

    submitDialog("Add Batch");

    expect(
      await screen.findByRole("row", {
        name: /PAR-NEW/i,
      })
    ).toBeInTheDocument();

    const request = api.find(
      "POST",
      "/batches"
    );

    expect(request.body).toEqual({
      batch_number: "PAR-NEW",
      purchase_price: 10.5,
      selling_price: 15.75,
      stock_quantity: 25,
      expiry_date: dateAfter(90),
      medicine_id: 1,
    });

    expect(request.authorization).toMatch(
      /^Bearer \S+$/
    );

    expect(request.contentType).toContain(
      "application/json"
    );

    expect(
      screen.getByText(
        "Batch created successfully."
      )
    ).toBeInTheDocument();

    expect(
      api.count(
        "GET",
        "/batches/medicine/1"
      )
    ).toBe(2);
  });

  test("36. accepts zero initial stock", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    openCreateModal();

    fillCreateForm({
      batchNumber: "PAR-ZERO",
      stock: "0",
    });

    submitDialog("Add Batch");

    expect(
      await screen.findByRole("row", {
        name: /PAR-ZERO/i,
      })
    ).toBeInTheDocument();

    expect(
      api.find(
        "POST",
        "/batches"
      ).body.stock_quantity
    ).toBe(0);

    expect(
      within(
        getBatchRow("PAR-ZERO")
      ).getByText("Out of stock")
    ).toBeInTheDocument();
  });

  test("37. blocks missing required fields", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    openCreateModal();

    submitDialog("Add Batch");

    expect(
      within(
        getDialog()
      ).getByText(
        "Enter the batch number."
      )
    ).toBeInTheDocument();

    expect(
      within(
        getDialog()
      ).getAllByText(
        /Enter a price from 0 to 99999999.99/
      )
    ).toHaveLength(2);

    expect(
      within(
        getDialog()
      ).getByText(
        "Choose a future expiry date."
      )
    ).toBeInTheDocument();

    expect(
      api.count("POST", "/batches")
    ).toBe(0);
  });

  test("38. rejects selling price below purchase price", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    openCreateModal();

    fillCreateForm({
      purchasePrice: "50",
      sellingPrice: "40",
    });

    submitDialog("Add Batch");

    expect(
      within(
        getDialog()
      ).getByText(
        "Selling price cannot be less than purchase price."
      )
    ).toBeInTheDocument();

    expect(
      api.count("POST", "/batches")
    ).toBe(0);
  });

  test.each([
    "-1",
    "10.123",
    "100000000",
  ])(
    "39. rejects invalid purchase price %s",
    async (price) => {
      const api = installBatchApi();

      await renderSelectedPage();

      openCreateModal();

      fillCreateForm({
        purchasePrice: price,
      });

      submitDialog("Add Batch");

      expect(
        within(
          getDialog()
        ).getByText(
          /Enter a price from 0 to 99999999.99/
        )
      ).toBeInTheDocument();

      expect(
        api.count("POST", "/batches")
      ).toBe(0);
    }
  );

  test.each([
    "-1",
    "1.5",
    "2147483648",
  ])(
    "40. rejects invalid initial stock %s",
    async (stock) => {
      const api = installBatchApi();

      await renderSelectedPage();

      openCreateModal();

      fillCreateForm({
        stock,
      });

      submitDialog("Add Batch");

      expect(
        within(
          getDialog()
        ).getByText(
          /Enter a whole number from 0 to/
        )
      ).toBeInTheDocument();

      expect(
        api.count("POST", "/batches")
      ).toBe(0);
    }
  );

  test.each([
    () => dateAfter(-1),
    () => dateAfter(0),
  ])(
    "41. rejects expired or today's expiry date",
    async (getDate) => {
      const api = installBatchApi();

      await renderSelectedPage();

      openCreateModal();

      fillCreateForm({
        expiry: getDate(),
      });

      submitDialog("Add Batch");

      expect(
        within(
          getDialog()
        ).getByText(
          "Choose a future expiry date."
        )
      ).toBeInTheDocument();

      expect(
        api.count("POST", "/batches")
      ).toBe(0);
    }
  );

  test("42. prevents creating batches for inactive medicine", async () => {
    const api = installBatchApi();

    await renderSelectedPage({
      medicineId: "3",
      batchName: "CET-001",
    });

    expect(
      screen.getByRole("button", {
        name: "Add Batch",
      })
    ).toBeDisabled();

    expect(
      api.count("POST", "/batches")
    ).toBe(0);
  });

  test("43. shows POST failure without updating the table", async () => {
    const api = installBatchApi();

    server.use(
      http.post(
        `${API_BASE}/batches`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Duplicate batch number.",
            },
            { status: 409 }
          )
      )
    );

    await renderSelectedPage();

    openCreateModal();

    fillCreateForm();

    submitDialog("Add Batch");

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Duplicate batch number."
    );

    expect(
      api.count(
        "GET",
        "/batches/medicine/1"
      )
    ).toBe(1);

    expect(
      screen.queryByRole("row", {
        name: /PAR-NEW/i,
      })
    ).not.toBeInTheDocument();
  });

  test("44. cancelling creation sends no POST", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    openCreateModal();

    fillCreateForm();

    submitDialog("Cancel");

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    expect(
      api.count("POST", "/batches")
    ).toBe(0);
  });

  test("45. prevents duplicate POST requests while saving", async () => {
    installBatchApi();

    let release;
    let postCount = 0;

    const pending = new Promise(
      (resolve) => {
        release = resolve;
      }
    );

    server.use(
      http.post(
        `${API_BASE}/batches`,
        async () => {
          postCount++;

          await pending;

          return HttpResponse.json(
            {
              success: true,
              message: "Batch saved.",
            },
            { status: 201 }
          );
        }
      )
    );

    await renderSelectedPage();

    openCreateModal();

    fillCreateForm();

    submitDialog("Add Batch");

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
        "Batch saved."
      )
    ).toBeInTheDocument();

    expect(postCount).toBe(1);
  });
});

// ============================================
// 14. GET BATCH DETAILS + PUT UPDATE
// ============================================

describe("Batches - Details and PUT Integration", () => {
  test("46. fetches latest batch details before editing", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    // The table was loaded with PAR-001.
    // Simulate another operation changing
    // batch details before editing.

    api.db.batches.find(
      (item) => item.batch_id === 101
    ).purchase_price = "13.50";

    await openAction(
      "edit",
      "PAR-001"
    );

    expect(
      within(
        getDialog()
      ).getByLabelText(
        "Purchase price"
      )
    ).toHaveValue(13.5);

    expect(
      api.count(
        "GET",
        "/batches/101"
      )
    ).toBe(1);

    expect(
      api.find(
        "GET",
        "/batches/101"
      ).authorization
    ).toMatch(/^Bearer \S+$/);
  });

  test("47. retries loading batch details after HTTP 500", async () => {
    const api = installBatchApi();

    let attempts = 0;

    server.use(
      http.get(
        `${API_BASE}/batches/:id`,
        ({ params }) => {
          attempts++;

          if (attempts === 1) {
            return HttpResponse.json(
              {
                success: false,
                message: "Batch details unavailable.",
              },
              { status: 500 }
            );
          }

          return HttpResponse.json({
            success: true,
            data: {
              ...api.db.batches.find(
                (item) =>
                  String(item.batch_id) ===
                  String(params.id)
              ),
            },
          });
        }
      )
    );

    await renderSelectedPage();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit batch PAR-001",
      })
    );

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Batch details unavailable."
    );

    fireEvent.click(
      within(
        getDialog()
      ).getByRole("button", {
        name: "Try again",
      })
    );

    // Retry replaces the error dialog with the form.
    expect(
      await screen.findByLabelText("Batch number")
    ).toHaveValue("PAR-001");

    expect(attempts).toBe(2);
  });

  test("48. updates batch using PUT with the correct payload", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    await openAction(
      "edit",
      "PAR-001"
    );

    changeField(
      "Batch number",
      "  PAR-UPDATED  "
    );

    changeField(
      "Purchase price",
      "14.50"
    );

    changeField(
      "Selling price",
      "20.75"
    );

    changeField(
      "Expiry date",
      dateAfter(150)
    );

    submitDialog("Save Changes");

    expect(
      await screen.findByRole("row", {
        name: /PAR-UPDATED/i,
      })
    ).toBeInTheDocument();

    const request = api.find(
      "PUT",
      "/batches/101"
    );

    expect(request.body).toEqual({
      batch_number: "PAR-UPDATED",
      purchase_price: 14.5,
      selling_price: 20.75,
      expiry_date: dateAfter(150),
    });

    // Updating batch details must not
    // silently modify quantity.
    expect(
      api.db.batches.find(
        (item) => item.batch_id === 101
      ).stock_quantity
    ).toBe("20");

    expect(
      api.count(
        "GET",
        "/batches/medicine/1"
      )
    ).toBe(2);
  });

  test("49. disables PUT if batch details have not changed", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    await openAction(
      "edit",
      "PAR-001"
    );

    expect(
      dialogButton("Save Changes")
    ).toBeDisabled();

    expect(
      api.count(
        "PUT",
        "/batches/101"
      )
    ).toBe(0);
  });

  test("50. preserves old table data after failed PUT", async () => {
    const api = installBatchApi();

    server.use(
      http.put(
        `${API_BASE}/batches/:id`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Unable to update batch.",
            },
            { status: 500 }
          )
      )
    );

    await renderSelectedPage();

    await openAction(
      "edit",
      "PAR-001"
    );

    changeField(
      "Batch number",
      "PAR-FAILED"
    );

    submitDialog("Save Changes");

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Unable to update batch."
    );

    expect(
      getBatchRow("PAR-001")
    ).toBeInTheDocument();

    expect(
      api.count(
        "GET",
        "/batches/medicine/1"
      )
    ).toBe(1);
  });

  test("51. blocks editing inactive batches", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    expect(
      screen.getByRole("button", {
        name: "Edit batch PAR-003",
      })
    ).toBeDisabled();

    expect(
      api.count(
        "PUT",
        "/batches/103"
      )
    ).toBe(0);
  });

  test("52. rejects invalid GET batch details", async () => {
    installBatchApi();

    server.use(
      http.get(
        `${API_BASE}/batches/:id`,
        () =>
          HttpResponse.json({
            success: true,
            data: {},
          })
      )
    );

    await renderSelectedPage();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit batch PAR-001",
      })
    );

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "The server returned invalid batch details."
    );
  });
});

// ============================================
// 15. STOCK ADJUSTMENT INTEGRATION
// ============================================

describe("Batches - Stock Integration", () => {
  test("53. adds stock using positive PATCH quantity", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    await openAction(
      "stock",
      "PAR-001"
    );

    expect(
      within(
        getDialog()
      ).getByText(
        /Current stock:/
      )
    ).toHaveTextContent("20");

    changeField(
      "Quantity to add",
      "5"
    );

    expect(
      within(
        getDialog()
      ).getByText(
        /Expected stock after adjustment:/
      )
    ).toHaveTextContent("25");

    submitDialog(
      "Confirm Adjustment"
    );

    await waitFor(() => {
      expect(
        getBatchRow("PAR-001")
      ).toHaveTextContent("25");
    });

    expect(
      api.find(
        "PATCH",
        "/batches/101/stock"
      ).body
    ).toEqual({
      quantity: 5,
    });

    expect(
      api.count(
        "GET",
        "/batches/medicine/1"
      )
    ).toBe(2);
  });

  test("54. removes stock using negative PATCH quantity", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    await openAction(
      "stock",
      "PAR-001"
    );

    changeField(
      "Adjustment",
      "remove"
    );

    changeField(
      "Quantity to remove",
      "7"
    );

    expect(
      within(
        getDialog()
      ).getByText(
        /Expected stock after adjustment:/
      )
    ).toHaveTextContent("13");

    submitDialog(
      "Confirm Adjustment"
    );

    await waitFor(() => {
      expect(
        getBatchRow("PAR-001")
      ).toHaveTextContent("13");
    });

    expect(
      api.find(
        "PATCH",
        "/batches/101/stock"
      ).body
    ).toEqual({
      quantity: -7,
    });
  });

  test.each([
    "0",
    "-1",
    "1.5",
    "2147483648",
  ])(
    "55. rejects invalid stock adjustment quantity %s",
    async (quantity) => {
      const api = installBatchApi();

      await renderSelectedPage();

      await openAction(
        "stock",
        "PAR-001"
      );

      changeField(
        "Quantity to add",
        quantity
      );

      submitDialog(
        "Confirm Adjustment"
      );

      expect(
        within(
          getDialog()
        ).getByText(
          /Enter a whole number from 1 to/
        )
      ).toBeInTheDocument();

      expect(
        api.count(
          "PATCH",
          "/batches/101/stock"
        )
      ).toBe(0);
    }
  );

  test("56. prevents removing more than current stock", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    await openAction(
      "stock",
      "PAR-001"
    );

    changeField(
      "Adjustment",
      "remove"
    );

    changeField(
      "Quantity to remove",
      "21"
    );

    submitDialog(
      "Confirm Adjustment"
    );

    expect(
      within(
        getDialog()
      ).getByText(
        "You cannot remove more than the current stock."
      )
    ).toBeInTheDocument();

    expect(
      api.count(
        "PATCH",
        "/batches/101/stock"
      )
    ).toBe(0);
  });

  test("57. handles failed stock adjustment without changing displayed quantity", async () => {
    const api = installBatchApi();

    server.use(
      http.patch(
        `${API_BASE}/batches/:id/stock`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Insufficient stock.",
            },
            { status: 409 }
          )
      )
    );

    await renderSelectedPage();

    await openAction(
      "stock",
      "PAR-001"
    );

    changeField(
      "Adjustment",
      "remove"
    );

    changeField(
      "Quantity to remove",
      "5"
    );

    submitDialog(
      "Confirm Adjustment"
    );

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Insufficient stock."
    );

    expect(
      getBatchRow("PAR-001")
    ).toHaveTextContent("20");

    expect(
      api.count(
        "GET",
        "/batches/medicine/1"
      )
    ).toBe(1);
  });

  test("58. disables stock adjustments for inactive batches", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    expect(
      screen.getByRole("button", {
        name:
          "Adjust stock for batch PAR-003",
      })
    ).toBeDisabled();

    expect(
      api.count(
        "PATCH",
        "/batches/103/stock"
      )
    ).toBe(0);
  });
});

// ============================================
// 16. DEACTIVATE AND RESTORE
// ============================================

describe("Batches - PATCH Status Integration", () => {
  test("59. deactivates batch and refreshes status", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    await openAction(
      "deactivate",
      "PAR-001"
    );

    expect(
      within(
        getDialog()
      ).getByText(
        /Its details and quantity will be kept/
      )
    ).toBeInTheDocument();

    submitDialog("Deactivate");

    await waitFor(() => {
      expect(
        within(
          getBatchRow("PAR-001")
        ).getByText("Inactive")
      ).toBeInTheDocument();
    });

    expect(
      api.count(
        "PATCH",
        "/batches/101/deactivate"
      )
    ).toBe(1);

    expect(
      screen.getByRole("button", {
        name: "Edit batch PAR-001",
      })
    ).toBeDisabled();

    expect(
      api.count(
        "GET",
        "/batches/medicine/1"
      )
    ).toBe(2);
  });

  test("60. restores batch and enables management", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    await openAction(
      "restore",
      "PAR-003"
    );

    expect(
      within(
        getDialog()
      ).getByText(
        /Available inventory still depends on expiry/
      )
    ).toBeInTheDocument();

    submitDialog("Restore");

    await waitFor(() => {
      expect(
        within(
          getBatchRow("PAR-003")
        ).getByText("Active")
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", {
        name: "Edit batch PAR-003",
      })
    ).toBeEnabled();

    expect(
      api.count(
        "PATCH",
        "/batches/103/restore"
      )
    ).toBe(1);
  });

  test("61. cancellation does not deactivate batch", async () => {
    const api = installBatchApi();

    await renderSelectedPage();

    await openAction(
      "deactivate",
      "PAR-001"
    );

    submitDialog("Cancel");

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    expect(
      api.count(
        "PATCH",
        "/batches/101/deactivate"
      )
    ).toBe(0);

    expect(
      within(
        getBatchRow("PAR-001")
      ).getByText("Active")
    ).toBeInTheDocument();
  });

  test("62. failed deactivation preserves active state", async () => {
    const api = installBatchApi();

    server.use(
      http.patch(
        `${API_BASE}/batches/:id/deactivate`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Batch cannot be deactivated.",
            },
            { status: 409 }
          )
      )
    );

    await renderSelectedPage();

    await openAction(
      "deactivate",
      "PAR-001"
    );

    submitDialog("Deactivate");

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Batch cannot be deactivated."
    );

    expect(
      within(
        getBatchRow("PAR-001")
      ).getByText("Active")
    ).toBeInTheDocument();

    expect(
      api.count(
        "GET",
        "/batches/medicine/1"
      )
    ).toBe(1);
  });

  test("63. failed restoration preserves inactive state", async () => {
    const api = installBatchApi();

    server.use(
      http.patch(
        `${API_BASE}/batches/:id/restore`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Batch cannot be restored.",
            },
            { status: 500 }
          )
      )
    );

    await renderSelectedPage();

    await openAction(
      "restore",
      "PAR-003"
    );

    submitDialog("Restore");

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Batch cannot be restored."
    );

    expect(
      within(
        getBatchRow("PAR-003")
      ).getByText("Inactive")
    ).toBeInTheDocument();

    expect(
      api.count(
        "GET",
        "/batches/medicine/1"
      )
    ).toBe(1);
  });

  test("64. prevents duplicate PATCH while deactivation is pending", async () => {
    installBatchApi();

    let release;
    let patchCount = 0;

    const pending = new Promise(
      (resolve) => {
        release = resolve;
      }
    );

    server.use(
      http.patch(
        `${API_BASE}/batches/:id/deactivate`,
        async () => {
          patchCount++;

          await pending;

          return HttpResponse.json({
            success: true,
            message: "Batch deactivated.",
          });
        }
      )
    );

    await renderSelectedPage();

    await openAction(
      "deactivate",
      "PAR-001"
    );

    submitDialog("Deactivate");

    await waitFor(() => {
      expect(patchCount).toBe(1);
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

    expect(patchCount).toBe(1);

    await act(async () => {
      release();
    });

    expect(
      await screen.findByText(
        "Batch deactivated."
      )
    ).toBeInTheDocument();

    expect(patchCount).toBe(1);
  });
});
