
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
  Link,
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
let NewSale;
let SalesHistory;

// ============================================
// 2. TEST DATA
// ============================================

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

function initialInventory() {
  return [
    {
      medicine_id: 1,
      medicine_name: "Paracetamol 500mg",
      manufacturer_id: 11,
      manufacturer_name: "ABC Pharma",
      category: "Tablet",
      reorder_level: "10",
      available_stock: "6",
      batches: [
        {
          batch_id: 502,
          batch_number: "PAR-LATE",
          selling_price: "12.75",
          stock_quantity: "2",
          expiry_date: dateAfter(30),
          days_to_expire: "30",
        },
        {
          batch_id: 501,
          batch_number: "PAR-SOON",
          selling_price: "15.50",
          stock_quantity: "4",
          expiry_date: dateAfter(3),
          days_to_expire: "3",
        },
      ],
    },
    {
      medicine_id: 2,
      medicine_name: "Ibuprofen 200mg",
      manufacturer_id: 12,
      manufacturer_name: "Health Labs",
      category: "Capsule",
      reorder_level: "5",
      available_stock: "5",
      batches: [
        {
          batch_id: 601,
          batch_number: "IBU-001",
          selling_price: "20.25",
          stock_quantity: "5",
          expiry_date: dateAfter(60),
          days_to_expire: "60",
        },
      ],
    },
  ];
}

function initialSales() {
  return [
    {
      sale_id: "901",
      customer_name: "Alice",
      pharmacist_name: "Ravi",
      payment_mode: "Cash",
      total_amount: "31.00",
      created_at: "2026-11-02T10:00:00",
    },
    {
      sale_id: "902",
      customer_name: null,
      pharmacist_name: null,
      payment_mode: "UPI",
      total_amount: "20.25",
      created_at: "2026-11-04T10:00:00",
    },
    {
      sale_id: "903",
      customer_name: "Bob",
      pharmacist_name: "Ravi",
      payment_mode: "Card",
      total_amount: "12.75",
      created_at: "2026-11-03T10:00:00",
    },
  ];
}

function initialSaleDetails() {
  return {
    901: {
      ...initialSales()[0],
      items: [
        {
          sale_item_id: "11",
          sale_id: "901",
          medicine_id: "1",
          medicine_name: "Paracetamol 500mg",
          manufacturer_name: "ABC Pharma",
          batch_id: "501",
          batch_number: "PAR-SOON",
          quantity: "2",
          selling_price: "15.50",
          subtotal: "31.00",
        },
      ],
    },
    902: {
      ...initialSales()[1],
      items: [
        {
          sale_item_id: "12",
          sale_id: "902",
          medicine_id: "2",
          medicine_name: "Ibuprofen 200mg",
          manufacturer_name: "Health Labs",
          batch_id: "601",
          batch_number: "IBU-001",
          quantity: "1",
          selling_price: "20.25",
          subtotal: "20.25",
        },
      ],
    },
    903: {
      ...initialSales()[2],
      items: [
        {
          sale_item_id: "13",
          sale_id: "903",
          medicine_id: "1",
          medicine_name: "Paracetamol 500mg",
          manufacturer_name: "ABC Pharma",
          batch_id: "502",
          batch_number: "PAR-LATE",
          quantity: "1",
          selling_price: "12.75",
          subtotal: "12.75",
        },
      ],
    },
  };
}

// ============================================
// 3. STATEFUL MOCK BACKEND
// ============================================

