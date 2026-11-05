
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

const API_BASE = "http://127.0.0.1:4179/api";

let AuthProvider;
let useAuth;
let ProtectedRoute;
let StockOverview;

// ============================================
// 1. TEST DATA
// ============================================

function futureDate(days) {
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
      medicine_id: 101,
      medicine_name: "Paracetamol 500mg",
      manufacturer_id: 1,
      manufacturer_name: "ABC Pharma",
      category: "Tablet",
      reorder_level: "10",
      available_stock: "30",
      batches: [
        {
          batch_id: 502,
          batch_number: "PAR-LATE",
          selling_price: "18.50",
          stock_quantity: "20",
          expiry_date: futureDate(40),
          days_to_expire: "40",
        },
        {
          batch_id: 501,
          batch_number: "PAR-SOON",
          selling_price: "16.75",
          stock_quantity: "10",
          expiry_date: futureDate(5),
          days_to_expire: "5",
        },
      ],
    },
    {
      medicine_id: 102,
      medicine_name: "Cetirizine 10mg",
      manufacturer_id: 2,
      manufacturer_name: "Health Labs",
      category: "Tablet",
      reorder_level: "5",
      available_stock: "12",
      batches: [
        {
          batch_id: 601,
          batch_number: "CET-TODAY",
          selling_price: "9.00",
          stock_quantity: "12",
          expiry_date: futureDate(0),
          days_to_expire: "0",
        },
      ],
    },
    {
      medicine_id: 103,
      medicine_name: "Ibuprofen 200mg",
      manufacturer_id: 1,
      manufacturer_name: "ABC Pharma",
      category: "Capsule",
      reorder_level: "20",
      available_stock: "50",
      batches: [
        {
          batch_id: 701,
          batch_number: "IBU-001",
          selling_price: "22.50",
          stock_quantity: "50",
          expiry_date: futureDate(60),
          days_to_expire: "60",
        },
      ],
    },
    {
      medicine_id: 104,
      medicine_name: "Vitamin C",
      manufacturer_id: 3,
      manufacturer_name: "Wellness Pharma",
      category: "Supplement",
      reorder_level: "10",
      available_stock: "100",
      batches: [
        {
          batch_id: 801,
          batch_number: "VIT-001",
          selling_price: "25.00",
          stock_quantity: "100",
          expiry_date: futureDate(120),
          days_to_expire: "120",
        },
      ],
    },
  ];
}

function initialLowStock() {
  return [
    {
      medicine_id: 201,
      medicine_name: "Insulin",
      manufacturer_id: 4,
      manufacturer_name: "Bio Labs",
      category: "Diabetes",
      available_stock: "0",
      reorder_level: "20",
    },
    {
      medicine_id: 202,
      medicine_name: "Amoxicillin",
      manufacturer_id: 2,
      manufacturer_name: "Health Labs",
      category: "Antibiotic",
      available_stock: "4",
      reorder_level: "10",
    },
    {
      medicine_id: 203,
      medicine_name: "Glucose",
      manufacturer_id: 4,
      manufacturer_name: "Bio Labs",
      category: "Diabetes",
      available_stock: "10",
      reorder_level: "10",
    },
    {
      medicine_id: 204,
      medicine_name: "Zinc",
      manufacturer_id: 3,
      manufacturer_name: "Wellness Pharma",
      category: "Supplement",
      available_stock: "2",
      reorder_level: "8",
    },
  ];
}

// ============================================
// 2. STATEFUL MSW BACKEND
// ============================================

function installApi({
  inventory = initialInventory(),
  lowStock = initialLowStock(),
} = {}) {
  const db = {
    inventory: JSON.parse(
      JSON.stringify(inventory)
    ),
    lowStock: JSON.parse(
      JSON.stringify(lowStock)
    ),
  };

  const calls = [];

  server.use(
    http.get(
      `${API_BASE}/batches/inventory`,
      ({ request }) => {
        calls.push({
          path: "/batches/inventory",
          method: request.method,
          authorization:
            request.headers.get("authorization"),
          accept: request.headers.get("accept"),
        });

        return HttpResponse.json({
          success: true,
          data: db.inventory,
        });
      }
    ),

    http.get(
      `${API_BASE}/batches/low-stock`,
      ({ request }) => {
        calls.push({
          path: "/batches/low-stock",
          method: request.method,
          authorization:
            request.headers.get("authorization"),
          accept: request.headers.get("accept"),
        });

        return HttpResponse.json({
          success: true,
          data: db.lowStock,
        });
      }
    )
  );

  return {
    db,
    calls,

    count(path) {
      return calls.filter(
        (call) => call.path === path
      ).length;
    },

    first(path) {
      return calls.find(
        (call) => call.path === path
      );
    },
  };
}

