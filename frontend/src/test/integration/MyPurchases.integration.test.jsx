
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
let MyPurchases;

// ============================================
// 2. TEST DATA
// ============================================

function initialPurchases() {
  return [
    {
      sale_id: "301",
      payment_mode: "Cash",
      total_amount: "31.00",
      pharmacist_name: "Ravi",
      created_at: "2026-11-01T10:00:00",
    },
    {
      sale_id: "302",
      payment_mode: "UPI",
      total_amount: "20.25",
      pharmacist_name: null,
      created_at: "2026-11-04T10:00:00",
    },
    {
      sale_id: "303",
      payment_mode: "Card",
      total_amount: "12.75",
      pharmacist_name: "Priya",
      created_at: "2026-11-03T10:00:00",
    },
    {
      sale_id: "304",
      payment_mode: "Cash",
      total_amount: "10.00",
      pharmacist_name: "Ravi",
      created_at: "2026-11-02T10:00:00",
    },
  ];
}

function initialDetails() {
  const purchases = initialPurchases();

  return {
    301: {
      ...purchases[0],
      items: [
        {
          sale_item_id: "1001",
          sale_id: "301",
          medicine_id: "11",
          medicine_name: "Paracetamol 500mg",
          manufacturer_name: "ABC Pharma",
          batch_id: "501",
          batch_number: "PAR-001",
          quantity: "2",
          selling_price: "10.50",
          subtotal: "21.00",
        },
        {
          sale_item_id: "1002",
          sale_id: "301",
          medicine_id: "12",
          medicine_name: "Vitamin C",
          manufacturer_name: "Health Labs",
          batch_id: "502",
          batch_number: "VIT-001",
          quantity: "1",
          selling_price: "10.00",
          subtotal: "10.00",
        },
      ],
    },
    302: {
      ...purchases[1],
      items: [
        {
          sale_item_id: "1003",
          sale_id: "302",
          medicine_id: "13",
          medicine_name: "Ibuprofen 200mg",
          manufacturer_name: "ABC Pharma",
          batch_id: "503",
          batch_number: "IBU-001",
          quantity: "1",
          selling_price: "20.25",
          subtotal: "20.25",
        },
      ],
    },
    303: {
      ...purchases[2],
      items: [
        {
          sale_item_id: "1004",
          sale_id: "303",
          medicine_id: "14",
          medicine_name: "Cetirizine 10mg",
          manufacturer_name: "Health Labs",
          batch_id: "504",
          batch_number: "CET-001",
          quantity: "1",
          selling_price: "12.75",
          subtotal: "12.75",
        },
      ],
    },
    304: {
      ...purchases[3],
      items: [
        {
          sale_item_id: "1005",
          sale_id: "304",
          medicine_id: "15",
          medicine_name: "Zinc Tablet",
          manufacturer_name: "Wellness Pharma",
          batch_id: "505",
          batch_number: "ZINC-001",
          quantity: "2",
          selling_price: "5.00",
          subtotal: "10.00",
        },
      ],
    },
  };
}

// ============================================
// 3. STATEFUL MSW BACKEND
// ============================================

function installPurchaseApi({
  purchases = initialPurchases(),
  details = initialDetails(),
} = {}) {
  const db = {
    purchases: structuredClone(purchases),
    details: structuredClone(details),
  };

  const requests = [];

  server.use(
    // GET /sales/my-purchases
    http.get(
      `${API_BASE}/sales/my-purchases`,
      ({ request }) => {
        requests.push({
          method: "GET",
          path: "/sales/my-purchases",
          authorization:
            request.headers.get("authorization"),
          accept:
            request.headers.get("accept"),
        });

        return HttpResponse.json({
          success: true,
          data: structuredClone(db.purchases),
        });
      }
    ),

    // GET /sales/my-purchases/:saleId
    http.get(
      `${API_BASE}/sales/my-purchases/:saleId`,
      ({ request, params }) => {
        const path =
          `/sales/my-purchases/${params.saleId}`;

        requests.push({
          method: "GET",
          path,
          authorization:
            request.headers.get("authorization"),
          accept:
            request.headers.get("accept"),
        });

        const purchase =
          db.details[params.saleId];

        if (!purchase) {
          return HttpResponse.json(
            {
              success: false,
              message: "Purchase not found.",
            },
            { status: 404 }
          );
        }

        return HttpResponse.json({
          success: true,
          data: structuredClone(purchase),
        });
      }
    )
  );

  return {
    db,
    requests,

    count(path) {
      return requests.filter(
        (request) => request.path === path
      ).length;
    },

    find(path) {
      return requests.find(
        (request) => request.path === path
      );
    },
  };
}