function installSalesApi({
  inventory = initialInventory(),
  sales = initialSales(),
  details = initialSaleDetails(),
} = {}) {
  const db = {
    inventory: structuredClone(inventory),
    sales: structuredClone(sales),
    details: structuredClone(details),
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
      accept:
        request.headers.get("accept"),
    });
  }

  server.use(
    // ========================================
    // GET /batches/inventory
    // ========================================

    http.get(
      `${API_BASE}/batches/inventory`,
      ({ request }) => {
        capture(
          "GET",
          "/batches/inventory",
          request
        );

        return HttpResponse.json({
          success: true,
          data: structuredClone(db.inventory),
        });
      }
    ),

    // ========================================
    // POST /sales
    // ========================================

    http.post(
      `${API_BASE}/sales`,
      async ({ request }) => {
        const body = await request.json();

        capture(
          "POST",
          "/sales",
          request,
          body
        );

        let total = 0;

        const saleItems = [];

        for (const item of body.items) {
          const medicine = db.inventory.find(
            (entry) =>
              entry.batches.some(
                (batch) =>
                  Number(batch.batch_id) ===
                  Number(item.batch_id)
              )
          );

          const batch = medicine?.batches.find(
            (entry) =>
              Number(entry.batch_id) ===
              Number(item.batch_id)
          );

          if (
            !batch ||
            Number(batch.stock_quantity) <
              Number(item.quantity)
          ) {
            return HttpResponse.json(
              {
                success: false,
                message: "Insufficient stock.",
              },
              { status: 409 }
            );
          }

          const subtotal =
            Number(batch.selling_price) *
            Number(item.quantity);

          total += subtotal;

          saleItems.push({
            sale_item_id: saleItems.length + 100,
            sale_id: 904,
            medicine_id: medicine.medicine_id,
            medicine_name: medicine.medicine_name,
            manufacturer_name:
              medicine.manufacturer_name,
            batch_id: batch.batch_id,
            batch_number: batch.batch_number,
            quantity: item.quantity,
            selling_price: batch.selling_price,
            subtotal,
          });
        }

        // Simulate the backend reducing stock.
        for (const item of body.items) {
          const medicine = db.inventory.find(
            (entry) =>
              entry.batches.some(
                (batch) =>
                  Number(batch.batch_id) ===
                  Number(item.batch_id)
              )
          );

          const batch = medicine.batches.find(
            (entry) =>
              Number(entry.batch_id) ===
              Number(item.batch_id)
          );

          batch.stock_quantity =
            Number(batch.stock_quantity) -
            Number(item.quantity);

          medicine.available_stock =
            Number(medicine.available_stock) -
            Number(item.quantity);
        }

        total = Math.round(total * 100) / 100;

        const sale = {
          sale_id: 904,
          customer_name:
            body.customer_id === null
              ? "Walk-in customer"
              : "Selected customer",
          pharmacist_name: "Test Pharmacist",
          payment_mode: body.payment_mode,
          total_amount: total,
          created_at: "2026-11-05T10:00:00",
        };

        db.sales.unshift(sale);

        db.details[904] = {
          ...sale,
          items: saleItems,
        };

        return HttpResponse.json(
          {
            success: true,
            message: "Sale created successfully.",
            data: {
              sale_id: 904,
              total_amount: total,
            },
          },
          { status: 201 }
        );
      }
    ),

    // ========================================
    // GET /sales
    // ========================================

    http.get(
      `${API_BASE}/sales`,
      ({ request }) => {
        capture(
          "GET",
          "/sales",
          request
        );

        return HttpResponse.json({
          success: true,
          data: structuredClone(db.sales),
        });
      }
    ),

    // ========================================
    // GET /sales/:id
    // ========================================

    http.get(
      `${API_BASE}/sales/:id`,
      ({ request, params }) => {
        const path = `/sales/${params.id}`;

        capture("GET", path, request);

        const sale = db.details[params.id];

        if (!sale) {
          return HttpResponse.json(
            {
              success: false,
              message: "Sale not found.",
            },
            { status: 404 }
          );
        }

        return HttpResponse.json({
          success: true,
          data: structuredClone(sale),
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
// 4. AUTHENTICATION AND ROUTING
// ============================================

function createToken() {
  return [
    "header",
    btoa(
      JSON.stringify({
        exp:
          Math.floor(Date.now() / 1000) +
          3600,
      })
    ),
    "signature",
  ].join(".");
}

function TestRoutes({
  role = "Pharmacist",
  autoLogin = true,
}) {
  const {
    login,
    isAuthenticated,
  } = useAuth();

  const [ready, setReady] =
    useState(!autoLogin);

  useEffect(() => {
    if (!autoLogin) return;

    login({
      token: createToken(),
      user: {
        user_id: 1,
        name: "Test User",
        email: "test@example.com",
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

      <nav aria-label="Test navigation">
        <Link to="/sales/new">
          New sale link
        </Link>

        <Link to="/sales">
          Sales history link
        </Link>
      </nav>

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
                  allowedRoles={["Pharmacist"]}
                />
              }
            >
              <Route
                path="/sales/new"
                element={<NewSale />}
              />
            </Route>

            <Route
              element={
                <ProtectedRoute
                  allowedRoles={["Admin"]}
                />
              }
            >
              <Route
                path="/sales"
                element={<SalesHistory />}
              />
            </Route>
          </Route>
        </Routes>
      )}
    </>
  );
}

function renderPage({
  path = "/sales/new",
  role = "Pharmacist",
  autoLogin = true,
} = {}) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
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
// 5. REUSABLE UI HELPERS
// ============================================

async function loadNewSale() {
  renderPage();

  return screen.findByRole("button", {
    name:
      "Add Paracetamol 500mg, batch PAR-SOON",
  });
}

async function loadHistory() {
  renderPage({
    path: "/sales",
    role: "Admin",
  });

  return screen.findByRole("row", {
    name: /#901/,
  });
}

function stockTable() {
  return screen.getByRole("table");
}

function stockRows() {
  return within(stockTable())
    .getAllByRole("row")
    .slice(1);
}

function cartForm() {
  return screen
    .getByRole("heading", {
      name: "Current sale",
    })
    .closest("form");
}

function addBatch(
  name = "Paracetamol 500mg",
  batchNumber = "PAR-SOON"
) {
  fireEvent.click(
    screen.getByRole("button", {
      name:
        `Add ${name}, batch ${batchNumber}`,
    })
  );
}

function setQuantity(
  batchId,
  value
) {
  const input =
    cartForm().querySelector(
      `#quantity-${batchId}`
    );

  expect(input).not.toBeNull();

  fireEvent.change(input, {
    target: {
      value: String(value),
    },
  });
}

function completeSale() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "Complete sale",
    })
  );
}

function saleRow(id) {
  return screen.getByRole("row", {
    name: new RegExp(`#${id}\\b`),
  });
}

function historyRows() {
  return within(
    screen.getByRole("table")
  )
    .getAllByRole("row")
    .slice(1);
}

async function prepareCheckout() {
  await loadNewSale();

  addBatch();
}

function submitCustomerForm(name) {
  fireEvent.click(
    screen.getByRole("button", {
      name,
    })
  );
}

// ============================================
// 6. TEST SETUP
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

  ({ default: NewSale } =
    await import(
      "../../pages/sales/NewSale.jsx"
    ));

  ({ default: SalesHistory } =
    await import(
      "../../pages/sales/SalesHistory.jsx"
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
// 7. NEW SALE - INVENTORY LOADING
// ============================================

describe("Sales - Available Inventory Integration", () => {
  test("loads batches using real inventory service and JWT", async () => {
    const api = installSalesApi();

    await loadNewSale();

    expect(
      screen.getByRole("heading", {
        name: "New Sale",
      })
    ).toBeInTheDocument();

    expect(stockRows()).toHaveLength(3);

    expect(
      api.count(
        "GET",
        "/batches/inventory"
      )
    ).toBe(1);

    expect(
      api.find(
        "GET",
        "/batches/inventory"
      ).authorization
    ).toMatch(/^Bearer \S+$/);

    expect(
      api.find(
        "GET",
        "/batches/inventory"
      ).accept
    ).toBe("application/json");
  });

  test("sorts batches by earliest expiry", async () => {
    installSalesApi();

    await loadNewSale();

    const rows = stockRows();

    expect(rows[0]).toHaveTextContent(
      "PAR-SOON"
    );

    expect(rows[1]).toHaveTextContent(
      "PAR-LATE"
    );

    expect(
      rows[0]
    ).toHaveTextContent(
      "Expires in 3 days"
    );
  });

  test("shows loading while inventory request is pending", async () => {
    let release;

    const pending = new Promise(
      (resolve) => {
        release = resolve;
      }
    );

    server.use(
      http.get(
        `${API_BASE}/batches/inventory`,
        async () => {
          await pending;

          return HttpResponse.json({
            success: true,
            data: initialInventory(),
          });
        }
      )
    );

    renderPage();

    expect(
      await screen.findByText(
        "Loading available stock..."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Complete sale",
      })
    ).toBeDisabled();

    await act(async () => {
      release();
    });

    expect(
      await screen.findByRole("button", {
        name:
          "Add Paracetamol 500mg, batch PAR-SOON",
      })
    ).toBeInTheDocument();
  });

  test("shows empty state for no inventory", async () => {
    installSalesApi({
      inventory: [],
    });

    renderPage();

    expect(
      await screen.findByText(
        "No stock is currently available for sale."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Complete sale",
      })
    ).toBeDisabled();
  });

  test("handles expected inventory 404 as empty data", async () => {
    server.use(
      http.get(
        `${API_BASE}/batches/inventory`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "No inventory found.",
            },
            { status: 404 }
          )
      )
    );

    renderPage();

    expect(
      await screen.findByText(
        "No stock is currently available for sale."
      )
    ).toBeInTheDocument();
  });

  test("rejects an invalid inventory list", async () => {
    server.use(
      http.get(
        `${API_BASE}/batches/inventory`,
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
      "The server returned an invalid inventory list."
    );
  });

  test("rejects invalid nested inventory batches", async () => {
    const records = initialInventory();

    records[0].batches = null;

    server.use(
      http.get(
        `${API_BASE}/batches/inventory`,
        () =>
          HttpResponse.json({
            success: true,
            data: records,
          })
      )
    );

    renderPage();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "The server returned invalid inventory batches."
    );
  });

  test("shows HTTP 500 error and disables checkout", async () => {
    server.use(
      http.get(
        `${API_BASE}/batches/inventory`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Inventory unavailable.",
            },
            { status: 500 }
          )
      )
    );

    renderPage();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Inventory unavailable."
    );

    expect(
      screen.getByRole("button", {
        name: "Complete sale",
      })
    ).toBeDisabled();
  });

  test("shows network connection errors", async () => {
    server.use(
      http.get(
        `${API_BASE}/batches/inventory`,
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

  test("retries inventory after server failure", async () => {
    let attempts = 0;

    server.use(
      http.get(
        `${API_BASE}/batches/inventory`,
        () => {
          attempts++;

          if (attempts === 1) {
            return HttpResponse.json(
              {
                success: false,
                message: "Temporary failure.",
              },
              { status: 500 }
            );
          }

          return HttpResponse.json({
            success: true,
            data: initialInventory(),
          });
        }
      )
    );

    renderPage();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Temporary failure."
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reload available stock",
      })
    );

    expect(
      await screen.findByRole("button", {
        name:
          "Add Paracetamol 500mg, batch PAR-SOON",
      })
    ).toBeInTheDocument();

    expect(attempts).toBe(2);
  });

  test("logs out after inventory HTTP 401", async () => {
    server.use(
      http.get(
        `${API_BASE}/batches/inventory`,
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

  test("keeps session after inventory HTTP 403", async () => {
    server.use(
      http.get(
        `${API_BASE}/batches/inventory`,
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
});

// ============================================
// 8. NEW SALE - SEARCH AND CART
// ============================================

describe("Sales - Search and Cart Integration", () => {
  test.each([
    "paracetamol",
    "ABC Pharma",
    "PAR-SOON",
    "tablet",
  ])(
    "searches available batches using %s",
    async (term) => {
      const api = installSalesApi();

      await loadNewSale();

      fireEvent.change(
        screen.getByRole("searchbox", {
          name: "Search available stock",
        }),
        {
          target: {
            value: `  ${term}  `,
          },
        }
      );

      expect(
        screen.getByRole("button", {
          name:
            "Add Paracetamol 500mg, batch PAR-SOON",
        })
      ).toBeInTheDocument();

      expect(
        api.count(
          "GET",
          "/batches/inventory"
        )
      ).toBe(1);
    }
  );

  test("shows no matches for unknown medicine", async () => {
    installSalesApi();

    await loadNewSale();

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search available stock",
      }),
      {
        target: {
          value: "Unknown Medicine",
        },
      }
    );

    expect(
      screen.getByText(
        "No batches match your search."
      )
    ).toBeInTheDocument();
  });

  test("adds a medicine batch with quantity one", async () => {
    installSalesApi();

    await prepareCheckout();

    expect(
      cartForm().querySelector(
        "#quantity-501"
      )
    ).toHaveValue(1);

    expect(
      within(
        cartForm()
      ).getByText(
        "Available: 4"
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Complete sale",
      })
    ).toBeEnabled();
  });

  test("adds the same batch twice without duplicate cart rows", async () => {
    installSalesApi();

    await prepareCheckout();

    addBatch();

    expect(
      cartForm().querySelector(
        "#quantity-501"
      )
    ).toHaveValue(2);

    expect(
      within(
        cartForm()
      ).getAllByLabelText(
        "Quantity"
      )
    ).toHaveLength(1);
  });

  test("disables adding beyond batch stock limit", async () => {
    installSalesApi();

    await loadNewSale();

    addBatch(
      "Paracetamol 500mg",
      "PAR-LATE"
    );

    addBatch(
      "Paracetamol 500mg",
      "PAR-LATE"
    );

    expect(
      cartForm().querySelector(
        "#quantity-502"
      )
    ).toHaveValue(2);

    expect(
      screen.getByRole("button", {
        name:
          "Add Paracetamol 500mg, batch PAR-LATE",
      })
    ).toBeDisabled();
  });

  test("updates quantity and recalculates estimated total", async () => {
    installSalesApi();

    await prepareCheckout();

    setQuantity(501, 3);

    expect(
      cartForm()
    ).toHaveTextContent(
      "46.50"
    );

    expect(
      cartForm().querySelector(
        "#quantity-501"
      )
    ).toHaveValue(3);
  });

  test.each([
    "",
    "0",
    "-1",
    "1.5",
  ])(
    "rejects invalid cart quantity %j",
    async (quantity) => {
      const api = installSalesApi();

      await prepareCheckout();

      setQuantity(
        501,
        quantity
      );

      expect(
        within(
          cartForm()
        ).getByText(
          "Enter a whole number greater than zero."
        )
      ).toBeInTheDocument();

      expect(
        screen.getByRole("button", {
          name: "Complete sale",
        })
      ).toBeDisabled();

      expect(
        api.count(
          "POST",
          "/sales"
        )
      ).toBe(0);
    }
  );

  test("rejects quantity exceeding available stock", async () => {
    const api = installSalesApi();

    await prepareCheckout();

    setQuantity(501, 5);

    expect(
      within(
        cartForm()
      ).getByText(
        "Only 4 units are available."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Complete sale",
      })
    ).toBeDisabled();

    expect(
      api.count("POST", "/sales")
    ).toBe(0);
  });

  test("removes a batch from the cart", async () => {
    installSalesApi();

    await prepareCheckout();

    fireEvent.click(
      screen.getByRole("button", {
        name:
          "Remove Paracetamol 500mg, batch PAR-SOON",
      })
    );

    expect(
      cartForm().querySelector(
        "#quantity-501"
      )
    ).toBeNull();

    expect(
      screen.getByText(
        "Add a medicine batch to start this sale."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Complete sale",
      })
    ).toBeDisabled();
  });

  test("clears all selected batches", async () => {
    installSalesApi();

    await prepareCheckout();

    addBatch(
      "Ibuprofen 200mg",
      "IBU-001"
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Clear cart",
      })
    );

    expect(
      within(
        cartForm()
      ).queryAllByLabelText(
        "Quantity"
      )
    ).toHaveLength(0);

    expect(
      screen.getByRole("button", {
        name: "Complete sale",
      })
    ).toBeDisabled();
  });

  test("detects when stock decreases after a reload", async () => {
    const api = installSalesApi();

    await prepareCheckout();

    setQuantity(501, 3);

    api.db.inventory[0]
      .batches[1]
      .stock_quantity = 2;

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reload available stock",
      })
    );

    expect(
      await within(
        cartForm()
      ).findByText(
        "Only 2 units are available."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Complete sale",
      })
    ).toBeDisabled();
  });

  test("detects a batch removed from refreshed inventory", async () => {
    const api = installSalesApi();

    await prepareCheckout();

    api.db.inventory[0].batches =
      api.db.inventory[0]
        .batches.filter(
          (batch) =>
            Number(batch.batch_id) !== 501
        );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reload available stock",
      })
    );

    expect(
      await within(
        cartForm()
      ).findByText(
        "This batch is no longer available. Remove it."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Complete sale",
      })
    ).toBeDisabled();
  });

  test("requires customer selection in existing-customer mode", async () => {
    const api = installSalesApi();

    await prepareCheckout();

    fireEvent.click(
      screen.getByRole("radio", {
        name: "Existing Customer",
      })
    );

    expect(
      screen.getByRole("button", {
        name: "Complete sale",
      })
    ).toBeDisabled();

    expect(
      screen.getByText(
        "Select a customer above or choose Walk-in to continue."
      )
    ).toBeInTheDocument();

    expect(
      api.count("POST", "/sales")
    ).toBe(0);
  });

  test("rejects invalid customer email without HTTP request", async () => {
    const api = installSalesApi();

    await prepareCheckout();

    fireEvent.click(
      screen.getByRole("radio", {
        name: "Existing Customer",
      })
    );

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Customer email",
      }),
      {
        target: {
          value: "not-an-email",
        },
      }
    );

    submitCustomerForm(
      "Search customer"
    );

    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Enter a valid email address."
    );

    expect(
      api.count("POST", "/sales")
    ).toBe(0);
  });

  test("validates name when creating a customer", async () => {
    const api = installSalesApi();

    await prepareCheckout();

    fireEvent.click(
      screen.getByRole("radio", {
        name: "Create Customer",
      })
    );

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Customer email",
      }),
      {
        target: {
          value: "new@example.com",
        },
      }
    );

    submitCustomerForm(
      "Create and select"
    );

    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Enter a customer name of 100 characters or fewer."
    );

    expect(
      api.count("POST", "/sales")
    ).toBe(0);
  });
});