function mockFailure(
  path,
  {
    status = 500,
    message = "Database unavailable.",
  } = {}
) {
  server.use(
    http.get(
      `${API_BASE}${path}`,
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
}

// ============================================
// 3. REAL AUTH AND PROTECTED ROUTES
// ============================================

function testToken() {
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
  role,
  autoLogin,
}) {
  const {
    login,
    isAuthenticated,
  } = useAuth();

  const [ready, setReady] = useState(
    !autoLogin
  );

  useEffect(() => {
    if (autoLogin) {
      login({
        token: testToken(),
        user: {
          user_id: 1,
          name: "Test User",
          email: "test@example.com",
          role,
        },
      });

      setReady(true);
    }
  }, [login, role, autoLogin]);

  return (
    <>
      <output data-testid="auth-state">
        {isAuthenticated
          ? "authenticated"
          : "guest"}
      </output>

      <nav aria-label="Test navigation">
        <Link to="/inventory">
          Inventory link
        </Link>

        <Link to="/low-stock">
          Low-stock link
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
            element={
              <ProtectedRoute
                allowedRoles={[
                  "Admin",
                  "Pharmacist",
                ]}
              />
            }
          >
            <Route
              path="/inventory"
              element={
                <StockOverview
                  key="inventory"
                  mode="inventory"
                />
              }
            />

            <Route
              path="/low-stock"
              element={
                <StockOverview
                  key="low-stock"
                  mode="low-stock"
                />
              }
            />
          </Route>
        </Routes>
      )}
    </>
  );
}