function mockListError({
  status = 500,
  message = "Database unavailable.",
} = {}) {
  server.use(
    http.get(
      `${API_BASE}/sales/my-purchases`,
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

function mockDetailsError(
  saleId,
  {
    status = 500,
    message = "Purchase details unavailable.",
  } = {}
) {
  server.use(
    http.get(
      `${API_BASE}/sales/my-purchases/${saleId}`,
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
// 4. REAL AUTHENTICATION + ROUTING
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
  role = "Customer",
  autoLogin = true,
}) {
  const { login, isAuthenticated } = useAuth();

  const [ready, setReady] =
    useState(!autoLogin);

  useEffect(() => {
    if (!autoLogin) return;

    login({
      token: createToken(),
      user: {
        user_id: 7,
        name: "Test Customer",
        email: "customer@example.com",
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

      <nav>
        <Link to="/my-purchases">
          My Purchases link
        </Link>
      </nav>

      {ready && (
        <Routes>
          <Route
            path="/login"
            element={<h1>Login required</h1>}
          />

          <Route
            path="/forbidden"
            element={<h1>Access denied</h1>}
          />

          <Route
            element={<ProtectedRoute />}
          >
            <Route
              element={
                <ProtectedRoute
                  allowedRoles={["Customer"]}
                />
              }
            >
              <Route
                path="/my-purchases"
                element={<MyPurchases />}
              />
            </Route>
          </Route>
        </Routes>
      )}
    </>
  );
}

function renderPage({
  role = "Customer",
  autoLogin = true,
} = {}) {
  return render(
    <MemoryRouter
      initialEntries={["/my-purchases"]}
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

async function loadPurchases() {
  renderPage();

  return screen.findByRole("row", {
    name: /#301\b/,
  });
}

function purchaseRow(id) {
  return screen.getByRole("row", {
    name: new RegExp(`#${id}\\b`),
  });
}

function purchaseRows() {
  return within(
    screen.getByRole("table")
  )
    .getAllByRole("row")
    .slice(1);
}

function searchPurchases(value) {
  fireEvent.change(
    screen.getByRole("searchbox", {
      name: "Search purchases",
    }),
    {
      target: { value },
    }
  );
}

function filterPayment(mode) {
  fireEvent.change(
    screen.getByRole("combobox", {
      name: "Payment mode",
    }),
    {
      target: { value: mode },
    }
  );
}

function reloadPurchases() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "Reload purchases",
    })
  );
}

function getSummary() {
  return screen.getByRole("group", {
    name: "Summary before filtering",
  });
}

function openPurchase(id) {
  fireEvent.click(
    screen.getByRole("button", {
      name: `View medicines for purchase ${id}`,
    })
  );
}

function getDialog() {
  return screen.getByRole("dialog", {
    name: "Purchased medicines",
  });
}

async function openLoadedPurchase(id = 301) {
  openPurchase(id);

  await screen.findByRole("heading", {
    name: `Purchase #${id}`,
  });

  return getDialog();
}

function closePurchase() {
  fireEvent.click(
    within(getDialog()).getByRole("button", {
      name: "Close",
      exact: true,
    })
  );
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

  ({ default: MyPurchases } =
    await import(
      "../../pages/purchases/MyPurchases.jsx"
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
// 7. GET PURCHASE HISTORY
// ============================================

describe("My Purchases - GET Integration", () => {
  test("1. loads purchases using the real service and JWT", async () => {
    const api = installPurchaseApi();

    await loadPurchases();

    expect(purchaseRows()).toHaveLength(4);

    expect(
      purchaseRow(301)
    ).toBeInTheDocument();

    expect(
      purchaseRow(302)
    ).toBeInTheDocument();

    expect(
      purchaseRow(303)
    ).toBeInTheDocument();

    expect(
      purchaseRow(304)
    ).toBeInTheDocument();

    expect(
      api.count("/sales/my-purchases")
    ).toBe(1);

    const request =
      api.find("/sales/my-purchases");

    expect(request.method).toBe("GET");

    expect(request.accept).toBe(
      "application/json"
    );

    expect(
      request.authorization
    ).toMatch(/^Bearer \S+$/);
  });

  test("2. displays normalized purchase amounts", async () => {
    installPurchaseApi();

    await loadPurchases();

    expect(
      purchaseRow(301)
    ).toHaveTextContent("31.00");

    expect(
      purchaseRow(302)
    ).toHaveTextContent("20.25");

    expect(
      purchaseRow(303)
    ).toHaveTextContent("12.75");
  });

  test("3. displays purchase date and payment mode", async () => {
    installPurchaseApi();

    await loadPurchases();

    expect(
      purchaseRow(301)
    ).toHaveTextContent("Cash");

    expect(
      purchaseRow(302)
    ).toHaveTextContent("UPI");

    expect(
      purchaseRow(303)
    ).toHaveTextContent("Card");

    expect(
      purchaseRow(301)
    ).toHaveTextContent("Nov 2026");
  });

  test("4. displays total purchases and total spent", async () => {
    installPurchaseApi();

    await loadPurchases();

    expect(
      getSummary()
    ).toHaveTextContent("4");

    expect(
      getSummary()
    ).toHaveTextContent("Purchases");

    // 31 + 20.25 + 12.75 + 10 = 74
    expect(
      getSummary()
    ).toHaveTextContent("74.00");

    expect(
      getSummary()
    ).toHaveTextContent("Total spent");
  });

  test("5. sorts newest purchases first by default", async () => {
    installPurchaseApi();

    await loadPurchases();

    const rows = purchaseRows();

    expect(rows[0]).toHaveTextContent(
      "#302"
    );

    expect(rows[1]).toHaveTextContent(
      "#303"
    );

    expect(rows[2]).toHaveTextContent(
      "#304"
    );

    expect(rows[3]).toHaveTextContent(
      "#301"
    );
  });

  test("6. displays loading state during pending GET", async () => {
    let release;

    const pending = new Promise(
      (resolve) => {
        release = resolve;
      }
    );

    server.use(
      http.get(
        `${API_BASE}/sales/my-purchases`,
        async () => {
          await pending;

          return HttpResponse.json({
            success: true,
            data: initialPurchases(),
          });
        }
      )
    );

    renderPage();

    expect(
      (
        await screen.findAllByText(
          "Loading purchases..."
        )
      ).length
    ).toBeGreaterThan(0);

    expect(
      screen.getByRole("button", {
        name: "Reload purchases",
      })
    ).toBeDisabled();

    await act(async () => {
      release();
    });

    expect(
      await screen.findByRole("row", {
        name: /#301\b/,
      })
    ).toBeInTheDocument();
  });

  test("7. displays empty state for successful empty list", async () => {
    installPurchaseApi({
      purchases: [],
    });

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "No purchases found",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "No purchases are linked to your account yet."
      )
    ).toBeInTheDocument();
  });

  test("8. displays HTTP 404 as an error, not empty state", async () => {
    mockListError({
      status: 404,
      message: "Purchase history not found.",
    });

    renderPage();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Purchase history not found."
    );

    expect(
      screen.queryByRole("heading", {
        name: "No purchases found",
      })
    ).not.toBeInTheDocument();
  });

  test("9. rejects invalid purchase list data", async () => {
    server.use(
      http.get(
        `${API_BASE}/sales/my-purchases`,
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
      "Unable to read your purchase history."
    );
  });

  test("10. rejects successful response with missing data", async () => {
    server.use(
      http.get(
        `${API_BASE}/sales/my-purchases`,
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
      "Unable to read your purchase history."
    );
  });

  test("11. handles success false with HTTP 200", async () => {
    server.use(
      http.get(
        `${API_BASE}/sales/my-purchases`,
        () =>
          HttpResponse.json({
            success: false,
            message: "Unable to load purchases.",
          })
      )
    );

    renderPage();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to load purchases."
    );
  });

  test("12. handles malformed JSON from the backend", async () => {
    server.use(
      http.get(
        `${API_BASE}/sales/my-purchases`,
        () =>
          HttpResponse.text(
            "not valid JSON"
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

  test.each([
    [400, "Invalid request."],
    [500, "Database unavailable."],
    [503, "Purchase service unavailable."],
  ])(
    "13. displays HTTP %s backend error",
    async (status, message) => {
      mockListError({
        status,
        message,
      });

      renderPage();

      expect(
        await screen.findByRole("alert")
      ).toHaveTextContent(message);
    }
  );

  test("14. keeps authentication after HTTP 403", async () => {
    mockListError({
      status: 403,
      message: "Access forbidden.",
    });

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

  test("15. clears session after HTTP 401", async () => {
    mockListError({
      status: 401,
      message: "Session expired.",
    });

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

  test("16. handles network connection failure", async () => {
    server.use(
      http.get(
        `${API_BASE}/sales/my-purchases`,
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

  test("17. retries successfully after an HTTP 500", async () => {
    let attempts = 0;

    server.use(
      http.get(
        `${API_BASE}/sales/my-purchases`,
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
            data: initialPurchases(),
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

    reloadPurchases();

    expect(
      await screen.findByRole("row", {
        name: /#301\b/,
      })
    ).toBeInTheDocument();

    expect(attempts).toBe(2);
  });

  test("18. reloads newly returned purchases", async () => {
    const api = installPurchaseApi();

    await loadPurchases();

    api.db.purchases.push({
      sale_id: "305",
      payment_mode: "UPI",
      total_amount: "99.00",
      pharmacist_name: "Ravi",
      created_at: "2026-11-05T10:00:00",
    });

    reloadPurchases();

    expect(
      await screen.findByRole("row", {
        name: /#305\b/,
      })
    ).toBeInTheDocument();

    expect(
      api.count("/sales/my-purchases")
    ).toBe(2);
  });

  test("19. closes purchase details when history reloads", async () => {
    const api = installPurchaseApi();

    await loadPurchases();

    await openLoadedPurchase(301);

    expect(
      getDialog()
    ).toBeInTheDocument();

    reloadPurchases();

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog")
      ).not.toBeInTheDocument();
    });

    expect(
      await screen.findByRole("row", {
        name: /#301\b/,
      })
    ).toBeInTheDocument();

    expect(
      api.count("/sales/my-purchases")
    ).toBe(2);
  });

  test("20. formats an invalid date as a dash", async () => {
    const purchases = initialPurchases();

    purchases[0].created_at = "invalid-date";

    installPurchaseApi({
      purchases,
    });

    await loadPurchases();

    expect(
      within(
        purchaseRow(301)
      ).getByText("—")
    ).toBeInTheDocument();
  });
});

// ============================================
// 8. SEARCH AND PAYMENT FILTERS
// ============================================

describe("My Purchases - Filters Integration", () => {
  test("21. searches purchase ID using a # prefix", async () => {
    const api = installPurchaseApi();

    await loadPurchases();

    searchPurchases("#302");

    expect(
      purchaseRow(302)
    ).toBeInTheDocument();

    expect(
      purchaseRows()
    ).toHaveLength(1);

    expect(
      api.count("/sales/my-purchases")
    ).toBe(1);
  });

  test("22. searches purchase IDs by partial number", async () => {
    installPurchaseApi();

    await loadPurchases();

    searchPurchases("303");

    expect(
      purchaseRow(303)
    ).toBeInTheDocument();

    expect(
      purchaseRows()
    ).toHaveLength(1);
  });

  test("23. trims spaces around search term", async () => {
    installPurchaseApi();

    await loadPurchases();

    searchPurchases("   304   ");

    expect(
      purchaseRow(304)
    ).toBeInTheDocument();

    expect(
      purchaseRows()
    ).toHaveLength(1);
  });

  test.each([
    ["Cash", 2],
    ["Card", 1],
    ["UPI", 1],
  ])(
    "24. filters %s purchases",
    async (mode, expectedCount) => {
      const api = installPurchaseApi();

      await loadPurchases();

      filterPayment(mode);

      expect(
        purchaseRows()
      ).toHaveLength(expectedCount);

      for (const row of purchaseRows()) {
        expect(row).toHaveTextContent(
          mode
        );
      }

      expect(
        api.count("/sales/my-purchases")
      ).toBe(1);
    }
  );

  test("25. combines ID search with payment filter", async () => {
    installPurchaseApi();

    await loadPurchases();

    searchPurchases("301");
    filterPayment("Cash");

    expect(
      purchaseRow(301)
    ).toBeInTheDocument();

    expect(
      purchaseRows()
    ).toHaveLength(1);
  });

  test("26. shows no results for conflicting filters", async () => {
    installPurchaseApi();

    await loadPurchases();

    searchPurchases("301");
    filterPayment("UPI");

    expect(
      screen.getByRole("heading", {
        name: "No matching purchases",
      })
    ).toBeInTheDocument();

    expect(
      screen.getAllByRole("button", {
        name: "Clear filters",
      })
    ).toHaveLength(2);
  });

  test("27. updates matching purchases and total", async () => {
    installPurchaseApi();

    await loadPurchases();

    filterPayment("Cash");

    expect(
      getSummary()
    ).toHaveTextContent(
      "Matching purchases"
    );

    expect(
      getSummary()
    ).toHaveTextContent(
      "Matching total"
    );

    // Cash totals: 31 + 10 = 41
    expect(
      getSummary()
    ).toHaveTextContent("41.00");
  });

  test("28. shows zero matching total", async () => {
    installPurchaseApi();

    await loadPurchases();

    searchPurchases("999999");

    expect(
      getSummary()
    ).toHaveTextContent(
      "Matching purchases"
    );

    expect(
      getSummary()
    ).toHaveTextContent("0.00");
  });

  test("29. clears filters without another HTTP request", async () => {
    const api = installPurchaseApi();

    await loadPurchases();

    searchPurchases("301");
    filterPayment("Cash");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Clear filters",
      })
    );

    expect(
      purchaseRows()
    ).toHaveLength(4);

    expect(
      screen.getByRole("searchbox", {
        name: "Search purchases",
      })
    ).toHaveValue("");

    expect(
      screen.getByRole("combobox", {
        name: "Payment mode",
      })
    ).toHaveValue("");

    expect(
      api.count("/sales/my-purchases")
    ).toBe(1);
  });

  test("30. clears filters using empty-state button", async () => {
    installPurchaseApi();

    await loadPurchases();

    searchPurchases("999999");

    const clearButtons =
      screen.getAllByRole("button", {
        name: "Clear filters",
      });

    expect(clearButtons).toHaveLength(2);

    fireEvent.click(clearButtons[1]);

    expect(
      purchaseRows()
    ).toHaveLength(4);
  });

  test("31. filtering does not request purchase details", async () => {
    const api = installPurchaseApi();

    await loadPurchases();

    searchPurchases("#302");
    filterPayment("UPI");

    expect(
      api.requests.filter(
        (request) =>
          request.path.startsWith(
            "/sales/my-purchases/"
          )
      )
    ).toHaveLength(0);
  });
});

// ============================================
// 9. PURCHASE SORTING
// ============================================

describe("My Purchases - Sorting Integration", () => {
  test("32. sorts purchase IDs numerically", async () => {
    const api = installPurchaseApi();

    await loadPurchases();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Purchase ID: sort ascending",
      })
    );

    expect(
      purchaseRows()[0]
    ).toHaveTextContent("#301");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Purchase ID: sort descending",
      })
    );

    expect(
      purchaseRows()[0]
    ).toHaveTextContent("#304");

    expect(
      api.count("/sales/my-purchases")
    ).toBe(1);
  });

  test("33. sorts total amounts numerically", async () => {
    installPurchaseApi();

    await loadPurchases();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Total: sort ascending",
      })
    );

    expect(
      purchaseRows()[0]
    ).toHaveTextContent("#304");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Total: sort descending",
      })
    );

    expect(
      purchaseRows()[0]
    ).toHaveTextContent("#301");
  });

  test("34. sorts payment modes alphabetically", async () => {
    installPurchaseApi();

    await loadPurchases();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Payment: sort ascending",
      })
    );

    expect(
      purchaseRows()[0]
    ).toHaveTextContent("Card");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Payment: sort descending",
      })
    );

    expect(
      purchaseRows()[0]
    ).toHaveTextContent("UPI");
  });

  test("35. sorts purchase dates oldest first", async () => {
    installPurchaseApi();

    await loadPurchases();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Purchased on: sort ascending",
      })
    );

    expect(
      purchaseRows()[0]
    ).toHaveTextContent("#301");

    expect(
      purchaseRows()[3]
    ).toHaveTextContent("#302");
  });

  test("36. keeps purchases with missing dates at the bottom", async () => {
    const purchases = initialPurchases();

    purchases[0].created_at = null;

    installPurchaseApi({
      purchases,
    });

    await loadPurchases();

    expect(
      purchaseRows()[3]
    ).toHaveTextContent("#301");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Purchased on: sort ascending",
      })
    );

    expect(
      purchaseRows()[3]
    ).toHaveTextContent("#301");
  });

  test("37. sorting happens locally without refetching", async () => {
    const api = installPurchaseApi();

    await loadPurchases();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Total: sort ascending",
      })
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Total: sort descending",
      })
    );

    expect(
      api.count("/sales/my-purchases")
    ).toBe(1);
  });
});

