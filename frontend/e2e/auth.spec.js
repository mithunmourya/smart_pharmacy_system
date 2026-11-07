
import { test, expect } from "@playwright/test";

// Credentials loaded from .env.playwright
const accounts = [
  {
    role: "Admin",
    email: process.env.E2E_ADMIN_EMAIL,
    password: process.env.E2E_ADMIN_PASSWORD,
  },
  {
    role: "Pharmacist",
    email: process.env.E2E_PHARMACIST_EMAIL,
    password: process.env.E2E_PHARMACIST_PASSWORD,
  },
  {
    role: "Customer",
    email: process.env.E2E_CUSTOMER_EMAIL,
    password: process.env.E2E_CUSTOMER_PASSWORD,
  },
];

// ============================================
// REUSABLE HELPERS
// ============================================

const loginResponse = (response) =>
  new URL(response.url()).pathname === "/users/login" &&
  response.request().method() === "POST";

async function submitLogin(page, email, password) {
  await page.getByLabel("Email address").fill(email);

  await page
    .getByLabel("Password", { exact: true })
    .fill(password);

  const [response] = await Promise.all([
    page.waitForResponse(loginResponse),

    page.getByRole("button", {
      name: "Sign In",
    }).click(),
  ]);

  return response;
}

async function loginAs(page, account) {
  await page.goto("/login");

  const response = await submitLogin(
    page,
    account.email,
    account.password
  );

  expect(
    response.status(),
    `${account.role} login HTTP status`
  ).toBe(200);

  await expect(page).toHaveURL(/\/dashboard$/);

  await expect(
  page
    .getByRole("banner")
    .getByText(`${account.role} workspace`)
).toBeVisible();
}

// ============================================
// SECTION 1 — LOGIN FORM
// 8 TESTS
// ============================================

test.describe("Authentication - Login Form", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("1. Login page displays correctly", async ({ page }) => {
    await expect(
      page.getByRole("heading", {
        name: "Sign in to your account",
      })
    ).toBeVisible();

    await expect(
      page.getByLabel("Email address")
    ).toBeVisible();

    await expect(
      page.getByLabel("Password", { exact: true })
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Sign In" })
    ).toBeEnabled();
  });

  test("2. Password is hidden initially", async ({ page }) => {
    await expect(
      page.getByLabel("Password", { exact: true })
    ).toHaveAttribute("type", "password");
  });

  test("3. Show and hide password works", async ({ page }) => {
    const password = page.getByLabel("Password", {
      exact: true,
    });

    await password.fill("ExamplePassword123!");

    await page.getByRole("button", {
      name: "Show password",
    }).click();

    await expect(password).toHaveAttribute(
      "type",
      "text"
    );

    await expect(password).toHaveValue(
      "ExamplePassword123!"
    );

    await page.getByRole("button", {
      name: "Hide password",
    }).click();

    await expect(password).toHaveAttribute(
      "type",
      "password"
    );
  });

  test("4. Empty form shows validation errors", async ({ page }) => {
    let loginRequests = 0;

    page.on("request", (request) => {
      if (
        new URL(request.url()).pathname === "/users/login" &&
        request.method() === "POST"
      ) {
        loginRequests++;
      }
    });

    await page.getByRole("button", {
      name: "Sign In",
    }).click();

    await expect(
      page.getByText("Enter your email address.")
    ).toBeVisible();

    await expect(
      page.getByText("Enter your password.")
    ).toBeVisible();

    await expect(
      page.getByLabel("Email address")
    ).toBeFocused();

    await expect(page).toHaveURL(/\/login$/);

    expect(loginRequests).toBe(0);
  });

  test("5. Email is required", async ({ page }) => {
    await page
      .getByLabel("Password", { exact: true })
      .fill("ExamplePassword123!");

    await page.getByRole("button", {
      name: "Sign In",
    }).click();

    await expect(
      page.getByText("Enter your email address.")
    ).toBeVisible();

    await expect(
      page.getByText("Enter your password.")
    ).toHaveCount(0);
  });

  test("6. Password is required", async ({ page }) => {
    await page
      .getByLabel("Email address")
      .fill("valid@example.com");

    await page.getByRole("button", {
      name: "Sign In",
    }).click();

    await expect(
      page.getByText("Enter your password.")
    ).toBeVisible();

    await expect(
      page.getByText("Enter your email address.")
    ).toHaveCount(0);

    await expect(
      page.getByLabel("Password", { exact: true })
    ).toBeFocused();
  });

  test("7. Invalid email format is rejected", async ({ page }) => {
    let loginRequests = 0;

    page.on("request", (request) => {
      if (
        new URL(request.url()).pathname === "/users/login" &&
        request.method() === "POST"
      ) {
        loginRequests++;
      }
    });

    await page
      .getByLabel("Email address")
      .fill("not-an-email");

    await page
      .getByLabel("Password", { exact: true })
      .fill("ExamplePassword123!");

    await page.getByRole("button", {
      name: "Sign In",
    }).click();

    await expect(
      page.getByText("Enter a valid email address.")
    ).toBeVisible();

    expect(loginRequests).toBe(0);
  });

  test("8. Editing a field clears its validation error", async ({ page }) => {
    await page.getByRole("button", {
      name: "Sign In",
    }).click();

    await expect(
      page.getByText("Enter your email address.")
    ).toBeVisible();

    await page
      .getByLabel("Email address")
      .fill("valid@example.com");

    await expect(
      page.getByText("Enter your email address.")
    ).toHaveCount(0);

    await expect(
      page.getByText("Enter your password.")
    ).toBeVisible();
  });
});