function renderPage({
  mode = "inventory",
  role = "Admin",
  autoLogin = true,
} = {}) {
  return render(
    <MemoryRouter
      initialEntries={[`/${mode}`]}
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
// 4. REUSABLE TEST HELPERS
// ============================================

async function loadedInventory(
  options = {}
) {
  renderPage({
    mode: "inventory",
    ...options,
  });

  return screen.findByRole("row", {
    name: /Paracetamol 500mg/i,
  });
}

async function loadedLowStock(
  options = {}
) {
  renderPage({
    mode: "low-stock",
    ...options,
  });

  return screen.findByRole("row", {
    name: /Insulin/i,
  });
}

function medicineRow(name) {
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

function search(value) {
  fireEvent.change(
    screen.getByRole("searchbox", {
      name: "Search",
    }),
    {
      target: { value },
    }
  );
}

function selectFilter(name, value) {
  fireEvent.change(
    screen.getByRole("combobox", {
      name,
    }),
    {
      target: { value },
    }
  );
}

function reload(mode) {
  fireEvent.click(
    screen.getByRole("button", {
      name: `Reload ${mode}`,
    })
  );
}

function summary() {
  return screen.getByRole("group", {
    name:
      "Summary for all medicines before filtering",
  });
}

// ============================================
// 5. SETUP AND CLEANUP
// ============================================

beforeAll(async () => {
  vi.stubEnv(
    "VITE_API_BASE_URL",
    API_BASE
  );

  ({
    default: AuthProvider,
  } = await import(
    "../../context/AuthProvider.jsx"
  ));

  ({
    default: useAuth,
  } = await import(
    "../../hooks/useAuth.js"
  ));

  ({
    default: ProtectedRoute,
  } = await import(
    "../../routes/ProtectedRoute.jsx"
  ));

  ({
    default: StockOverview,
  } = await import(
    "../../pages/inventory/StockOverview.jsx"
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
// 6. INVENTORY GET TESTS
// ============================================

describe(
  "Stock Overview - Available Inventory GET",
  () => {
    test(
      "loads inventory through real service and sends JWT",
      async () => {
        const api = installApi();

        await loadedInventory();

        expect(
          medicineRow("Cetirizine 10mg")
        ).toBeInTheDocument();

        expect(
          medicineRow("Ibuprofen 200mg")
        ).toBeInTheDocument();

        expect(
          medicineRow("Vitamin C")
        ).toBeInTheDocument();

        expect(
          within(
            medicineRow("Paracetamol 500mg")
          ).getByText("Expires in 5 days")
        ).toBeInTheDocument();

        expect(
          within(
            medicineRow("Cetirizine 10mg")
          ).getByText("Expires today")
        ).toBeInTheDocument();

        expect(
          api.count("/batches/inventory")
        ).toBe(1);

        expect(
          api.count("/batches/low-stock")
        ).toBe(0);

        expect(
          api.first("/batches/inventory")
        ).toMatchObject({
          method: "GET",
          accept: "application/json",
        });

        expect(
          api.first(
            "/batches/inventory"
          ).authorization
        ).toMatch(/^Bearer \S+$/);
      }
    );

    test(
      "shows loading state during pending API request",
      async () => {
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

        await waitFor(() => {
          expect(
            screen.getAllByText(
              "Loading stock information..."
            ).length
          ).toBeGreaterThan(0);

          expect(
            screen.getByRole("button", {
              name: "Reload available inventory",
            })
          ).toBeDisabled();
        });

        await act(async () => {
          release();
        });

        expect(
          await screen.findByRole("row", {
            name: /Paracetamol 500mg/i,
          })
        ).toBeInTheDocument();
      }
    );

    test(
      "shows summary totals before filtering",
      async () => {
        installApi();
        await loadedInventory();

        expect(
          within(summary()).getByText("4")
        ).toBeInTheDocument();

        expect(
          within(summary()).getByText("2")
        ).toBeInTheDocument();

        expect(summary()).toHaveTextContent(
          "medicines in stock"
        );

        expect(summary()).toHaveTextContent(
          "with expiry ≤10 days"
        );
      }
    );

    test(
      "shows empty inventory for HTTP 200 with no records",
      async () => {
        installApi({
          inventory: [],
        });

        renderPage();

        expect(
          await screen.findByRole(
            "heading",
            {
              name: "No available inventory",
            }
          )
        ).toBeInTheDocument();

        expect(
          screen.getByText(
            "Available medicine batches will appear here when stock is added."
          )
        ).toBeInTheDocument();
      }
    );

    test(
      "converts expected HTTP 404 into empty inventory",
      async () => {
        mockFailure(
          "/batches/inventory",
          {
            status: 404,
            message:
              "No inventory found.",
          }
        );

        renderPage();

        expect(
          await screen.findByRole(
            "heading",
            {
              name: "No available inventory",
            }
          )
        ).toBeInTheDocument();
      }
    );

    test(
      "rejects a non-array inventory response",
      async () => {
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
          await screen.findByRole(
            "alert"
          )
        ).toHaveTextContent(
          "The server returned an invalid inventory list."
        );
      }
    );

    test(
      "rejects invalid batches inside inventory data",
      async () => {
        const records =
          initialInventory();

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
          await screen.findByRole(
            "alert"
          )
        ).toHaveTextContent(
          "The server returned invalid inventory batches."
        );
      }
    );

    test(
      "rejects invalid JSON returned by backend",
      async () => {
        server.use(
          http.get(
            `${API_BASE}/batches/inventory`,
            () =>
              HttpResponse.text(
                "invalid json",
                { status: 200 }
              )
          )
        );

        renderPage();

        expect(
          await screen.findByRole(
            "alert"
          )
        ).toHaveTextContent(
          "The server returned an invalid response."
        );
      }
    );

    test(
      "handles application failure with HTTP 200",
      async () => {
        server.use(
          http.get(
            `${API_BASE}/batches/inventory`,
            () =>
              HttpResponse.json({
                success: false,
                message:
                  "Inventory unavailable.",
              })
          )
        );

        renderPage();

        expect(
          await screen.findByRole(
            "alert"
          )
        ).toHaveTextContent(
          "Inventory unavailable."
        );
      }
    );

    test.each([500, 503])(
      "displays HTTP %s server failure",
      async (status) => {
        mockFailure(
          "/batches/inventory",
          {
            status,
            message:
              `Inventory error ${status}.`,
          }
        );

        renderPage();

        expect(
          await screen.findByRole(
            "alert"
          )
        ).toHaveTextContent(
          `Inventory error ${status}.`
        );
      }
    );

    test(
      "handles network connection failure",
      async () => {
        server.use(
          http.get(
            `${API_BASE}/batches/inventory`,
            () => HttpResponse.error()
          )
        );

        renderPage();

        expect(
          await screen.findByRole(
            "alert"
          )
        ).toHaveTextContent(
          "Unable to connect to the server."
        );
      }
    );

    test(
      "keeps session active for HTTP 403",
      async () => {
        mockFailure(
          "/batches/inventory",
          {
            status: 403,
            message:
              "Access forbidden.",
          }
        );

        renderPage();

        expect(
          await screen.findByRole(
            "alert"
          )
        ).toHaveTextContent(
          "Access forbidden."
        );

        expect(
          screen.getByTestId(
            "auth-state"
          )
        ).toHaveTextContent(
          "authenticated"
        );
      }
    );

    test(
      "logs out and redirects on HTTP 401",
      async () => {
        mockFailure(
          "/batches/inventory",
          {
            status: 401,
            message:
              "Session expired.",
          }
        );

        renderPage();

        await waitFor(() => {
          expect(
            screen.getByTestId(
              "auth-state"
            )
          ).toHaveTextContent("guest");
        });

        expect(
          await screen.findByRole(
            "heading",
            {
              name: "Login required",
            }
          )
        ).toBeInTheDocument();
      }
    );

    test(
      "reloads after temporary server error",
      async () => {
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
                    message:
                      "Temporary error.",
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
          await screen.findByRole(
            "alert"
          )
        ).toHaveTextContent(
          "Temporary error."
        );

        reload("available inventory");

        expect(
          await screen.findByRole(
            "row",
            {
              name:
                /Paracetamol 500mg/i,
            }
          )
        ).toBeInTheDocument();

        expect(attempts).toBe(2);
      }
    );

    test(
      "reloads newly returned inventory data",
      async () => {
        const api = installApi();

        await loadedInventory();

        api.db.inventory.push({
          medicine_id: 105,
          medicine_name:
            "New Stock Medicine",
          manufacturer_id: 1,
          manufacturer_name:
            "ABC Pharma",
          category: "Tablet",
          reorder_level: 4,
          available_stock: 10,
          batches: [
            {
              batch_id: 900,
              batch_number: "NEW-001",
              selling_price: 30,
              stock_quantity: 10,
              expiry_date:
                futureDate(20),
              days_to_expire: 20,
            },
          ],
        });

        reload("available inventory");

        expect(
          await screen.findByRole(
            "row",
            {
              name:
                /New Stock Medicine/i,
            }
          )
        ).toBeInTheDocument();

        expect(
          api.count(
            "/batches/inventory"
          )
        ).toBe(2);
      }
    );
  }
);

// ============================================
// 7. INVENTORY FILTERS AND SORTING
// ============================================

describe(
  "Stock Overview - Inventory Filters",
  () => {
    test(
      "searches medicine names without refetching",
      async () => {
        const api = installApi();

        await loadedInventory();

        search("  pArAcEtAmOl  ");

        expect(
          medicineRow(
            "Paracetamol 500mg"
          )
        ).toBeInTheDocument();

        expect(
          screen.queryByRole(
            "row",
            {
              name:
                /Cetirizine 10mg/i,
            }
          )
        ).not.toBeInTheDocument();

        expect(
          api.count(
            "/batches/inventory"
          )
        ).toBe(1);
      }
    );

    test(
      "searches by manufacturer name",
      async () => {
        installApi();
        await loadedInventory();

        search("wellness pharma");

        expect(
          medicineRow("Vitamin C")
        ).toBeInTheDocument();

        expect(
          tableRows()
        ).toHaveLength(1);
      }
    );

    test(
      "searches nested batch numbers",
      async () => {
        const api = installApi();

        await loadedInventory();

        search("par-soon");

        expect(
          medicineRow(
            "Paracetamol 500mg"
          )
        ).toBeInTheDocument();

        expect(
          tableRows()
        ).toHaveLength(1);

        expect(
          api.count(
            "/batches/inventory"
          )
        ).toBe(1);
      }
    );

    test(
      "filters by category",
      async () => {
        installApi();
        await loadedInventory();

        selectFilter(
          "Category",
          "Capsule"
        );

        expect(
          medicineRow(
            "Ibuprofen 200mg"
          )
        ).toBeInTheDocument();

        expect(
          tableRows()
        ).toHaveLength(1);
      }
    );

    test(
      "filters by manufacturer ID",
      async () => {
        installApi();
        await loadedInventory();

        selectFilter(
          "Manufacturer",
          "1"
        );

        expect(
          medicineRow(
            "Paracetamol 500mg"
          )
        ).toBeInTheDocument();

        expect(
          medicineRow(
            "Ibuprofen 200mg"
          )
        ).toBeInTheDocument();

        expect(
          tableRows()
        ).toHaveLength(2);
      }
    );

    test(
      "filters medicines expiring within 10 days",
      async () => {
        installApi();
        await loadedInventory();

        selectFilter(
          "Expiry",
          "Soon"
        );

        expect(
          medicineRow(
            "Paracetamol 500mg"
          )
        ).toBeInTheDocument();

        expect(
          medicineRow(
            "Cetirizine 10mg"
          )
        ).toBeInTheDocument();

        expect(
          tableRows()
        ).toHaveLength(2);
      }
    );

    test(
      "filters batches expiring today",
      async () => {
        installApi();
        await loadedInventory();

        selectFilter(
          "Expiry",
          "Today"
        );

        expect(
          medicineRow(
            "Cetirizine 10mg"
          )
        ).toBeInTheDocument();

        expect(
          tableRows()
        ).toHaveLength(1);
      }
    );

    test(
      "combines all inventory filters",
      async () => {
        installApi();
        await loadedInventory();

        search("PAR-SOON");

        selectFilter(
          "Manufacturer",
          "1"
        );

        selectFilter(
          "Category",
          "Tablet"
        );

        selectFilter(
          "Expiry",
          "Soon"
        );

        expect(
          medicineRow(
            "Paracetamol 500mg"
          )
        ).toBeInTheDocument();

        expect(
          tableRows()
        ).toHaveLength(1);
      }
    );

    test(
      "clears filters without another API call",
      async () => {
        const api = installApi();

        await loadedInventory();

        search("Vitamin");

        selectFilter(
          "Category",
          "Supplement"
        );

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "Clear filters",
            }
          )
        );

        expect(
          tableRows()
        ).toHaveLength(4);

        expect(
          screen.getByRole(
            "searchbox",
            {
              name: "Search",
            }
          )
        ).toHaveValue("");

        expect(
          screen.getByRole(
            "combobox",
            {
              name: "Category",
            }
          )
        ).toHaveValue("All");

        expect(
          api.count(
            "/batches/inventory"
          )
        ).toBe(1);
      }
    );

    test(
      "shows no matches with both reset buttons",
      async () => {
        installApi();
        await loadedInventory();

        search("NOT-FOUND-999");

        expect(
          screen.getByRole(
            "heading",
            {
              name:
                "No matching medicines",
            }
          )
        ).toBeInTheDocument();

        expect(
          screen.getAllByRole(
            "button",
            {
              name: "Clear filters",
            }
          )
        ).toHaveLength(2);

        fireEvent.click(
          screen.getAllByRole(
            "button",
            {
              name: "Clear filters",
            }
          )[1]
        );

        expect(
          medicineRow(
            "Paracetamol 500mg"
          )
        ).toBeInTheDocument();
      }
    );

    test(
      "sorts available stock numerically both ways",
      async () => {
        const api = installApi();

        await loadedInventory();

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name:
                "Available stock: sort lowest to highest",
            }
          )
        );

        expect(
          tableRows()[0]
        ).toHaveTextContent(
          "Cetirizine 10mg"
        );

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name:
                "Available stock: sort highest to lowest",
            }
          )
        );

        expect(
          tableRows()[0]
        ).toHaveTextContent(
          "Vitamin C"
        );

        expect(
          api.count(
            "/batches/inventory"
          )
        ).toBe(1);
      }
    );

    test(
      "sorts earliest expiry both ways",
      async () => {
        installApi();
        await loadedInventory();

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name:
                "Earliest expiry: sort earliest to latest",
            }
          )
        );

        expect(
          tableRows()[0]
        ).toHaveTextContent(
          "Cetirizine 10mg"
        );

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name:
                "Earliest expiry: sort latest to earliest",
            }
          )
        );

        expect(
          tableRows()[0]
        ).toHaveTextContent(
          "Vitamin C"
        );
      }
    );
  }
);