// ============================================
// 10. PURCHASE DETAILS - SUCCESS
// ============================================

describe("My Purchases - Details Integration", () => {
  test("38. requests details through the customer API with JWT", async () => {
    const api = installPurchaseApi();

    await loadPurchases();

    await openLoadedPurchase(301);

    const request =
      api.find(
        "/sales/my-purchases/301"
      );

    expect(request).toMatchObject({
      method: "GET",
      accept: "application/json",
    });

    expect(
      request.authorization
    ).toMatch(/^Bearer \S+$/);

    expect(
      api.count("/sales/my-purchases/301")
    ).toBe(1);

    // Customer details must not use
    // the admin sales endpoint.
    expect(
      api.requests.some(
        (item) =>
          item.path === "/sales/301"
      )
    ).toBe(false);
  });

  test("39. displays purchased medicines and batches", async () => {
    installPurchaseApi();

    await loadPurchases();

    const dialog =
      await openLoadedPurchase(301);

    expect(
      within(dialog).getByText(
        "Paracetamol 500mg"
      )
    ).toBeInTheDocument();

    expect(
      within(dialog).getByText(
        "PAR-001"
      )
    ).toBeInTheDocument();

    expect(
      within(dialog).getByText(
        "Vitamin C"
      )
    ).toBeInTheDocument();

    expect(
      within(dialog).getByText(
        "VIT-001"
      )
    ).toBeInTheDocument();

    const rows = within(
      within(dialog).getByRole("table")
    )
      .getAllByRole("row")
      .slice(1);

    expect(rows).toHaveLength(2);
  });

  test("40. displays recorded quantities and unit prices", async () => {
    installPurchaseApi();

    await loadPurchases();

    const dialog =
      await openLoadedPurchase(301);

    const medicineRow = within(
      dialog
    ).getByRole("row", {
      name: /PAR-001/i,
    });

    expect(
      medicineRow
    ).toHaveTextContent("2");

    expect(
      medicineRow
    ).toHaveTextContent("10.50");

    expect(
      medicineRow
    ).toHaveTextContent("21.00");
  });

  test("41. calculates total units from normalized quantities", async () => {
    installPurchaseApi();

    await loadPurchases();

    const dialog =
      await openLoadedPurchase(301);

    const label = within(
      dialog
    ).getByText("Total units");

    expect(
      label.nextElementSibling
    ).toHaveTextContent("3");
  });

  test("42. displays recorded total amount", async () => {
    installPurchaseApi();

    await loadPurchases();

    const dialog =
      await openLoadedPurchase(301);

    expect(
      within(dialog).getByText(
        "Total amount"
      ).parentElement
    ).toHaveTextContent("31.00");
  });

  test("43. displays pharmacist information", async () => {
    installPurchaseApi();

    await loadPurchases();

    const dialog =
      await openLoadedPurchase(301);

    const label = within(
      dialog
    ).getByText("Served by");

    expect(
      label.nextElementSibling
    ).toHaveTextContent("Ravi");
  });

  test("44. shows fallback when pharmacist name is missing", async () => {
    installPurchaseApi();

    await loadPurchases();

    const dialog =
      await openLoadedPurchase(302);

    const label = within(
      dialog
    ).getByText("Served by");

    expect(
      label.nextElementSibling
    ).toHaveTextContent("—");
  });

  test("45. does not show admin-only customer details", async () => {
    installPurchaseApi();

    await loadPurchases();

    const dialog =
      await openLoadedPurchase(301);

    expect(
      within(dialog).queryByText(
        "Customer",
        { exact: true }
      )
    ).not.toBeInTheDocument();

    expect(
      within(dialog).getByText(
        "Served by"
      )
    ).toBeInTheDocument();
  });

  test("46. handles valid purchase with no medicine items", async () => {
    const api = installPurchaseApi();

    api.db.details[301].items = [];

    await loadPurchases();

    const dialog =
      await openLoadedPurchase(301);

    expect(
      within(dialog).getByText(
        "No medicine details are available for this sale."
      )
    ).toBeInTheDocument();

    expect(
      within(dialog).queryByRole(
        "table"
      )
    ).not.toBeInTheDocument();
  });

  test("47. shows loading while details request is pending", async () => {
    installPurchaseApi();

    let release;

    const pending = new Promise(
      (resolve) => {
        release = resolve;
      }
    );

    server.use(
      http.get(
        `${API_BASE}/sales/my-purchases/:saleId`,
        async () => {
          await pending;

          return HttpResponse.json({
            success: true,
            data: initialDetails()[301],
          });
        }
      )
    );

    await loadPurchases();

    openPurchase(301);

    expect(
      await within(
        getDialog()
      ).findByText(
        "Loading medicine details..."
      )
    ).toBeInTheDocument();

    expect(
      getDialog().querySelector(
        '[aria-busy="true"]'
      )
    ).toBeInTheDocument();

    await act(async () => {
      release();
    });

    expect(
      await screen.findByRole("heading", {
        name: "Purchase #301",
      })
    ).toBeInTheDocument();
  });

  test("48. opening details does not reload purchase history", async () => {
    const api = installPurchaseApi();

    await loadPurchases();

    await openLoadedPurchase(301);

    expect(
      api.count("/sales/my-purchases")
    ).toBe(1);

    expect(
      api.count("/sales/my-purchases/301")
    ).toBe(1);
  });

  test("49. closes details through the footer Close button", async () => {
    installPurchaseApi();

    await loadPurchases();

    await openLoadedPurchase(301);

    closePurchase();

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    expect(
      purchaseRow(301)
    ).toBeInTheDocument();
  });

  test("50. closes details through the header button", async () => {
    installPurchaseApi();

    await loadPurchases();

    await openLoadedPurchase(301);

    fireEvent.click(
      within(
        getDialog()
      ).getByRole("button", {
        name: "Close dialog",
      })
    );

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();
  });

  test("51. opens another purchase after closing the first", async () => {
    const api = installPurchaseApi();

    await loadPurchases();

    await openLoadedPurchase(301);

    closePurchase();

    await openLoadedPurchase(302);

    expect(
      within(getDialog()).getByText(
        "Ibuprofen 200mg"
      )
    ).toBeInTheDocument();

    expect(
      api.count("/sales/my-purchases/301")
    ).toBe(1);

    expect(
      api.count("/sales/my-purchases/302")
    ).toBe(1);
  });
});