// ============================================
// 9. SALES - SUCCESSFUL CHECKOUT
// ============================================

describe("Sales - Successful Checkout Integration", () => {
  test("creates a walk-in sale with correct POST payload", async () => {
    const api = installSalesApi();

    await prepareCheckout();

    setQuantity(501, 2);

    completeSale();

    expect(
      await screen.findByRole("heading", {
        name:
          "Sale completed successfully",
      })
    ).toBeInTheDocument();

    const request = api.find(
      "POST",
      "/sales"
    );

    expect(request.body).toEqual({
      customer_id: null,
      payment_mode: "Cash",
      items: [
        {
          batch_id: 501,
          quantity: 2,
        },
      ],
    });

    expect(
      request.authorization
    ).toMatch(/^Bearer \S+$/);

    expect(
      request.contentType
    ).toContain("application/json");

    expect(
      request.accept
    ).toBe("application/json");
  });

  test.each([
    "Cash",
    "Card",
    "UPI",
  ])(
    "submits sale with %s payment mode",
    async (mode) => {
      const api = installSalesApi();

      await prepareCheckout();

      fireEvent.change(
        within(
          cartForm()
        ).getByRole("combobox", {
          name: "Payment mode",
        }),
        {
          target: {
            value: mode,
          },
        }
      );

      completeSale();

      expect(
        await screen.findByRole("heading", {
          name:
            "Sale completed successfully",
        })
      ).toBeInTheDocument();

      expect(
        api.find(
          "POST",
          "/sales"
        ).body.payment_mode
      ).toBe(mode);
    }
  );

  test("submits multiple batches with their quantities", async () => {
    const api = installSalesApi();

    await prepareCheckout();

    addBatch(
      "Ibuprofen 200mg",
      "IBU-001"
    );

    setQuantity(501, 2);
    setQuantity(601, 3);

    completeSale();

    expect(
      await screen.findByRole("heading", {
        name:
          "Sale completed successfully",
      })
    ).toBeInTheDocument();

    expect(
      api.find(
        "POST",
        "/sales"
      ).body.items
    ).toEqual([
      {
        batch_id: 501,
        quantity: 2,
      },
      {
        batch_id: 601,
        quantity: 3,
      },
    ]);

    expect(
      api.db.inventory[0]
        .batches[1]
        .stock_quantity
    ).toBe(2);

    expect(
      api.db.inventory[1]
        .batches[0]
        .stock_quantity
    ).toBe(2);
  });

  test("shows confirmed sale ID and backend total", async () => {
    installSalesApi();

    await prepareCheckout();

    completeSale();

    const heading =
      await screen.findByRole(
        "heading",
        {
          name:
            "Sale completed successfully",
        }
      );

    const confirmation =
      heading.closest("section");

    expect(
      confirmation
    ).toHaveTextContent(
      "Sale #904"
    );

    expect(
      confirmation
    ).toHaveTextContent(
      "15.50"
    );

    expect(
      confirmation
    ).toHaveTextContent(
      "Walk-in customer"
    );
  });

  test("locks checkout after a successful sale", async () => {
    const api = installSalesApi();

    await prepareCheckout();

    completeSale();

    await screen.findByRole("heading", {
      name:
        "Sale completed successfully",
    });

    expect(
      screen.getByRole("button", {
        name: "Sale completed",
      })
    ).toBeDisabled();

    expect(
      screen.getByRole("button", {
        name:
          "Add Paracetamol 500mg, batch PAR-SOON",
      })
    ).toBeDisabled();

    expect(
      api.count("POST", "/sales")
    ).toBe(1);
  });

  test("starts a fresh cart after successful checkout", async () => {
    const api = installSalesApi();

    await prepareCheckout();

    completeSale();

    await screen.findByRole("heading", {
      name:
        "Sale completed successfully",
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Start new sale",
      })
    );

    await waitFor(() => {
      expect(
        api.count(
          "GET",
          "/batches/inventory"
        )
      ).toBe(2);
    });

    expect(
      screen.getByText(
        "Add a medicine batch to start this sale."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Complete sale",
      })
    ).toBeDisabled();

    expect(
      screen.queryByRole("heading", {
        name:
          "Sale completed successfully",
      })
    ).not.toBeInTheDocument();
  });

  test("prevents duplicate POST while checkout is pending", async () => {
    installSalesApi();

    let release;
    let postCount = 0;

    const pending = new Promise(
      (resolve) => {
        release = resolve;
      }
    );

    server.use(
      http.post(
        `${API_BASE}/sales`,
        async () => {
          postCount++;

          await pending;

          return HttpResponse.json(
            {
              success: true,
              data: {
                sale_id: 904,
                total_amount: 15.5,
              },
            },
            { status: 201 }
          );
        }
      )
    );

    await prepareCheckout();

    completeSale();

    await waitFor(() => {
      expect(postCount).toBe(1);
    });

    expect(
      screen.getByRole("button", {
        name: "Completing sale...",
      })
    ).toBeDisabled();

    expect(
      cartForm()
    ).toHaveAttribute(
      "aria-busy",
      "true"
    );

    fireEvent.submit(
      cartForm()
    );

    expect(postCount).toBe(1);

    await act(async () => {
      release();
    });

    expect(
      await screen.findByRole("heading", {
        name:
          "Sale completed successfully",
      })
    ).toBeInTheDocument();

    expect(postCount).toBe(1);
  });
});