// ============================================
// 8. INVENTORY BATCH DETAILS MODAL
// ============================================

describe(
  "Stock Overview - Batch Details Integration",
  () => {
    test(
      "opens modal and sorts batches by expiry",
      async () => {
        installApi();
        await loadedInventory();

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name:
                "View available batches for Paracetamol 500mg",
            }
          )
        );

        const dialog =
          screen.getByRole(
            "dialog",
            {
              name: "Available batches",
            }
          );

        expect(
          within(dialog).getByText(
            "Paracetamol 500mg"
          )
        ).toBeInTheDocument();

        expect(dialog).toHaveTextContent(
          "Available stock: 30"
        );

        const rows = within(
          within(dialog).getByRole(
            "table"
          )
        )
          .getAllByRole("row")
          .slice(1);

        expect(rows).toHaveLength(2);

        expect(
          rows[0]
        ).toHaveTextContent(
          "PAR-SOON"
        );

        expect(
          rows[0]
        ).toHaveTextContent(
          "16.75"
        );

        expect(
          rows[0]
        ).toHaveTextContent(
          "Expires in 5 days"
        );

        expect(
          rows[1]
        ).toHaveTextContent(
          "PAR-LATE"
        );

        expect(
          rows[1]
        ).toHaveTextContent(
          "40 days remaining"
        );
      }
    );

    test(
      "closes batch details using Close button",
      async () => {
        installApi();
        await loadedInventory();

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name:
                "View available batches for Paracetamol 500mg",
            }
          )
        );

        fireEvent.click(
          within(
            screen.getByRole(
              "dialog"
            )
          ).getByRole(
            "button",
            {
              name: "Close",
            }
          )
        );

        expect(
          screen.queryByRole(
            "dialog"
          )
        ).not.toBeInTheDocument();
      }
    );

    test(
      "closes modal using header close button",
      async () => {
        installApi();
        await loadedInventory();

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name:
                "View available batches for Cetirizine 10mg",
            }
          )
        );

        fireEvent.click(
          within(
            screen.getByRole(
              "dialog"
            )
          ).getByRole(
            "button",
            {
              name: "Close dialog",
            }
          )
        );

        expect(
          screen.queryByRole(
            "dialog"
          )
        ).not.toBeInTheDocument();
      }
    );

    test(
      "refreshes open modal after inventory reload",
      async () => {
        const api = installApi();

        await loadedInventory();

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name:
                "View available batches for Paracetamol 500mg",
            }
          )
        );

        const medicine =
          api.db.inventory.find(
            (item) =>
              item.medicine_id === 101
          );

        medicine.available_stock = 38;

        medicine.batches.push({
          batch_id: 503,
          batch_number: "PAR-NEW",
          selling_price: 19,
          stock_quantity: 8,
          expiry_date:
            futureDate(2),
          days_to_expire: 2,
        });

        reload(
          "available inventory"
        );

        await waitFor(() => {
          const dialog =
            screen.getByRole(
              "dialog",
              {
                name:
                  "Available batches",
              }
            );

          expect(
            within(
              dialog
            ).getByRole("row", {
              name: /PAR-NEW/i,
            })
          ).toBeInTheDocument();

          expect(
            dialog
          ).toHaveTextContent(
            "Available stock: 38"
          );
        });

        expect(
          api.count(
            "/batches/inventory"
          )
        ).toBe(2);
      }
    );

    test(
      "handles inventory record without batches",
      async () => {
        const [medicine] =
          initialInventory();

        medicine.available_stock = 0;
        medicine.batches = [];

        installApi({
          inventory: [medicine],
        });

        await loadedInventory();

        expect(
          within(
            medicineRow(
              "Paracetamol 500mg"
            )
          ).getByText(
            "Unknown expiry"
          )
        ).toBeInTheDocument();

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name:
                "View available batches for Paracetamol 500mg",
            }
          )
        );

        const dialog =
          screen.getByRole(
            "dialog",
            {
              name:
                "Available batches",
            }
          );

        expect(
          within(
            dialog
          ).getByRole(
            "button",
            {
              name: "Close",
            }
          )
        ).toBeInTheDocument();

        expect(
          within(
            within(
              dialog
            ).getByRole("table")
          ).queryAllByRole("row")
        ).toHaveLength(1);
      }
    );
  }
);

