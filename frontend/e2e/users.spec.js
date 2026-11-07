
import { test, expect } from "@playwright/test";

// ============================================
// CONFIGURATION AND TEST DATA
// ============================================

const API = (
  process.env.E2E_API_BASE_URL ||
  "http://127.0.0.1:5000"
).replace(/\/+$/, "");

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL,
  password: process.env.E2E_ADMIN_PASSWORD,
};

const TEST_PASSWORD =
  process.env.E2E_TEST_USER_PASSWORD || "E2eUsers!2026";

let nextId = 0;

function newUser(role = "Customer") {
  const tag = `${process.pid}-${Date.now()}-${++nextId}`;

  return {
    name: `E2E Users ${tag}`,
    email: `e2e-users-${tag}@example.invalid`,
    password: TEST_PASSWORD,
    role,
  };
}

function rowFor(page, email) {
  return page
    .locator("tbody tr")
    .filter({ hasText: email });
}

function dialog(page, name) {
  return page.getByRole("dialog", { name });
}

// ============================================
// REUSABLE LOGIN AND NAVIGATION
// ============================================

async function loginAndOpenUsers(page) {
  expect(
    ADMIN.email && ADMIN.password,
    "Configure E2E Admin credentials"
  ).toBeTruthy();

  await page.goto("/login");

  await page
    .getByLabel("Email address")
    .fill(ADMIN.email);

  await page
    .getByLabel("Password", { exact: true })
    .fill(ADMIN.password);

  const [loginResponse] = await Promise.all([
    page.waitForResponse(
      res =>
        new URL(res.url()).pathname === "/users/login" &&
        res.request().method() === "POST"
    ),

    page.getByRole("button", {
      name: "Sign In",
    }).click(),
  ]);

  expect(loginResponse.status()).toBe(200);

  await expect(page).toHaveURL(/\/dashboard$/);

  // Use React Router navigation.
  // page.goto("/users") would clear in-memory login.

  const [usersResponse] = await Promise.all([
    page.waitForResponse(
      res =>
        new URL(res.url()).pathname === "/users" &&
        res.request().method() === "GET"
    ),

    page
      .getByRole("complementary", { name: "Sidebar" })
      .getByRole("link", {
        name: "Users",
        exact: true,
      })
      .click(),
  ]);

  await expect(page).toHaveURL(/\/users$/);

  await expect(
    page.getByRole("heading", {
      name: "Users",
      level: 1,
    })
  ).toBeVisible();

  return usersResponse;
}

// Seed disposable accounts through the real backend.
// They are never one of the original three users.

async function seedUser(request, role = "Customer") {
  const user = newUser(role);

  const response = await request.post(
    `${API}/users/register`,
    {
      data: user,
    }
  );

  expect(
    [200, 201],
    `Seed user failed: ${response.status()} ${await response.text()}`
  ).toContain(response.status());

  return user;
}

// ============================================
// REUSABLE MODAL HELPERS
// ============================================

async function openCreate(page) {
  await page.getByRole("button", {
    name: "Create User",
    exact: true,
  }).click();

  const modal = dialog(page, "Create user");

  await expect(modal).toBeVisible();

  return modal;
}

async function fillCreate(modal, user) {
  await modal.getByLabel("Full name").fill(user.name);

  await modal
    .getByLabel("Email address")
    .fill(user.email);

  await modal
    .getByLabel("Account role")
    .selectOption(user.role);

  await modal
    .getByLabel("Initial password")
    .fill(user.password);

  await modal
    .getByLabel("Confirm password")
    .fill(user.password);
}

async function deactivateThroughUI(page, user) {
  await rowFor(page, user.email)
    .getByRole("button", {
      name: `Deactivate ${user.name}`,
    })
    .click();

  const modal = dialog(page, "Deactivate account");

  await expect(modal).toBeVisible();

  await modal
    .getByRole("button", {
      name: "Deactivate",
      exact: true,
    })
    .click();

  await expect(modal).toHaveCount(0);

  await expect(
    rowFor(page, user.email).getByText("Inactive", {
      exact: true,
    })
  ).toBeVisible();
}

// ============================================
// SECTION 1 â€” USER LIST, SEARCH, FILTER, SORT
// TESTS 1â€“16
// ============================================