// ============================================
// 10. SALES - CHECKOUT FAILURES
// ============================================

describe("Sales - Checkout Error Integration", () => {
  test.each([
    [400, "Invalid sale details."],
    [409, "Insufficient stock."],
    [422, "Invalid quantity."],
  ])(
    "shows HTTP %s error and refreshes available stock",
    async (status, message) => {
      const api = installSalesApi();

      server.use(
        http.post(
          `${API_BASE}/sales`,
          () =>
            HttpResponse.json(
              {
                success: false,
                message,
              },
              { status }
            )
        )
      );

      await prepareCheckout();

      completeSale();

      expect(
        await screen.findByRole("alert")
      ).toHaveTextContent(message);

      await waitFor(() => {
        expect(
          api.count(
            "GET",
            "/batches/inventory"
          )
        ).toBe(2);
      });

      expect(
        screen.queryByRole("heading", {
          name:
            "Sale completed successfully",
        })
      ).not.toBeInTheDocument();
    }
  );

  test("keeps session after checkout HTTP 403", async () => {
    const api = installSalesApi();

    server.use(
      http.post(
        `${API_BASE}/sales`,
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

    await prepareCheckout();

    completeSale();

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

    expect(
      api.count(
        "GET",
        "/batches/inventory"
      )
    ).toBe(1);
  });

  test("logs out on checkout HTTP 401", async () => {
    installSalesApi();

    server.use(
      http.post(
        `${API_BASE}/sales`,
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

    await prepareCheckout();

    completeSale();

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

  test.each([
    408,
    500,
    503,
  ])(
    "locks checkout when response status is HTTP %s",
    async (status) => {
      const api = installSalesApi();

      server.use(
        http.post(
          `${API_BASE}/sales`,
          () =>
            HttpResponse.json(
              {
                success: false,
                message:
                  "Sale could not be confirmed.",
              },
              { status }
            )
        )
      );

      await prepareCheckout();

      completeSale();

      expect(
        await screen.findByRole("alert")
      ).toHaveTextContent(
        "We could not confirm whether this sale was saved."
      );

      expect(
        screen.getByRole("button", {
          name: "Start a new cart",
        })
      ).toBeDisabled();

      expect(
        screen.getByRole("button", {
          name: "Complete sale",
        })
      ).toBeDisabled();

      expect(
        api.count("POST", "/sales")
      ).toBe(0);
    }
  );

  test("treats network failure as an uncertain sale outcome", async () => {
    installSalesApi();

    server.use(
      http.post(
        `${API_BASE}/sales`,
        () => HttpResponse.error()
      )
    );

    await prepareCheckout();

    completeSale();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "We could not confirm whether this sale was saved."
    );

    expect(
      screen.getByRole("button", {
        name: "Start a new cart",
      })
    ).toBeDisabled();
  });

  test("treats incomplete confirmation data as uncertain", async () => {
    installSalesApi();

    server.use(
      http.post(
        `${API_BASE}/sales`,
        () =>
          HttpResponse.json({
            success: true,
            data: {
              sale_id: 904,
            },
          })
      )
    );

    await prepareCheckout();

    completeSale();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "We could not confirm whether this sale was saved."
    );

    expect(
      screen.queryByRole("heading", {
        name:
          "Sale completed successfully",
      })
    ).not.toBeInTheDocument();
  });

  test("requires admin confirmation before starting a new cart", async () => {
    const api = installSalesApi();

    server.use(
      http.post(
        `${API_BASE}/sales`,
        () => HttpResponse.error()
      )
    );

    await prepareCheckout();

    completeSale();

    await screen.findByRole("alert");

    const resetButton =
      screen.getByRole("button", {
        name: "Start a new cart",
      });

    expect(
      resetButton
    ).toBeDisabled();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name:
          /I have checked with an admin/i,
      })
    );

    expect(
      resetButton
    ).toBeEnabled();

    fireEvent.click(
      resetButton
    );

    await waitFor(() => {
      expect(
        api.count(
          "GET",
          "/batches/inventory"
        )
      ).toBe(2);
    });

    expect(
      screen.getByText(
        "Add a medicine batch to start this sale."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Complete sale",
      })
    ).toBeDisabled();
  });
});