// ============================================
// 9. LOW STOCK GET TESTS
// ============================================

describe(
  "Stock Overview - Low Stock GET",
  () => {
    test(
      "loads low-stock data and derives status",
      async () => {
        const api = installApi();

        await loadedLowStock();

        expect(
          api.count(
            "/batches/low-stock"
          )
        ).toBe(1);

        expect(
          api.count(
            "/batches/inventory"
          )
        ).toBe(0);

        expect(
          api.first(
            "/batches/low-stock"
          ).authorization
        ).toMatch(/^Bearer \S+$/);

        expect(
          within(
            medicineRow("Insulin")
          ).getByText(
            "Out of stock"
          )
        ).toBeInTheDocument();

        expect(
          within(
            medicineRow(
              "Amoxicillin"
            )
          ).getByText(
            "Low stock"
          )
        ).toBeInTheDocument();

        expect(
          within(
            medicineRow(
              "Amoxicillin"
            )
          ).getByText("6")
        ).toBeInTheDocument();

        expect(
          within(
            medicineRow("Glucose")
          ).getByText(
            "At reorder level"
          )
        ).toBeInTheDocument();
      }
    );

    test(
      "shows low-stock summary counts",
      async () => {
        installApi();
        await loadedLowStock();

        expect(
          within(
            summary()
          ).getByText("4")
        ).toBeInTheDocument();

        expect(
          within(
            summary()
          ).getByText("1")
        ).toBeInTheDocument();

        expect(
          summary()
        ).toHaveTextContent(
          "medicines need attention"
        );

        expect(
          summary()
        ).toHaveTextContent(
          "out of stock"
        );
      }
    );

    test(
      "shows loading until low-stock response completes",
      async () => {
        let release;

        const pending =
          new Promise(
            (resolve) => {
              release = resolve;
            }
          );

        server.use(
          http.get(
            `${API_BASE}/batches/low-stock`,
            async () => {
              await pending;

              return HttpResponse.json({
                success: true,
                data:
                  initialLowStock(),
              });
            }
          )
        );

        renderPage({
          mode: "low-stock",
        });

        await waitFor(() => {
          expect(
            screen.getAllByText(
              "Loading stock information..."
            ).length
          ).toBeGreaterThan(0);

          expect(
            screen.getByRole(
              "button",
              {
                name:
                  "Reload low stock",
              }
            )
          ).toBeDisabled();
        });

        await act(async () => {
          release();
        });

        expect(
          await screen.findByRole(
            "row",
            {
              name: /Insulin/i,
            }
          )
        ).toBeInTheDocument();
      }
    );

    test(
      "shows empty low-stock response",
      async () => {
        installApi({
          lowStock: [],
        });

        renderPage({
          mode: "low-stock",
        });

        expect(
          await screen.findByRole(
            "heading",
            {
              name:
                "No low-stock medicines found",
            }
          )
        ).toBeInTheDocument();
      }
    );

    test(
      "converts expected low-stock HTTP 404",
      async () => {
        mockFailure(
          "/batches/low-stock",
          {
            status: 404,
            message:
              "No low stock medicines found.",
          }
        );

        renderPage({
          mode: "low-stock",
        });

        expect(
          await screen.findByRole(
            "heading",
            {
              name:
                "No low-stock medicines found",
            }
          )
        ).toBeInTheDocument();
      }
    );

    test(
      "rejects invalid low-stock response",
      async () => {
        server.use(
          http.get(
            `${API_BASE}/batches/low-stock`,
            () =>
              HttpResponse.json({
                success: true,
                data: {},
              })
          )
        );

        renderPage({
          mode: "low-stock",
        });

        expect(
          await screen.findByRole(
            "alert"
          )
        ).toHaveTextContent(
          "The server returned an invalid low-stock list."
        );
      }
    );

    test.each([400, 500])(
      "displays low-stock HTTP %s error",
      async (status) => {
        mockFailure(
          "/batches/low-stock",
          {
            status,
            message:
              `Low stock error ${status}.`,
          }
        );

        renderPage({
          mode: "low-stock",
        });

        expect(
          await screen.findByRole(
            "alert"
          )
        ).toHaveTextContent(
          `Low stock error ${status}.`
        );
      }
    );

    test(
      "handles low-stock network failure",
      async () => {
        server.use(
          http.get(
            `${API_BASE}/batches/low-stock`,
            () =>
              HttpResponse.error()
          )
        );

        renderPage({
          mode: "low-stock",
        });

        expect(
          await screen.findByRole(
            "alert"
          )
        ).toHaveTextContent(
          "Unable to connect to the server."
        );
      }
    );

    test(
      "keeps session on low-stock HTTP 403",
      async () => {
        mockFailure(
          "/batches/low-stock",
          {
            status: 403,
            message:
              "Access forbidden.",
          }
        );

        renderPage({
          mode: "low-stock",
        });

        expect(
          await screen.findByRole(
            "alert"
          )
        ).toHaveTextContent(
          "Access forbidden."
        );

        expect(
          screen.getByTestId(
            "auth-state"
          )
        ).toHaveTextContent(
          "authenticated"
        );
      }
    );

    test(
      "logs out after low-stock HTTP 401",
      async () => {
        mockFailure(
          "/batches/low-stock",
          {
            status: 401,
            message:
              "Session expired.",
          }
        );

        renderPage({
          mode: "low-stock",
        });

        await waitFor(() => {
          expect(
            screen.getByTestId(
              "auth-state"
            )
          ).toHaveTextContent(
            "guest"
          );
        });

        expect(
          await screen.findByRole(
            "heading",
            {
              name:
                "Login required",
            }
          )
        ).toBeInTheDocument();
      }
    );

    test(
      "retries failed low-stock request",
      async () => {
        let attempts = 0;

        server.use(
          http.get(
            `${API_BASE}/batches/low-stock`,
            () => {
              attempts++;

              if (
                attempts === 1
              ) {
                return HttpResponse.json(
                  {
                    success: false,
                    message:
                      "Try again.",
                  },
                  { status: 500 }
                );
              }

              return HttpResponse.json({
                success: true,
                data:
                  initialLowStock(),
              });
            }
          )
        );

        renderPage({
          mode: "low-stock",
        });

        expect(
          await screen.findByRole(
            "alert"
          )
        ).toHaveTextContent(
          "Try again."
        );

        reload("low stock");

        expect(
          await screen.findByRole(
            "row",
            {
              name: /Insulin/i,
            }
          )
        ).toBeInTheDocument();

        expect(
          attempts
        ).toBe(2);
      }
    );

    test(
      "reloads updated stock information",
      async () => {
        const api = installApi();

        await loadedLowStock();

        api.db.lowStock[0]
          .available_stock = "3";

        reload("low stock");

        await waitFor(() => {
          expect(
            within(
              medicineRow(
                "Insulin"
              )
            ).getByText(
              "Low stock"
            )
          ).toBeInTheDocument();
        });

        expect(
          api.count(
            "/batches/low-stock"
          )
        ).toBe(2);
      }
    );
  }
);