test.describe("Users - List, Search, Filters, Sorting", () => {

  test("1. Admin can load all three original users", async ({ page }) => {
    const response = await loginAndOpenUsers(page);

    expect(response.status()).toBe(200);

    for (const key of [
      "E2E_ADMIN_EMAIL",
      "E2E_PHARMACIST_EMAIL",
      "E2E_CUSTOMER_EMAIL",
    ]) {
      const email = process.env[key];

      expect(email, `${key} missing`).toBeTruthy();

      await expect(
        rowFor(page, email)
      ).toBeVisible();
    }
  });

  test("2. Reload users fetches data again", async ({ page }) => {
    await loginAndOpenUsers(page);

    const [response] = await Promise.all([
      page.waitForResponse(
        res =>
          new URL(res.url()).pathname === "/users" &&
          res.request().method() === "GET"
      ),

      page.getByRole("button", {
        name: "Reload users",
      }).click(),
    ]);

    expect(response.status()).toBe(200);

    await expect(
      rowFor(page, ADMIN.email)
    ).toBeVisible();
  });

  test("3. Search user by name", async ({ page, request }) => {
    const user = await seedUser(request);

    await loginAndOpenUsers(page);

    await page
      .getByLabel("Search users")
      .fill(user.name);

    await expect(
      rowFor(page, user.email)
    ).toBeVisible();

    await expect(
      page.locator("tbody tr")
    ).toHaveCount(1);
  });

  test("4. Search user by email is case-insensitive", async ({ page }) => {
    await loginAndOpenUsers(page);

    await page
      .getByLabel("Search users")
      .fill(ADMIN.email.toUpperCase());

    await expect(
      rowFor(page, ADMIN.email)
    ).toBeVisible();

    await expect(
      page.locator("tbody tr")
    ).toHaveCount(1);
  });

  test("5. Search unknown user displays empty state", async ({ page }) => {
    await loginAndOpenUsers(page);

    await page
      .getByLabel("Search users")
      .fill("no-matching-e2e-user-zzzzzzz");

    await expect(
      page.getByRole("heading", {
        name: "No matching users",
      })
    ).toBeVisible();
  });

  test("6. Clear filters restores the user list", async ({ page }) => {
    await loginAndOpenUsers(page);

    await page
      .getByLabel("Search users")
      .fill("no-matching-e2e-user-zzzzzzz");

    await page
      .getByRole("button", {
        name: "Clear filters",
      })
      .last()
      .click();

    await expect(
      page.getByLabel("Search users")
    ).toHaveValue("");

    await expect(
      rowFor(page, ADMIN.email)
    ).toBeVisible();
  });

  // TESTS 7, 8, 9
  for (const role of [
    "Admin",
    "Pharmacist",
    "Customer",
  ]) {
    test(`Filter only ${role} users`, async ({ page }) => {
      await loginAndOpenUsers(page);

      await page
        .getByLabel("Role", { exact: true })
        .selectOption(role);

      const rows = page.locator("tbody tr");

      await expect(rows.first()).toBeVisible();

      const roles = await rows
        .locator("td:nth-child(3)")
        .allTextContents();

      expect(roles.length).toBeGreaterThan(0);

      expect(
        roles.every(value => value.trim() === role)
      ).toBe(true);
    });
  }

  test("10. Active filter excludes inactive users", async ({ page, request }) => {
    const user = await seedUser(request);

    await loginAndOpenUsers(page);

    await deactivateThroughUI(page, user);

    await page
      .getByLabel("Status", { exact: true })
      .selectOption("Active");

    await expect(
      rowFor(page, user.email)
    ).toHaveCount(0);

    await expect(
      rowFor(page, ADMIN.email)
    ).toBeVisible();
  });

  test("11. Inactive filter displays deactivated users", async ({ page, request }) => {
    const user = await seedUser(request);

    await loginAndOpenUsers(page);

    await deactivateThroughUI(page, user);

    await page
      .getByLabel("Status", { exact: true })
      .selectOption("Inactive");

    await expect(
      rowFor(page, user.email)
    ).toBeVisible();

    await expect(
      rowFor(page, ADMIN.email)
    ).toHaveCount(0);
  });

  test("12. Role and search filters work together", async ({ page, request }) => {
    const user = await seedUser(request, "Customer");

    await loginAndOpenUsers(page);

    await page
      .getByLabel("Role", { exact: true })
      .selectOption("Customer");

    await page
      .getByLabel("Search users")
      .fill(user.email);

    await expect(
      rowFor(page, user.email)
    ).toBeVisible();

    await expect(
      page.locator("tbody tr")
    ).toHaveCount(1);

    await page
      .getByLabel("Role", { exact: true })
      .selectOption("Admin");

    await expect(
      page.getByRole("heading", {
        name: "No matching users",
      })
    ).toBeVisible();
  });

  // TESTS 13â€“16
  for (const column of [
    "Name",
    "Email",
    "Role",
    "Created",
  ]) {
    test(`Sort ${column} ascending and descending`, async ({ page }) => {
      await loginAndOpenUsers(page);

      const heading = page.getByRole("columnheader", {
        name: new RegExp(column, "i"),
      });

      await heading.getByRole("button").click();

      await expect(heading).toHaveAttribute(
        "aria-sort",
        /ascending|descending/
      );

      const first = await heading.getAttribute("aria-sort");

      await heading.getByRole("button").click();

      const second = await heading.getAttribute("aria-sort");

      expect(second).not.toBe(first);
    });
  }
});