// ============================================
// 11. SALES HISTORY - GET
// ============================================

describe("Sales History - GET Integration", () => {
  test("loads recorded sales through real service and JWT", async () => {
    const api = installSalesApi();

    await loadHistory();

    expect(
      saleRow(901)
    ).toHaveTextContent("Alice");

    expect(
      saleRow(902)
    ).toHaveTextContent(
      "Walk-in customer"
    );

    expect(
      saleRow(903)
    ).toHaveTextContent("Bob");

    expect(
      api.count(
        "GET",
        "/sales"
      )
    ).toBe(1);

    expect(
      api.find(
        "GET",
        "/sales"
      ).authorization
    ).toMatch(/^Bearer \S+$/);
  });

  test("shows loading until sales response completes", async () => {
    let release;

    const pending = new Promise(
      (resolve) => {
        release = resolve;
      }
    );

    server.use(
      http.get(
        `${API_BASE}/sales`,
        async () => {
          await pending;

          return HttpResponse.json({
            success: true,
            data: initialSales(),
          });
        }
      )
    );

    renderPage({
      path: "/sales",
      role: "Admin",
    });

    expect(
      (
        await screen.findAllByText(
          "Loading sales..."
        )
      ).length
    ).toBeGreaterThan(0);

    await act(async () => {
      release();
    });

    expect(
      await screen.findByRole("row", {
        name: /#901/,
      })
    ).toBeInTheDocument();
  });

  test("shows empty state when no sales exist", async () => {
    installSalesApi({
      sales: [],
    });

    renderPage({
      path: "/sales",
      role: "Admin",
    });

    expect(
      await screen.findByRole("heading", {
        name: "No sales found",
      })
    ).toBeInTheDocument();
  });

  test("converts expected HTTP 404 into empty sales", async () => {
    server.use(
      http.get(
        `${API_BASE}/sales`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "No sales found.",
            },
            { status: 404 }
          )
      )
    );

    renderPage({
      path: "/sales",
      role: "Admin",
    });

    expect(
      await screen.findByRole("heading", {
        name: "No sales found",
      })
    ).toBeInTheDocument();
  });

  test("rejects an invalid sales list", async () => {
    server.use(
      http.get(
        `${API_BASE}/sales`,
        () =>
          HttpResponse.json({
            success: true,
            data: {},
          })
      )
    );

    renderPage({
      path: "/sales",
      role: "Admin",
    });

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to read sales history."
    );
  });

  test("shows HTTP 500 sales history error", async () => {
    server.use(
      http.get(
        `${API_BASE}/sales`,
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

    renderPage({
      path: "/sales",
      role: "Admin",
    });

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Database unavailable."
    );
  });

  test("shows network failure in sales history", async () => {
    server.use(
      http.get(
        `${API_BASE}/sales`,
        () => HttpResponse.error()
      )
    );

    renderPage({
      path: "/sales",
      role: "Admin",
    });

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to connect to the server."
    );
  });

  test("keeps session active after HTTP 403", async () => {
    server.use(
      http.get(
        `${API_BASE}/sales`,
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

    renderPage({
      path: "/sales",
      role: "Admin",
    });

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

  test("logs out after sales history HTTP 401", async () => {
    server.use(
      http.get(
        `${API_BASE}/sales`,
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

    renderPage({
      path: "/sales",
      role: "Admin",
    });

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

  test("retries sales history after a temporary error", async () => {
    let attempts = 0;

    server.use(
      http.get(
        `${API_BASE}/sales`,
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
            data: initialSales(),
          });
        }
      )
    );

    renderPage({
      path: "/sales",
      role: "Admin",
    });

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Temporary error."
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reload sales",
      })
    );

    expect(
      await screen.findByRole("row", {
        name: /#901/,
      })
    ).toBeInTheDocument();

    expect(attempts).toBe(2);
  });

  test("reloads newly recorded sales", async () => {
    const api = installSalesApi();

    await loadHistory();

    api.db.sales.push({
      sale_id: 905,
      customer_name: "New Customer",
      pharmacist_name: "Ravi",
      payment_mode: "Cash",
      total_amount: 40,
      created_at: "2026-11-05T11:00:00",
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reload sales",
      })
    );

    expect(
      await screen.findByRole("row", {
        name: /#905/,
      })
    ).toBeInTheDocument();

    expect(
      api.count(
        "GET",
        "/sales"
      )
    ).toBe(2);
  });
});