// ============================================
// 10. LOW STOCK FILTERING AND SORTING
// ============================================

describe(
  "Stock Overview - Low Stock Filters",
  () => {
    test(
      "searches medicine names",
      async () => {
        const api = installApi();

        await loadedLowStock();

        search("  aMoXi  ");

        expect(
          medicineRow(
            "Amoxicillin"
          )
        ).toBeInTheDocument();

        expect(
          tableRows()
        ).toHaveLength(1);

        expect(
          api.count(
            "/batches/low-stock"
          )
        ).toBe(1);
      }
    );

    test(
      "searches by manufacturer",
      async () => {
        installApi();
        await loadedLowStock();

        search("Bio Labs");

        expect(
          medicineRow(
            "Insulin"
          )
        ).toBeInTheDocument();

        expect(
          medicineRow(
            "Glucose"
          )
        ).toBeInTheDocument();

        expect(
          tableRows()
        ).toHaveLength(2);
      }
    );

    test(
      "filters by category",
      async () => {
        installApi();
        await loadedLowStock();

        selectFilter(
          "Category",
          "Diabetes"
        );

        expect(
          medicineRow(
            "Insulin"
          )
        ).toBeInTheDocument();

        expect(
          medicineRow(
            "Glucose"
          )
        ).toBeInTheDocument();

        expect(
          tableRows()
        ).toHaveLength(2);
      }
    );

    test(
      "filters by manufacturer",
      async () => {
        installApi();
        await loadedLowStock();

        selectFilter(
          "Manufacturer",
          "2"
        );

        expect(
          medicineRow(
            "Amoxicillin"
          )
        ).toBeInTheDocument();

        expect(
          tableRows()
        ).toHaveLength(1);
      }
    );

    test(
      "filters medicines completely out of stock",
      async () => {
        installApi();
        await loadedLowStock();

        selectFilter(
          "Stock condition",
          "Out"
        );

        expect(
          medicineRow(
            "Insulin"
          )
        ).toBeInTheDocument();

        expect(
          tableRows()
        ).toHaveLength(1);
      }
    );

    test(
      "filters low-stock medicines with positive stock",
      async () => {
        installApi();
        await loadedLowStock();

        selectFilter(
          "Stock condition",
          "Low"
        );

        expect(
          tableRows()
        ).toHaveLength(3);

        expect(
          screen.queryByRole(
            "row",
            {
              name: /Insulin/i,
            }
          )
        ).not.toBeInTheDocument();
      }
    );

    test(
      "combines search and stock condition",
      async () => {
        installApi();
        await loadedLowStock();

        search("Bio Labs");

        selectFilter(
          "Category",
          "Diabetes"
        );

        selectFilter(
          "Stock condition",
          "Low"
        );

        expect(
          medicineRow(
            "Glucose"
          )
        ).toBeInTheDocument();

        expect(
          tableRows()
        ).toHaveLength(1);
      }
    );

    test(
      "clears filters without refetching",
      async () => {
        const api = installApi();

        await loadedLowStock();

        selectFilter(
          "Stock condition",
          "Out"
        );

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name:
                "Clear filters",
            }
          )
        );

        expect(
          tableRows()
        ).toHaveLength(4);

        expect(
          screen.getByRole(
            "combobox",
            {
              name:
                "Stock condition",
            }
          )
        ).toHaveValue("All");

        expect(
          api.count(
            "/batches/low-stock"
          )
        ).toBe(1);
      }
    );

    test(
      "shows no matching medicines",
      async () => {
        installApi();
        await loadedLowStock();

        search("NOT-FOUND-999");

        expect(
          screen.getByRole(
            "heading",
            {
              name:
                "No matching medicines",
            }
          )
        ).toBeInTheDocument();

        expect(
          screen.getAllByRole(
            "button",
            {
              name:
                "Clear filters",
            }
          )
        ).toHaveLength(2);
      }
    );

    test(
      "sorts units to threshold numerically",
      async () => {
        const api = installApi();

        await loadedLowStock();

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name:
                "Units to threshold: sort lowest to highest",
            }
          )
        );

        expect(
          tableRows()[0]
        ).toHaveTextContent(
          "Glucose"
        );

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name:
                "Units to threshold: sort highest to lowest",
            }
          )
        );

        expect(
          tableRows()[0]
        ).toHaveTextContent(
          "Insulin"
        );

        expect(
          api.count(
            "/batches/low-stock"
          )
        ).toBe(1);
      }
    );

    test(
      "uses ascending stock as default sort",
      async () => {
        installApi();
        await loadedLowStock();

        expect(
          tableRows()[0]
        ).toHaveTextContent(
          "Insulin"
        );

        expect(
          screen.getByRole(
            "columnheader",
            {
              name:
                /Available stock/i,
            }
          )
        ).toHaveAttribute(
          "aria-sort",
          "ascending"
        );
      }
    );

    test(
      "does not show batch modal actions on low-stock page",
      async () => {
        installApi();
        await loadedLowStock();

        expect(
          screen.queryByRole(
            "button",
            {
              name:
                /View available batches/i,
            }
          )
        ).not.toBeInTheDocument();

        expect(
          screen.queryByRole(
            "dialog"
          )
        ).not.toBeInTheDocument();
      }
    );
  }
);

