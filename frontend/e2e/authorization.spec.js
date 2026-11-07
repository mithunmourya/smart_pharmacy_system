
import { test, expect } from "@playwright/test";

// ============================================
// E2E TEST ACCOUNTS
// ============================================

const accounts = {
  Admin: {
    email: process.env.E2E_ADMIN_EMAIL,
    password: process.env.E2E_ADMIN_PASSWORD,
  },

  Pharmacist: {
    email: process.env.E2E_PHARMACIST_EMAIL,
    password: process.env.E2E_PHARMACIST_PASSWORD,
  },

  Customer: {
    email: process.env.E2E_CUSTOMER_EMAIL,
    password: process.env.E2E_CUSTOMER_PASSWORD,
  },
};

const roles = ["Admin", "Pharmacist", "Customer"];

// ============================================
// ROUTE PERMISSION MATRIX
// Based on App.jsx
// ============================================

const pages = [
  {
    path: "/dashboard",
    heading: "Dashboard",
    roles,
  },
  {
    path: "/profile",
    heading: "My Profile",
    roles,
  },
  {
    path: "/settings/change-password",
    heading: "Change Password",
    roles,
  },
  {
    path: "/users",
    heading: "Users",
    roles: ["Admin"],
  },
  {
    path: "/manufacturers",
    heading: "Manufacturers",
    roles: ["Admin"],
  },
  {
    path: "/medicines",
    heading: "Medicines",
    roles: ["Admin"],
  },
  {
    path: "/batches",
    heading: "Batches",
    roles: ["Admin"],
  },
  {
    path: "/sales",
    heading: "Sales History",
    roles: ["Admin"],
  },
  {
    path: "/inventory",
    heading: "Available Inventory",
    roles: ["Admin", "Pharmacist"],
  },
  {
    path: "/low-stock",
    heading: "Low Stock",
    roles: ["Admin", "Pharmacist"],
  },
  {
    path: "/sales/new",
    heading: "New Sale",
    roles: ["Pharmacist"],
  },
  {
    path: "/my-purchases",
    heading: "My Purchases",
    roles: ["Customer"],
  },
];

// ============================================
// REUSABLE HELPERS
// ============================================

function requireCredentials(role) {
  const account = accounts[role];

  test.skip(
    !account?.email || !account?.password,
    `Missing E2E ${role} credentials`
  );

  return account;
}

async function loginAs(page, role) {
  const account = requireCredentials(role);

  await page.goto("/login");

  await page
    .getByLabel("Email address")
    .fill(account.email);

  await page
    .getByLabel("Password", { exact: true })
    .fill(account.password);

  const [response] = await Promise.all([
    page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname === "/users/login" &&
        res.request().method() === "POST"
    ),

    page
      .getByRole("button", { name: "Sign In" })
      .click(),
  ]);

  expect(
    response.status(),
    `${role} login failed`
  ).toBe(200);

  await expect(page).toHaveURL(/\/dashboard$/);

  await expect(
    page
      .getByRole("banner")
      .getByText(`${role} workspace`)
  ).toBeVisible();
}

// Navigate without reloading the React app.
//
// IMPORTANT:
// Your AuthProvider stores login in React memory.
// page.goto() would reset the session.
//
// This triggers a client-side history navigation.
async function navigateInApp(page, path) {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, "", nextPath);

    window.dispatchEvent(
      new PopStateEvent("popstate", {
        state: window.history.state,
      })
    );
  }, path);
}

// ============================================
// SECTION 1 — ROLE-BASED PAGE PERMISSIONS
// 36 TESTS
// ============================================