// ============================================
// SECTION 2 — FAILED LOGIN
// 7 TESTS
// ============================================

test.describe("Authentication - Failed Login", () => {
  test("9. Unregistered email returns HTTP 401", async ({ page }) => {
    await page.goto("/login");

    const response = await submitLogin(
      page,
      "not-registered-e2e@example.invalid",
      "DefinitelyWrongPassword123!"
    );

    expect(response.status()).toBe(401);

    await expect(
      page.getByRole("alert")
    ).toBeVisible();

    await expect(page).toHaveURL(/\/login$/);
  });

  test("10. Pressing Enter submits the form", async ({ page }) => {
    await page.goto("/login");

    await page
      .getByLabel("Email address")
      .fill("not-registered-e2e@example.invalid");

    await page
      .getByLabel("Password", { exact: true })
      .fill("WrongPassword123!");

    const [response] = await Promise.all([
      page.waitForResponse(loginResponse),

      page
        .getByLabel("Password", { exact: true })
        .press("Enter"),
    ]);

    expect(response.status()).toBe(401);

    await expect(
      page.getByRole("alert")
    ).toBeVisible();
  });

  test("11. Wrong Admin password returns HTTP 401", async ({ page }) => {
    const admin = accounts[0];

    test.skip(
      !admin.email || !admin.password,
      "Admin credentials missing"
    );

    await page.goto("/login");

    const response = await submitLogin(
      page,
      admin.email,
      "DefinitelyWrongPassword123!"
    );

    expect(response.status()).toBe(401);

    await expect(
      page.getByRole("alert")
    ).toBeVisible();

    await expect(page).toHaveURL(/\/login$/);
  });

  test("12. Failed login cannot access dashboard", async ({ page }) => {
    await page.goto("/login");

    const response = await submitLogin(
      page,
      "not-registered-e2e@example.invalid",
      "DefinitelyWrongPassword123!"
    );

    expect(response.status()).toBe(401);

    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login$/);
  });

  test("13. Changing input clears API error", async ({ page }) => {
    await page.goto("/login");

    await submitLogin(
      page,
      "not-registered-e2e@example.invalid",
      "WrongPassword123!"
    );

    await expect(
      page.getByRole("alert")
    ).toBeVisible();

    await page
      .getByLabel("Email address")
      .fill("new-address@example.com");

    await expect(
      page.getByRole("alert")
    ).toHaveCount(0);
  });

  test("14. Network failure displays connection error", async ({
    page,
    context,
  }) => {
    await page.goto("/login");

    await page
      .getByLabel("Email address")
      .fill("valid@example.com");

    await page
      .getByLabel("Password", { exact: true })
      .fill("ExamplePassword123!");

    await context.setOffline(true);

    try {
      await page.getByRole("button", {
        name: "Sign In",
      }).click();

      await expect(
        page.getByRole("alert")
      ).toContainText(
        "Unable to connect to the server."
      );

      await expect(page).toHaveURL(/\/login$/);
    } finally {
      await context.setOffline(false);
    }
  });

  test("15. Inactive user cannot login", async ({ page }) => {
    const email = process.env.E2E_INACTIVE_EMAIL;
    const password = process.env.E2E_INACTIVE_PASSWORD;

    test.skip(
      !email || !password,
      "Create an inactive E2E account and configure its credentials"
    );

    await page.goto("/login");

    const response = await submitLogin(
      page,
      email,
      password
    );

    expect(response.status()).toBe(409);

    await expect(
      page.getByRole("alert")
    ).toBeVisible();

    await expect(page).toHaveURL(/\/login$/);
  });
});