// ============================================
// SECTION 2 â€” CREATE USERS
// TESTS 17â€“28
// ============================================

test.describe("Users - Create User", () => {

  test("17. Create modal opens with default Customer role", async ({ page }) => {
    await loginAndOpenUsers(page);

    const modal = await openCreate(page);

    await expect(
      modal.getByLabel("Account role")
    ).toHaveValue("Customer");

    for (const role of [
      "Admin",
      "Pharmacist",
      "Customer",
    ]) {
      await expect(
        modal.getByRole("option", { name: role })
      ).toHaveCount(1);
    }
  });

  test("18. Cancel closes Create User modal", async ({ page }) => {
    await loginAndOpenUsers(page);

    const modal = await openCreate(page);

    await modal
      .getByRole("button", { name: "Cancel" })
      .click();

    await expect(modal).toHaveCount(0);
  });

  test("19. Close button closes Create User modal", async ({ page }) => {
    await loginAndOpenUsers(page);

    const modal = await openCreate(page);

    await modal
      .getByRole("button", {
        name: "Close create user dialog",
      })
      .click();

    await expect(modal).toHaveCount(0);
  });

  test("20. Escape closes Create User modal", async ({ page }) => {
    await loginAndOpenUsers(page);

    const modal = await openCreate(page);

    await page.keyboard.press("Escape");

    await expect(modal).toHaveCount(0);
  });

  test("21. Empty form displays required errors", async ({ page }) => {
    await loginAndOpenUsers(page);

    const modal = await openCreate(page);

    await modal
      .getByRole("button", { name: "Create User", exact: true })
      .click();

    for (const message of [
      "Enter the user's full name.",
      "Enter an email address.",
      "Enter an initial password.",
      "Confirm the password.",
    ]) {
      await expect(
        modal.getByText(message)
      ).toBeVisible();
    }

    await expect(modal).toBeVisible();
  });

  test("22. Invalid email is rejected", async ({ page }) => {
    await loginAndOpenUsers(page);

    const modal = await openCreate(page);

    await fillCreate(modal, newUser());

    await modal
      .getByLabel("Email address")
      .fill("not-an-email");

    await modal
      .getByRole("button", { name: "Create User", exact: true })
      .click();

    await expect(
      modal.getByText("Enter a valid email address.")
    ).toBeVisible();
  });

  test("23. Password mismatch is rejected", async ({ page }) => {
    await loginAndOpenUsers(page);

    const modal = await openCreate(page);

    await fillCreate(modal, newUser());

    await modal
      .getByLabel("Confirm password")
      .fill("DifferentPassword123!");

    await modal
      .getByRole("button", { name: "Create User", exact: true })
      .click();

    await expect(
      modal.getByText("Passwords do not match.")
    ).toBeVisible();
  });

  test("24. Show passwords checkbox works", async ({ page }) => {
    await loginAndOpenUsers(page);

    const modal = await openCreate(page);

    const password = modal.getByLabel("Initial password");
    const confirm = modal.getByLabel("Confirm password");

    await expect(password).toHaveAttribute(
      "type",
      "password"
    );

    await modal
      .getByRole("checkbox", { name: "Show passwords" })
      .check();

    await expect(password).toHaveAttribute(
      "type",
      "text"
    );

    await expect(confirm).toHaveAttribute(
      "type",
      "text"
    );

    await modal
      .getByRole("checkbox", { name: "Show passwords" })
      .uncheck();

    await expect(password).toHaveAttribute(
      "type",
      "password"
    );
  });

  test("25. Duplicate email shows server error", async ({ page }) => {
    await loginAndOpenUsers(page);

    const modal = await openCreate(page);

    await fillCreate(modal, {
      ...newUser(),
      email: ADMIN.email,
    });

    await modal
      .getByRole("button", { name: "Create User", exact: true })
      .click();

    await expect(
      modal.getByRole("alert")
    ).toBeVisible();

    await expect(modal).toBeVisible();
  });

  // TESTS 26, 27, 28
  for (const role of [
    "Admin",
    "Pharmacist",
    "Customer",
  ]) {
    test(`Create ${role} successfully`, async ({ page }) => {
      const user = newUser(role);

      await loginAndOpenUsers(page);

      const modal = await openCreate(page);

      await fillCreate(modal, user);

      const [response] = await Promise.all([
        page.waitForResponse(
          res =>
            new URL(res.url()).pathname === "/users/register" &&
            res.request().method() === "POST"
        ),

        modal
          .getByRole("button", { name: "Create User", exact: true })
          .click(),
      ]);

      expect([200, 201]).toContain(response.status());

      await expect(modal).toHaveCount(0);

      const row = rowFor(page, user.email);

      await expect(row).toBeVisible();

      await expect(
        row.locator("td").nth(2)
      ).toHaveText(role);

      await expect(
        row.getByText("Active", { exact: true })
      ).toBeVisible();
    });
  }
});