// ============================================
// 11. ROUTES AND ROLE PERMISSIONS
// ============================================

describe(
  "Stock Overview - Routes and Permissions",
  () => {
    test.each([
      "inventory",
      "low-stock",
    ])(
      "allows Admin to view %s",
      async (mode) => {
        const api = installApi();

        renderPage({
          mode,
          role: "Admin",
        });

        expect(
          await screen.findByRole(
            "heading",
            {
              name:
                mode === "inventory"
                  ? "Available Inventory"
                  : "Low Stock",
            }
          )
        ).toBeInTheDocument();

        await waitFor(() => {
          expect(
            api.count(
              mode === "inventory"
                ? "/batches/inventory"
                : "/batches/low-stock"
            )
          ).toBe(1);
        });
      }
    );

    test.each([
      "inventory",
      "low-stock",
    ])(
      "allows Pharmacist to view %s",
      async (mode) => {
        const api = installApi();

        renderPage({
          mode,
          role: "Pharmacist",
        });

        await waitFor(() => {
          expect(
            api.count(
              mode === "inventory"
                ? "/batches/inventory"
                : "/batches/low-stock"
            )
          ).toBe(1);
        });

        expect(
          screen.getByTestId(
            "auth-state"
          )
        ).toHaveTextContent(
          "authenticated"
        );
      }
    );

    test.each([
      "inventory",
      "low-stock",
    ])(
      "denies Customer access to %s",
      async (mode) => {
        const api = installApi();

        renderPage({
          mode,
          role: "Customer",
        });

        expect(
          await screen.findByRole(
            "heading",
            {
              name:
                "Access denied",
            }
          )
        ).toBeInTheDocument();

        expect(
          api.calls
        ).toHaveLength(0);
      }
    );

    test.each([
      "inventory",
      "low-stock",
    ])(
      "redirects unauthenticated %s access",
      async (mode) => {
        const api = installApi();

        renderPage({
          mode,
          autoLogin: false,
        });

        expect(
          await screen.findByRole(
            "heading",
            {
              name:
                "Login required",
            }
          )
        ).toBeInTheDocument();

        expect(
          api.calls
        ).toHaveLength(0);
      }
    );

    test(
      "switches from inventory to low-stock API",
      async () => {
        const api = installApi();

        await loadedInventory();

        fireEvent.click(
          screen.getByRole(
            "link",
            {
              name:
                "Low-stock link",
            }
          )
        );

        expect(
          await screen.findByRole(
            "row",
            {
              name:
                /Insulin/i,
            }
          )
        ).toBeInTheDocument();

        expect(
          screen.getByRole(
            "heading",
            {
              name:
                "Low Stock",
            }
          )
        ).toBeInTheDocument();

        expect(
          api.count(
            "/batches/inventory"
          )
        ).toBe(1);

        expect(
          api.count(
            "/batches/low-stock"
          )
        ).toBe(1);
      }
    );

    test(
      "ignores stale inventory response after changing page",
      async () => {
        let releaseOld;

        const pending =
          new Promise(
            (resolve) => {
              releaseOld = resolve;
            }
          );

        server.use(
          http.get(
            `${API_BASE}/batches/inventory`,
            async () => {
              await pending;

              return HttpResponse.json({
                success: true,
                data:
                  initialInventory(),
              });
            }
          ),

          http.get(
            `${API_BASE}/batches/low-stock`,
            () =>
              HttpResponse.json({
                success: true,
                data:
                  initialLowStock(),
              })
          )
        );

        renderPage();

        await screen.findAllByText(
          "Loading stock information..."
        );

        fireEvent.click(
          screen.getByRole(
            "link",
            {
              name:
                "Low-stock link",
            }
          )
        );

        expect(
          await screen.findByRole(
            "row",
            {
              name:
                /Insulin/i,
            }
          )
        ).toBeInTheDocument();

        await act(async () => {
          releaseOld();
        });

        expect(
          medicineRow(
            "Insulin"
          )
        ).toBeInTheDocument();

        expect(
          screen.queryByRole(
            "row",
            {
              name:
                /Paracetamol 500mg/i,
            }
          )
        ).not.toBeInTheDocument();
      }
    );
  }
);
