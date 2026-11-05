
import { test, expect } from "@playwright/test";

test.describe("Smart Pharmacy - Authentication E2E", () => {
  // ========================================
  // TEST 1: ACCESSING LOGIN
  // ========================================

  test("1. opens the real login page", async ({ page }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("heading", {
        name: "Sign in to your account",
      })
    ).toBeVisible();

    await expect(
      page.getByLabel("Email address")
    ).toBeVisible();

    await expect(
      page.getByLabel("Password", {
        exact: true,
      })
    ).toBeVisible();

    await expect(
      page.getByRole("button", {
        name: "Sign In",
      })
    ).toBeEnabled();
  });

  // ========================================
  // TEST 2: FORM VALIDATION
  // ========================================

  test("2. prevents login with empty fields", async ({ page }) => {
    await page.goto("/login");

    await page.getByRole("button", {
      name: "Sign In",
    }).click();

    await expect(
      page.getByText(
        "Enter your email address."
      )
    ).toBeVisible();

    await expect(
      page.getByText(
        "Enter your password."
      )
    ).toBeVisible();

    await expect(page).toHaveURL(/\/login$/);
  });

  // ========================================
  // TEST 3: PROTECTED ROUTE
  // ========================================

  test("3. redirects guests away from Admin pages", async ({ page }) => {
    await page.goto("/users");

    await expect(page).toHaveURL(/\/login$/);

    await expect(
      page.getByRole("heading", {
        name: "Sign in to your account",
      })
    ).toBeVisible();
  });

  // ========================================
  // TEST 4: REAL LOGIN AND LOGOUT
  // ========================================

  test("4. logs in with a real Admin account and signs out", async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;

    test.skip(
      !email || !password,
      "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run this test."
    );

    await page.goto("/login");

    await page.getByLabel(
      "Email address"
    ).fill(email);

    await page.getByLabel(
      "Password",
      { exact: true }
    ).fill(password);

    await page.getByRole("button", {
      name: "Sign In",
    }).click();

    // Verify real login and navigation.
    await expect(page).toHaveURL(
      /\/dashboard$/
    );

    await expect(
      page.getByText(
        "Admin workspace"
      )
    ).toBeVisible();

    // Navigate to a real protected page.
    await page.goto("/users");

    await expect(
      page.getByRole("heading", {
        name: "Users",
      })
    ).toBeVisible();

    // Log out.
    await page.getByRole("button", {
      name: "Sign Out",
    }).click();

    await expect(page).toHaveURL(
      /\/login$/
    );

    // Verify protected routes are blocked
    // after logging out.
    await page.goto("/users");

    await expect(page).toHaveURL(
      /\/login$/
    );
  });
});