// ============================================
// SECTION 3 â€” EDIT USERS
// TESTS 29â€“34
// ============================================

test.describe("Users - Edit User", () => {

  async function openEdit(page, user) {
    await rowFor(page, user.email)
      .getByRole("button", {
        name: `Edit ${user.name}`,
      })
      .click();

    const modal = dialog(page, "Edit user");

    await expect(modal).toBeVisible();

    return modal;
  }

  test("29. Edit modal displays existing details", async ({ page, request }) => {
    const user = await seedUser(request, "Pharmacist");

    await loginAndOpenUsers(page);

    const modal = await openEdit(page, user);

    await expect(
      modal.getByLabel("Full name")
    ).toHaveValue(user.name);

    await expect(
      modal.getByLabel("Email address")
    ).toHaveValue(user.email);

    await expect(
      modal.getByText("Role changes are not available.")
    ).toBeVisible();

    await expect(
      modal.getByRole("button", {
        name: "Save Changes",
      })
    ).toBeDisabled();
  });

  test("30. Cancel discards edited changes", async ({ page, request }) => {
    const user = await seedUser(request);

    await loginAndOpenUsers(page);

    const modal = await openEdit(page, user);

    await modal
      .getByLabel("Full name")
      .fill("Should Not Be Saved");

    await modal
      .getByRole("button", { name: "Cancel" })
      .click();

    await expect(modal).toHaveCount(0);

    await expect(
      rowFor(page, user.email)
    ).toContainText(user.name);
  });

  test("31. Empty name is rejected", async ({ page, request }) => {
    const user = await seedUser(request);

    await loginAndOpenUsers(page);

    const modal = await openEdit(page, user);

    await modal
      .getByLabel("Full name")
      .fill("  ");

    await modal
      .getByRole("button", { name: "Save Changes" })
      .click();

    await expect(
      modal.getByText("Enter the user's full name.")
    ).toBeVisible();
  });

  test("32. Invalid updated email is rejected", async ({ page, request }) => {
    const user = await seedUser(request);

    await loginAndOpenUsers(page);

    const modal = await openEdit(page, user);

    await modal
      .getByLabel("Email address")
      .fill("invalid-email");

    await modal
      .getByRole("button", { name: "Save Changes" })
      .click();

    await expect(
      modal.getByText("Enter a valid email address.")
    ).toBeVisible();
  });

  test("33. Update user name and email successfully", async ({ page, request }) => {
    const user = await seedUser(request);

    await loginAndOpenUsers(page);

    const modal = await openEdit(page, user);

    const updatedName = `${user.name} Updated`;

    const updatedEmail = user.email.replace(
      "@",
      "-updated@"
    );

    await modal
      .getByLabel("Full name")
      .fill(updatedName);

    await modal
      .getByLabel("Email address")
      .fill(updatedEmail);

    await modal
      .getByRole("button", { name: "Save Changes" })
      .click();

    await expect(modal).toHaveCount(0);

    const row = rowFor(page, updatedEmail);

    await expect(row).toBeVisible();

    await expect(row).toContainText(updatedName);

    await expect(
      rowFor(page, user.email)
    ).toHaveCount(0);
  });

  test("34. Updating to duplicate email fails", async ({ page, request }) => {
    const user = await seedUser(request);

    await loginAndOpenUsers(page);

    const modal = await openEdit(page, user);

    await modal
      .getByLabel("Email address")
      .fill(ADMIN.email);

    await modal
      .getByRole("button", { name: "Save Changes" })
      .click();

    await expect(
      modal.getByRole("alert")
    ).toBeVisible();

    await expect(modal).toBeVisible();
  });
});