// ============================================
// 12. SALES HISTORY - FILTERS
// ============================================

describe("Sales History - Filters and Sorting", () => {
  test("searches sales by customer name", async () => {
    const api = installSalesApi();

    await loadHistory();

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search sales",
      }),
      {
        target: {
          value: "  alice  ",
        },
      }
    );

    expect(
      saleRow(901)
    ).toBeInTheDocument();

    expect(
      historyRows()
    ).toHaveLength(1);

    expect(
      api.count(
        "GET",
        "/sales"
      )
    ).toBe(1);
  });

  test("searches by sale ID", async () => {
    installSalesApi();

    await loadHistory();

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search sales",
      }),
      {
        target: {
          value: "902",
        },
      }
    );

    expect(
      saleRow(902)
    ).toBeInTheDocument();

    expect(
      historyRows()
    ).toHaveLength(1);
  });

  test("searches by pharmacist name", async () => {
    installSalesApi();

    await loadHistory();

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search sales",
      }),
      {
        target: {
          value: "Ravi",
        },
      }
    );

    expect(
      saleRow(901)
    ).toBeInTheDocument();

    expect(
      saleRow(903)
    ).toBeInTheDocument();

    expect(
      historyRows()
    ).toHaveLength(2);
  });

  test.each([
    ["Cash", 901],
    ["UPI", 902],
    ["Card", 903],
  ])(
    "filters %s payments correctly",
    async (mode, id) => {
      const api = installSalesApi();

      await loadHistory();

      fireEvent.change(
        screen.getByRole("combobox", {
          name: "Payment mode",
        }),
        {
          target: {
            value: mode,
          },
        }
      );

      expect(
        saleRow(id)
      ).toBeInTheDocument();

      expect(
        historyRows()
      ).toHaveLength(1);

      expect(
        api.count(
          "GET",
          "/sales"
        )
      ).toBe(1);
    }
  );

  test("shows no matching sales", async () => {
    installSalesApi();

    await loadHistory();

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search sales",
      }),
      {
        target: {
          value: "Unknown Customer",
        },
      }
    );

    expect(
      screen.getByRole("heading", {
        name: "No matching sales",
      })
    ).toBeInTheDocument();

    expect(
      screen.getAllByRole("button", {
        name: "Clear filters",
      })
    ).toHaveLength(2);
  });

  test("clears search and payment filters locally", async () => {
    const api = installSalesApi();

    await loadHistory();

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search sales",
      }),
      {
        target: {
          value: "Alice",
        },
      }
    );

    fireEvent.change(
      screen.getByRole("combobox", {
        name: "Payment mode",
      }),
      {
        target: {
          value: "Cash",
        },
      }
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Clear filters",
      })
    );

    expect(
      historyRows()
    ).toHaveLength(3);

    expect(
      api.count(
        "GET",
        "/sales"
      )
    ).toBe(1);
  });

  test("sorts sales by total amount", async () => {
    const api = installSalesApi();

    await loadHistory();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Total: sort ascending",
      })
    );

    expect(
      historyRows()[0]
    ).toHaveTextContent(
      "#903"
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Total: sort descending",
      })
    );

    expect(
      historyRows()[0]
    ).toHaveTextContent(
      "#901"
    );

    expect(
      api.count(
        "GET",
        "/sales"
      )
    ).toBe(1);
  });

  test("shows newest sales first by default", async () => {
    installSalesApi();

    await loadHistory();

    expect(
      historyRows()[0]
    ).toHaveTextContent("#902");

    expect(
      historyRows()[1]
    ).toHaveTextContent("#903");

    expect(
      historyRows()[2]
    ).toHaveTextContent("#901");
  });
});