for (const role of roles) {
  test.describe(`${role} - Page Permissions`, () => {
    for (const item of pages) {
      const allowed = item.roles.includes(role);

      test(
        `${allowed ? "ALLOWS" : "DENIES"} ${item.path}`,
        async ({ page }) => {
          await loginAs(page, role);

          await navigateInApp(page, item.path);

          if (allowed) {
            // Authorized user remains on page
            await expect(page).toHaveURL(
              new RegExp(`${item.path}$`)
            );

            // Expected page is displayed
            await expect(
              page.getByRole("heading", {
                name: item.heading,
                exact: true,
                level: 1,
              })
            ).toBeVisible();
          } else {
            // Unauthorized user is redirected
            await expect(page).toHaveURL(
              /\/forbidden$/
            );

            await expect(
              page.getByRole("heading", {
                name: "Access denied",
              })
            ).toBeVisible();

            await expect(
              page.getByText(
                "Your account does not have permission to view this page."
              )
            ).toBeVisible();
          }
        }
      );
    }
  });
}

// ============================================
// SECTION 2 — SIDEBAR AUTHORIZATION
// 3 TESTS
// ============================================

test.describe("Role-specific Sidebar", () => {
  test(
    "Admin sees management and inventory links",
    async ({ page }) => {
      await loginAs(page, "Admin");

      const nav = page
        .getByRole("complementary", {
          name: "Sidebar",
        })
        .getByRole("navigation", {
          name: "Main navigation",
        });

      await expect(
        nav.getByRole("link", { name: "Users" })
      ).toBeVisible();

      await expect(
        nav.getByRole("link", {
          name: "Sales History",
        })
      ).toBeVisible();

      // Expand the Admin inventory menu
      await nav
        .getByRole("button", { name: "Inventory" })
        .click();

      const adminInventoryLinks = [
        "Manufacturers",
        "Medicines",
        "Batches",
        "Available Inventory",
        "Low Stock",
      ];

      for (const name of adminInventoryLinks) {
        await expect(
          nav.getByRole("link", {
            name,
            exact: true,
          })
        ).toBeVisible();
      }

      // Admin does not get Pharmacist-only page
      await expect(
        nav.getByRole("link", {
          name: "New Sale",
        })
      ).toHaveCount(0);

      // Admin does not get Customer-only page
      await expect(
        nav.getByRole("link", {
          name: "My Purchases",
        })
      ).toHaveCount(0);
    }
  );

  test(
    "Pharmacist sees only permitted navigation",
    async ({ page }) => {
      await loginAs(page, "Pharmacist");

      const nav = page
        .getByRole("complementary", {
          name: "Sidebar",
        })
        .getByRole("navigation", {
          name: "Main navigation",
        });

      const visibleLinks = [
        "New Sale",
        "Available Inventory",
        "Low Stock",
      ];

      for (const name of visibleLinks) {
        await expect(
          nav.getByRole("link", {
            name,
            exact: true,
          })
        ).toBeVisible();
      }

      const hiddenLinks = [
        "Users",
        "Sales History",
        "Manufacturers",
        "Medicines",
        "Batches",
        "My Purchases",
      ];

      for (const name of hiddenLinks) {
        await expect(
          nav.getByRole("link", {
            name,
            exact: true,
          })
        ).toHaveCount(0);
      }
    }
  );

  test(
    "Customer sees only permitted navigation",
    async ({ page }) => {
      await loginAs(page, "Customer");

      const nav = page
        .getByRole("complementary", {
          name: "Sidebar",
        })
        .getByRole("navigation", {
          name: "Main navigation",
        });

      await expect(
        nav.getByRole("link", {
          name: "Dashboard",
        })
      ).toBeVisible();

      await expect(
        nav.getByRole("link", {
          name: "My Purchases",
        })
      ).toBeVisible();

      const hiddenLinks = [
        "Users",
        "Sales History",
        "New Sale",
        "Available Inventory",
        "Low Stock",
      ];

      for (const name of hiddenLinks) {
        await expect(
          nav.getByRole("link", {
            name,
            exact: true,
          })
        ).toHaveCount(0);
      }

      await expect(
        nav.getByRole("button", {
          name: "Inventory",
        })
      ).toHaveCount(0);
    }
  );
});

// ============================================
// SECTION 3 — AUTHENTICATED REDIRECTS
// 9 TESTS
// ============================================