// ============================================
// SECTION 4 â€” DEACTIVATE / RESTORE
// TESTS 35â€“38
// ============================================

test.describe("Users - Account Status", () => {

  test("35. Admin cannot deactivate own account", async ({ page }) => {
    await loginAndOpenUsers(page);

    const row = rowFor(page, ADMIN.email);

    await expect(row).toBeVisible();

    await expect(
      row.getByRole("button", {
        name: /Deactivate/i,
      })
    ).toHaveCount(0);

    await expect(
      row.getByText("You", { exact: true })
    ).toBeVisible();
  });

  test("36. Cancel deactivation keeps account active", async ({ page, request }) => {
    const user = await seedUser(request);

    await loginAndOpenUsers(page);

    await rowFor(page, user.email)
      .getByRole("button", {
        name: `Deactivate ${user.name}`,
      })
      .click();

    const modal = dialog(page, "Deactivate account");

    await modal
      .getByRole("button", { name: "Cancel" })
      .click();

    await expect(modal).toHaveCount(0);

    await expect(
      rowFor(page, user.email).getByText("Active", {
        exact: true,
      })
    ).toBeVisible();
  });

  test("37. Deactivation disables editing", async ({ page, request }) => {
    const user = await seedUser(request);

    await loginAndOpenUsers(page);

    await deactivateThroughUI(page, user);

    const row = rowFor(page, user.email);

    await expect(
      row.getByRole("button", {
        name: `Edit ${user.name}`,
      })
    ).toBeDisabled();

    await expect(
      row.getByText("Restore before editing.")
    ).toBeVisible();

    await expect(
      row.getByRole("button", {
        name: `Restore ${user.name}`,
      })
    ).toBeVisible();
  });

  test("38. Restore deactivated account", async ({ page, request }) => {
    const user = await seedUser(request);

    await loginAndOpenUsers(page);

    await deactivateThroughUI(page, user);

    await rowFor(page, user.email)
      .getByRole("button", {
        name: `Restore ${user.name}`,
      })
      .click();

    const modal = dialog(page, "Restore account");

    await modal
      .getByRole("button", {
        name: "Restore",
        exact: true,
      })
      .click();

    await expect(modal).toHaveCount(0);

    await expect(
      rowFor(page, user.email).getByText("Active", {
        exact: true,
      })
    ).toBeVisible();

    await expect(
      rowFor(page, user.email).getByRole("button", {
        name: `Edit ${user.name}`,
      })
    ).toBeEnabled();
  });
});

// ============================================
// SECTION 5 â€” API ERRORS AND RECOVERY
// TESTS 39â€“40
// ============================================

test.describe("Users - API Errors", () => {

  test("39. Server error displays error message", async ({ page }) => {
    await page.route(`${API}/users`, async route => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: "E2E simulated server error",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await loginAndOpenUsers(page);

    await expect(
      page.getByText("E2E simulated server error")
    ).toBeVisible();
  });

  test("40. Reload recovers after server error", async ({ page }) => {
    await page.route(`${API}/users`, async route => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: "E2E simulated server error",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await loginAndOpenUsers(page);

    await expect(
      page.getByText("E2E simulated server error")
    ).toBeVisible();

    await page.unroute(`${API}/users`);

    const [response] = await Promise.all([
      page.waitForResponse(
        res =>
          new URL(res.url()).pathname === "/users" &&
          res.request().method() === "GET"
      ),

      page.getByRole("button", {
        name: "Reload users",
      }).click(),
    ]);

    expect(response.status()).toBe(200);

    await expect(
      rowFor(page, ADMIN.email)
    ).toBeVisible();
  });
});