// ============================================
// 13. SALES HISTORY - DETAILS MODAL
// ============================================

describe("Sales History - Sale Details Integration", () => {
  test("loads sale details through GET /sales/:id", async () => {
    const api = installSalesApi();

    await loadHistory();

    fireEvent.click(
      screen.getByRole("button", {
        name: "View details for sale 901",
      })
    );

    const dialog =
      await screen.findByRole("dialog", {
        name: "Sale details",
      });

    expect(
      await within(dialog).findByRole(
        "heading",
        {
          name: "Sale #901",
        }
      )
    ).toBeInTheDocument();

    expect(
      within(dialog).getByText(
        "Paracetamol 500mg"
      )
    ).toBeInTheDocument();

    expect(
      within(dialog).getByText(
        "PAR-SOON"
      )
    ).toBeInTheDocument();

    expect(
      api.count(
        "GET",
        "/sales/901"
      )
    ).toBe(1);

    expect(
      api.find(
        "GET",
        "/sales/901"
      ).authorization
    ).toMatch(/^Bearer \S+$/);
  });

  test("shows recorded quantities and prices", async () => {
    installSalesApi();

    await loadHistory();

    fireEvent.click(
      screen.getByRole("button", {
        name: "View details for sale 901",
      })
    );

    const dialog =
      await screen.findByRole("dialog", {
        name: "Sale details",
      });

    const row =
      await within(dialog).findByRole(
        "row",
        {
          name: /PAR-SOON/i,
        }
      );

    expect(
      row
    ).toHaveTextContent("2");

    expect(
      row
    ).toHaveTextContent("15.50");

    expect(
      row
    ).toHaveTextContent("31.00");
  });

  test("shows HTTP 404 when sale details are missing", async () => {
    installSalesApi();

    server.use(
      http.get(
        `${API_BASE}/sales/:id`,
        () =>
          HttpResponse.json(
            {
              success: false,
              message: "Sale not found.",
            },
            { status: 404 }
          )
      )
    );

    await loadHistory();

    fireEvent.click(
      screen.getByRole("button", {
        name: "View details for sale 901",
      })
    );

    expect(
      await within(
        screen.getByRole("dialog")
      ).findByRole("alert")
    ).toHaveTextContent(
      "Sale not found."
    );
  });

  test("rejects sale details without an items array", async () => {
    installSalesApi();

    server.use(
      http.get(
        `${API_BASE}/sales/:id`,
        () =>
          HttpResponse.json({
            success: true,
            data: {
              sale_id: 901,
              total_amount: 31,
            },
          })
      )
    );

    await loadHistory();

    fireEvent.click(
      screen.getByRole("button", {
        name: "View details for sale 901",
      })
    );

    expect(
      await within(
        screen.getByRole("dialog")
      ).findByRole("alert")
    ).toHaveTextContent(
      "Medicine details were not returned."
    );
  });

  test("retries loading sale details after HTTP 500", async () => {
    const api = installSalesApi();

    let attempts = 0;

    server.use(
      http.get(
        `${API_BASE}/sales/:id`,
        ({ params }) => {
          attempts++;

          if (attempts === 1) {
            return HttpResponse.json(
              {
                success: false,
                message:
                  "Sale details unavailable.",
              },
              { status: 500 }
            );
          }

          return HttpResponse.json({
            success: true,
            data:
              api.db.details[params.id],
          });
        }
      )
    );

    await loadHistory();

    fireEvent.click(
      screen.getByRole("button", {
        name: "View details for sale 901",
      })
    );

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Sale details unavailable."
    );

    fireEvent.click(
      within(
        screen.getByRole("dialog")
      ).getByRole("button", {
        name: "Retry",
      })
    );

    expect(
      await screen.findByRole("heading", {
        name: "Sale #901",
      })
    ).toBeInTheDocument();

    expect(attempts).toBe(2);
  });

  test("shows an empty-items message for sale with no items", async () => {
    const api = installSalesApi();

    api.db.details[901].items = [];

    await loadHistory();

    fireEvent.click(
      screen.getByRole("button", {
        name: "View details for sale 901",
      })
    );

    expect(
      await screen.findByText(
        "No medicine details are available for this sale."
      )
    ).toBeInTheDocument();
  });

  test("closes the sale details modal", async () => {
    installSalesApi();

    await loadHistory();

    fireEvent.click(
      screen.getByRole("button", {
        name: "View details for sale 901",
      })
    );

    const dialog =
      await screen.findByRole("dialog", {
        name: "Sale details",
      });

    await within(dialog).findByRole(
      "heading",
      {
        name: "Sale #901",
      }
    );

    fireEvent.click(
      within(dialog).getByRole(
        "button",
        {
          name: "Close",
          exact: true,
        }
      )
    );

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();
  });
});