for (const role of roles) {
  test.describe(
    `${role} - Navigation Redirects`,
    () => {
      test(
        "Logged-in user cannot return to login",
        async ({ page }) => {
          await loginAs(page, role);

          await navigateInApp(page, "/login");

          await expect(page).toHaveURL(
            /\/dashboard$/
          );

          await expect(
            page.getByRole("heading", {
              name: "Dashboard",
              level: 1,
            })
          ).toBeVisible();
        }
      );

      test(
        "Unknown URL redirects to dashboard",
        async ({ page }) => {
          await loginAs(page, role);

          await navigateInApp(
            page,
            "/does-not-exist-e2e"
          );

          await expect(page).toHaveURL(
            /\/dashboard$/
          );
        }
      );

      test(
        "Return to dashboard works on forbidden page",
        async ({ page }) => {
          await loginAs(page, role);

          await navigateInApp(
            page,
            "/forbidden"
          );

          await expect(
            page.getByRole("heading", {
              name: "Access denied",
            })
          ).toBeVisible();

          await page
            .getByRole("link", {
              name: "Return to dashboard",
            })
            .click();

          await expect(page).toHaveURL(
            /\/dashboard$/
          );

          await expect(
            page.getByRole("heading", {
              name: "Dashboard",
              level: 1,
            })
          ).toBeVisible();
        }
      );
    }
  );
}

// ============================================
// SECTION 4 — GUEST REDIRECTS
// 3 TESTS
// ============================================

test.describe("Guest Authorization", () => {
  const guestRoutes = [
    "/",
    "/forbidden",
    "/does-not-exist-e2e",
  ];

  for (const path of guestRoutes) {
    test(
      `Guest visiting ${path} redirects to login`,
      async ({ page }) => {
        await page.goto(path);

        await expect(page).toHaveURL(
          /\/login$/
        );

        await expect(
          page.getByRole("heading", {
            name: "Sign in to your account",
          })
        ).toBeVisible();
      }
    );
  }
});

// ============================================
// SECTION 5 — BACKEND JWT AUTHORIZATION
// 8 TESTS
// ============================================

// Backend uses routes without /api prefix.
const apiBase = (
  process.env.E2E_API_BASE_URL ||
  "http://127.0.0.1:5000"
).replace(/\/+$/, "");

// Login through real backend and receive JWT
async function getJwt(request, role) {
  const account = requireCredentials(role);

  const response = await request.post(
    `${apiBase}/users/login`,
    {
      data: {
        email: account.email,
        password: account.password,
      },
    }
  );

  expect(
    response.status(),
    `${role} API login failed`
  ).toBe(200);

  const result = await response.json();

  const token = result.data?.token;

  expect(typeof token).toBe("string");

  return token;
}

test.describe("Backend Role Protection", () => {
  test(
    "Missing JWT returns 401 for protected APIs",
    async ({ request }) => {
      const paths = ["/users", "/sales"];

      for (const path of paths) {
        const response = await request.get(
          `${apiBase}${path}`
        );

        expect(
          response.status(),
          `${path} should require authentication`
        ).toBe(401);
      }
    }
  );

  test(
    "Invalid JWT returns HTTP 401",
    async ({ request }) => {
      const response = await request.get(
        `${apiBase}/users`,
        {
          headers: {
            Authorization:
              "Bearer invalid.e2e.token",
          },
        }
      );

      expect(response.status()).toBe(401);
    }
  );

  // Test /users API for all roles
  for (const role of roles) {
    test(
      `${role} permissions for GET /users`,
      async ({ request }) => {
        const token = await getJwt(request, role);

        const response = await request.get(
          `${apiBase}/users`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (role === "Admin") {
          expect(response.status()).toBe(200);
        } else {
          expect(response.status()).toBe(403);
        }
      }
    );
  }

  // Test /sales API for all roles
  for (const role of roles) {
    test(
      `${role} permissions for GET /sales`,
      async ({ request }) => {
        const token = await getJwt(request, role);

        const response = await request.get(
          `${apiBase}/sales`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (role === "Admin") {
          // Empty database may return 404
          expect([200, 404]).toContain(
            response.status()
          );
        } else {
          // Pharmacist / Customer forbidden
          expect(response.status()).toBe(403);
        }
      }
    );
  }
});