// ============================================
// SECTION 3 — SUCCESSFUL LOGIN
// 7 TESTS
// ============================================

test.describe("Authentication - Successful Login", () => {
  // TESTS 16, 17, 18 — All three roles
  for (const account of accounts) {
    test(`${account.role} can login and logout`, async ({ page }) => {
      test.skip(
        !account.email || !account.password,
        `${account.role} E2E credentials missing`
      );

      await loginAs(page, account);

      await page.getByRole("button", {
        name: "Sign Out",
      }).click();

      await expect(page).toHaveURL(/\/login$/);
    });
  }

  test("19. Admin can open My Profile", async ({ page }) => {
    const admin = accounts[0];

    test.skip(
      !admin.email || !admin.password,
      "Admin credentials missing"
    );

    await loginAs(page, admin);

    await page.getByRole("link", {
      name: /Open my profile:/,
    }).click();

    await expect(page).toHaveURL(/\/profile$/);

    await expect(
      page.getByRole("heading", {
        name: "My Profile",
      })
    ).toBeVisible();
  });

  test("20. Logout prevents access to protected routes", async ({
    page,
  }) => {
    const admin = accounts[0];

    test.skip(
      !admin.email || !admin.password,
      "Admin credentials missing"
    );

    await loginAs(page, admin);

    await page.getByRole("button", {
      name: "Sign Out",
    }).click();

    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/users");

    await expect(page).toHaveURL(/\/login$/);
  });

  test("21. Refreshing dashboard clears in-memory session", async ({
    page,
  }) => {
    const admin = accounts[0];

    test.skip(
      !admin.email || !admin.password,
      "Admin credentials missing"
    );

    await loginAs(page, admin);

    await page.reload();

    await expect(page).toHaveURL(/\/login$/);
  });

  test("22. New browser tab has no in-memory session", async ({
    page,
    context,
  }) => {
    const admin = accounts[0];

    test.skip(
      !admin.email || !admin.password,
      "Admin credentials missing"
    );

    await loginAs(page, admin);

    const freshTab = await context.newPage();

    await freshTab.goto("/dashboard");

    await expect(freshTab).toHaveURL(/\/login$/);

    await freshTab.close();
  });
});

// ============================================
// SECTION 4 — GUEST ROUTE PROTECTION
// 12 TESTS
// ============================================

test.describe("Authentication - Protected Routes", () => {
  const protectedRoutes = [
    "/dashboard",
    "/users",
    "/manufacturers",
    "/medicines",
    "/batches",
    "/inventory",
    "/low-stock",
    "/sales",
    "/sales/new",
    "/my-purchases",
    "/profile",
    "/settings/change-password",
  ];

  for (const path of protectedRoutes) {
    test(`Guest cannot access ${path}`, async ({ page }) => {
      await page.goto(path);

      await expect(page).toHaveURL(/\/login$/);

      await expect(
        page.getByRole("heading", {
          name: "Sign in to your account",
        })
      ).toBeVisible();
    });
  }
});