// ============================================
// 14. SALES - ROLE PERMISSIONS
// ============================================

describe("Sales - Route Permissions", () => {
  test("allows Pharmacist to access New Sale", async () => {
    const api = installSalesApi();

    renderPage({
      role: "Pharmacist",
    });

    expect(
      await screen.findByRole("heading", {
        name: "New Sale",
      })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        api.count(
          "GET",
          "/batches/inventory"
        )
      ).toBe(1);
    });
  });

  test("allows Admin to access Sales History", async () => {
    const api = installSalesApi();

    renderPage({
      path: "/sales",
      role: "Admin",
    });

    expect(
      await screen.findByRole("heading", {
        name: "Sales History",
      })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        api.count(
          "GET",
          "/sales"
        )
      ).toBe(1);
    });
  });

  test.each([
    ["Admin", "/sales/new"],
    ["Customer", "/sales/new"],
    ["Pharmacist", "/sales"],
    ["Customer", "/sales"],
  ])(
    "denies %s access to %s",
    async (role, path) => {
      const api = installSalesApi();

      renderPage({
        role,
        path,
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

  test.each([
    "/sales/new",
    "/sales",
  ])(
    "redirects unauthenticated access to %s",
    async (path) => {
      const api = installSalesApi();

      renderPage({
        path,
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
    }
  );
});