// ============================================
// 11. PURCHASE DETAILS - ERRORS
// ============================================

describe("My Purchases - Details Errors", () => {
  test("52. shows HTTP 404 when purchase details are missing", async () => {
    installPurchaseApi();

    mockDetailsError(301, {
      status: 404,
      message: "Purchase not found.",
    });

    await loadPurchases();

    openPurchase(301);

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Purchase not found."
    );
  });

  test("53. shows HTTP 403 for unauthorized purchase details", async () => {
    installPurchaseApi();

    mockDetailsError(301, {
      status: 403,
      message: "You cannot view this purchase.",
    });

    await loadPurchases();

    openPurchase(301);

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "You cannot view this purchase."
    );

    expect(
      screen.getByTestId("auth-state")
    ).toHaveTextContent(
      "authenticated"
    );
  });

  test("54. shows HTTP 500 purchase details error", async () => {
    installPurchaseApi();

    mockDetailsError(301, {
      status: 500,
      message: "Purchase details unavailable.",
    });

    await loadPurchases();

    openPurchase(301);

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Purchase details unavailable."
    );
  });

  test("55. rejects response without an items array", async () => {
    installPurchaseApi();

    server.use(
      http.get(
        `${API_BASE}/sales/my-purchases/:saleId`,
        () =>
          HttpResponse.json({
            success: true,
            data: {
              sale_id: 301,
              total_amount: 31,
            },
          })
      )
    );

    await loadPurchases();

    openPurchase(301);

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Unable to read the purchase details."
    );
  });

  test("56. rejects details with null data", async () => {
    installPurchaseApi();

    server.use(
      http.get(
        `${API_BASE}/sales/my-purchases/:saleId`,
        () =>
          HttpResponse.json({
            success: true,
            data: null,
          })
      )
    );

    await loadPurchases();

    openPurchase(301);

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Unable to read the purchase details."
    );
  });

  test("57. handles network failure while loading details", async () => {
    installPurchaseApi();

    server.use(
      http.get(
        `${API_BASE}/sales/my-purchases/:saleId`,
        () => HttpResponse.error()
      )
    );

    await loadPurchases();

    openPurchase(301);

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Unable to connect to the server."
    );
  });

  test("58. retries purchase details after a temporary error", async () => {
    const api = installPurchaseApi();

    let attempts = 0;

    server.use(
      http.get(
        `${API_BASE}/sales/my-purchases/:saleId`,
        ({ params }) => {
          attempts++;

          if (attempts === 1) {
            return HttpResponse.json(
              {
                success: false,
                message: "Temporary details error.",
              },
              { status: 500 }
            );
          }

          return HttpResponse.json({
            success: true,
            data: api.db.details[params.saleId],
          });
        }
      )
    );

    await loadPurchases();

    openPurchase(301);

    expect(
      await within(
        getDialog()
      ).findByRole("alert")
    ).toHaveTextContent(
      "Temporary details error."
    );

    fireEvent.click(
      within(
        getDialog()
      ).getByRole("button", {
        name: "Retry",
      })
    );

    expect(
      await screen.findByRole("heading", {
        name: "Purchase #301",
      })
    ).toBeInTheDocument();

    expect(attempts).toBe(2);
  });

  test("59. clears session after details HTTP 401", async () => {
    installPurchaseApi();

    mockDetailsError(301, {
      status: 401,
      message: "Session expired.",
    });

    await loadPurchases();

    openPurchase(301);

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

  test("60. closing a pending details request does not reopen the modal", async () => {
    installPurchaseApi();

    let release;

    const pending = new Promise(
      (resolve) => {
        release = resolve;
      }
    );

    server.use(
      http.get(
        `${API_BASE}/sales/my-purchases/:saleId`,
        async () => {
          await pending;

          return HttpResponse.json({
            success: true,
            data: initialDetails()[301],
          });
        }
      )
    );

    await loadPurchases();

    openPurchase(301);

    await within(
      getDialog()
    ).findByText(
      "Loading medicine details..."
    );

    closePurchase();

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    await act(async () => {
      release();
    });

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    expect(
      purchaseRow(301)
    ).toBeInTheDocument();
  });
});

// ============================================
// 12. ROUTE PERMISSIONS
// ============================================

describe("My Purchases - Route Permissions", () => {
  test("61. allows Customer to view purchase history", async () => {
    const api = installPurchaseApi();

    renderPage({
      role: "Customer",
    });

    expect(
      await screen.findByRole("heading", {
        name: "My Purchases",
      })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        api.count("/sales/my-purchases")
      ).toBe(1);
    });

    expect(
      screen.getByTestId("auth-state")
    ).toHaveTextContent(
      "authenticated"
    );
  });

  test.each([
    "Admin",
    "Pharmacist",
  ])(
    "62. denies %s access to customer purchase history",
    async (role) => {
      const api = installPurchaseApi();

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

  test("63. redirects unauthenticated users to login", async () => {
    const api = installPurchaseApi();

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
