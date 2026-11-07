
import { test, expect } from "@playwright/test";

// ============================================
// CONFIGURATION
// ============================================

const API = (
  process.env.E2E_API_BASE_URL ||
  "http://127.0.0.1:5000"
).replace(/\/+$/, "");

const USERS = {
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

let serial = 0;

const makeName = () =>
  `E2E MF ${process.pid} ${Date.now().toString(36)} ${++serial}`;

const rowFor = (page, name) =>
  page.locator("tbody tr").filter({ hasText: name });

const modal = (page, title) =>
  page.getByRole("dialog", { name: title, exact: true });

const action = (dialog, label) =>
  dialog.getByRole("button", {
    name: label,
    exact: true,
  });

const isManufacturersResponse = (res, method = "GET") =>
  new URL(res.url()).pathname === "/manufacturers" &&
  res.request().method() === method;

// ============================================
// REUSABLE API HELPERS
// ============================================

async function tokenFor(request, role = "Admin") {
  const account = USERS[role];

  expect(
    account.email && account.password,
    `${role} credentials missing`
  ).toBeTruthy();

  const response = await request.post(`${API}/users/login`, {
    data: account,
  });

  expect(response.status()).toBe(200);

  const token = (await response.json()).data?.token;

  expect(token).toBeTruthy();

  return token;
}

async function seedManufacturer(request, name = makeName()) {
  const token = await tokenFor(request);

  const response = await request.post(
    `${API}/manufacturers`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: { name },
    }
  );

  expect(
    [200, 201],
    await response.text()
  ).toContain(response.status());

  return name;
}

// ============================================
// LOGIN AND NAVIGATION
// ============================================

async function loginAndOpen(page) {
  const account = USERS.Admin;

  expect(
    account.email && account.password,
    "Admin credentials missing"
  ).toBeTruthy();

  await page.goto("/login");

  await page
    .getByLabel("Email address")
    .fill(account.email);

  await page
    .getByLabel("Password", { exact: true })
    .fill(account.password);

  const [login] = await Promise.all([
    page.waitForResponse(
      res =>
        new URL(res.url()).pathname === "/users/login" &&
        res.request().method() === "POST"
    ),
    page.getByRole("button", {
      name: "Sign In",
      exact: true,
    }).click(),
  ]);

  expect(login.status()).toBe(200);

  await expect(page).toHaveURL(/\/dashboard$/);

  // Navigate using React Router links.
  // page.goto() here would reset the login session.

  const sidebar = page.getByRole("complementary", {
    name: "Sidebar",
  });

  await sidebar
    .getByRole("button", {
      name: "Inventory",
      exact: true,
    })
    .click();

  const [response] = await Promise.all([
    page.waitForResponse(
      res => isManufacturersResponse(res)
    ),
    sidebar.getByRole("link", {
      name: "Manufacturers",
      exact: true,
    }).click(),
  ]);

  await expect(page).toHaveURL(/\/manufacturers$/);

  await expect(
    page.getByRole("heading", {
      name: "Manufacturers",
      level: 1,
    })
  ).toBeVisible();

  return response;
}

// ============================================
// REUSABLE UI HELPERS
// ============================================

async function openAdd(page) {
  await page.getByRole("button", {
    name: "Add Manufacturer",
    exact: true,
  }).click();

  const dialog = modal(page, "Add manufacturer");

  await expect(dialog).toBeVisible();

  return dialog;
}

async function createViaUI(page, name = makeName()) {
  const dialog = await openAdd(page);

  await dialog
    .getByLabel("Manufacturer name")
    .fill(name);

  const [response] = await Promise.all([
    page.waitForResponse(
      res => isManufacturersResponse(res, "POST")
    ),
    action(dialog, "Add Manufacturer").click(),
  ]);

  expect(
    [200, 201],
    await response.text()
  ).toContain(response.status());

  await expect(dialog).toHaveCount(0);

  await expect(
    rowFor(page, name.trim())
  ).toBeVisible();

  return name.trim();
}

async function openEdit(page, name) {
  await rowFor(page, name)
    .getByRole("button", {
      name: `Edit ${name}`,
      exact: true,
    })
    .click();

  const dialog = modal(page, "Edit manufacturer");

  await expect(dialog).toBeVisible();

  return dialog;
}

async function openStatusDialog(page, name, verb) {
  await rowFor(page, name)
    .getByRole("button", {
      name: `${verb} ${name}`,
      exact: true,
    })
    .click();

  const dialog = modal(page, `${verb} manufacturer`);

  await expect(dialog).toBeVisible();

  return dialog;
}

async function deactivate(page, name) {
  const dialog = await openStatusDialog(
    page,
    name,
    "Deactivate"
  );

  await action(dialog, "Deactivate").click();

  await expect(dialog).toHaveCount(0);

  await expect(
    rowFor(page, name).getByText("Inactive", {
      exact: true,
    })
  ).toBeVisible();
}

async function restore(page, name) {
  const dialog = await openStatusDialog(
    page,
    name,
    "Restore"
  );

  await action(dialog, "Restore").click();

  await expect(dialog).toHaveCount(0);

  await expect(
    rowFor(page, name).getByText("Active", {
      exact: true,
    })
  ).toBeVisible();
}

// ============================================
// SECTION 1 â€” LIST, SEARCH, FILTER, SORT
// TESTS 01â€“14
// ============================================

test.describe.configure({ timeout: 90000 });

test.describe("Manufacturers - List and Filters", () => {

  test("01 Empty response shows empty state", async ({ page }) => {
    await page.route(`${API}/manufacturers`, async route => {
      if (route.request().method() !== "GET") {
        return route.continue();
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      });
    });

    await loginAndOpen(page);

    await expect(
      page.getByRole("heading", {
        name: "No manufacturers found",
      })
    ).toBeVisible();

    await expect(
      page.getByText(
        "Manufacturers will appear here once added."
      )
    ).toBeVisible();
  });

  test("02 Lists an existing active manufacturer", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    await expect(rowFor(page, name)).toBeVisible();

    await expect(
      rowFor(page, name).getByText("Active", {
        exact: true,
      })
    ).toBeVisible();
  });

  test("03 Reload fetches manufacturers again", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    const [response] = await Promise.all([
      page.waitForResponse(
        res => isManufacturersResponse(res)
      ),
      page.getByRole("button", {
        name: "Reload manufacturers",
      }).click(),
    ]);

    expect(response.status()).toBe(200);

    await expect(rowFor(page, name)).toBeVisible();
  });

  test("04 Search by manufacturer name", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    await page
      .getByLabel("Search manufacturers")
      .fill(name);

    await expect(rowFor(page, name)).toBeVisible();

    await expect(
      page.locator("tbody tr")
    ).toHaveCount(1);
  });

  test("05 Search ignores letter case", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    await page
      .getByLabel("Search manufacturers")
      .fill(name.toUpperCase());

    await expect(rowFor(page, name)).toBeVisible();

    await expect(
      page.locator("tbody tr")
    ).toHaveCount(1);
  });

  test("06 Unknown search shows no matches", async ({ page }) => {
    await loginAndOpen(page);

    await page
      .getByLabel("Search manufacturers")
      .fill("no-such-e2e-mf-zzzzzz");

    await expect(
      page.getByRole("heading", {
        name: "No matching manufacturers",
      })
    ).toBeVisible();
  });

  test("07 Clear filters restores the list", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    await page
      .getByLabel("Search manufacturers")
      .fill("no-such-e2e-mf-zzzzzz");

    await page
      .getByRole("button", {
        name: "Clear filters",
      })
      .last()
      .click();

    await expect(
      page.getByLabel("Search manufacturers")
    ).toHaveValue("");

    await expect(rowFor(page, name)).toBeVisible();
  });

  test("08 Active filter excludes inactive records", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    await deactivate(page, name);

    await page
      .getByLabel("Status", { exact: true })
      .selectOption("Active");

    await expect(rowFor(page, name)).toHaveCount(0);
  });

  test("09 Inactive filter shows deactivated records", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    await deactivate(page, name);

    await page
      .getByLabel("Status", { exact: true })
      .selectOption("Inactive");

    await expect(rowFor(page, name)).toBeVisible();
  });

  test("10 Search and status filters work together", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    await page
      .getByLabel("Search manufacturers")
      .fill(name);

    await page
      .getByLabel("Status", { exact: true })
      .selectOption("Active");

    await expect(rowFor(page, name)).toBeVisible();

    await page
      .getByLabel("Status", { exact: true })
      .selectOption("Inactive");

    await expect(
      page.getByRole("heading", {
        name: "No matching manufacturers",
      })
    ).toBeVisible();
  });

  for (const [number, column] of [
    [11, "Manufacturer name"],
    [12, "Created"],
  ]) {
    test(`${number} ${column} sorting toggles ascending and descending`, async ({
      page,
      request,
    }) => {
      await seedManufacturer(request);

      await loginAndOpen(page);

      const header = page.getByRole("columnheader", {
        name: new RegExp(column, "i"),
      });

      await header.getByRole("button").click();

      const first = await header.getAttribute(
        "aria-sort"
      );

      expect(["ascending", "descending"]).toContain(first);

      await header.getByRole("button").click();

      expect(
        await header.getAttribute("aria-sort")
      ).not.toBe(first);
    });
  }

  test("13 Summary shows inactive after deactivation", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    await deactivate(page, name);

    await expect(
      page.getByRole("group", {
        name: "Summary before filtering",
      })
    ).toContainText("inactive");
  });

  test("14 Filtered count shows one matching manufacturer", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    await page
      .getByLabel("Search manufacturers")
      .fill(name);

    await expect(
      page.getByRole("status")
        .filter({ hasText: /1 of \d+ manufacturers/ })
    ).toBeVisible();
  });
});

// ============================================
// SECTION 2 â€” CREATE AND VALIDATION
// TESTS 15â€“27
// ============================================

test.describe("Manufacturers - Create", () => {

  test("15 Add Manufacturer opens a dialog", async ({ page }) => {
    await loginAndOpen(page);

    const dialog = await openAdd(page);

    await expect(
      dialog.getByLabel("Manufacturer name")
    ).toBeVisible();

    await expect(
      action(dialog, "Add Manufacturer")
    ).toBeEnabled();
  });

  test("16 Cancel closes Add dialog", async ({ page }) => {
    await loginAndOpen(page);

    const dialog = await openAdd(page);

    await action(dialog, "Cancel").click();

    await expect(dialog).toHaveCount(0);
  });

  test("17 Close dialog button works", async ({ page }) => {
    await loginAndOpen(page);

    const dialog = await openAdd(page);

    await action(dialog, "Close dialog").click();

    await expect(dialog).toHaveCount(0);
  });

  test("18 Escape closes Add dialog", async ({ page }) => {
    await loginAndOpen(page);

    const dialog = await openAdd(page);

    await page.keyboard.press("Escape");

    await expect(dialog).toHaveCount(0);
  });

  test("19 Empty name is rejected", async ({ page }) => {
    await loginAndOpen(page);

    const dialog = await openAdd(page);

    await action(dialog, "Add Manufacturer").click();

    await expect(
      dialog.getByText("Enter the manufacturer name.")
    ).toBeVisible();

    await expect(
      dialog.getByLabel("Manufacturer name")
    ).toBeFocused();
  });

  test("20 Whitespace-only name is rejected", async ({ page }) => {
    await loginAndOpen(page);

    const dialog = await openAdd(page);

    await dialog
      .getByLabel("Manufacturer name")
      .fill("   ");

    await action(dialog, "Add Manufacturer").click();

    await expect(
      dialog.getByText("Enter the manufacturer name.")
    ).toBeVisible();
  });

  test("21 Name field limits input to 100 characters", async ({
    page,
  }) => {
    await loginAndOpen(page);

    const dialog = await openAdd(page);

    await expect(
      dialog.getByLabel("Manufacturer name")
    ).toHaveAttribute("maxlength", "100");
  });

  test("22 Editing name clears validation error", async ({ page }) => {
    await loginAndOpen(page);

    const dialog = await openAdd(page);

    await action(dialog, "Add Manufacturer").click();

    await expect(
      dialog.getByText("Enter the manufacturer name.")
    ).toBeVisible();

    await dialog
      .getByLabel("Manufacturer name")
      .fill(makeName());

    await expect(
      dialog.getByText("Enter the manufacturer name.")
    ).toHaveCount(0);
  });

  test("23 Successfully adds a manufacturer and trims spaces", async ({
    page,
  }) => {
    await loginAndOpen(page);

    const name = makeName();

    await createViaUI(page, `  ${name}  `);

    await expect(
      rowFor(page, name).getByText("Active", {
        exact: true,
      })
    ).toBeVisible();
  });

  test("24 Duplicate active name shows server error", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    const dialog = await openAdd(page);

    await dialog
      .getByLabel("Manufacturer name")
      .fill(name);

    const [response] = await Promise.all([
      page.waitForResponse(
        res => isManufacturersResponse(res, "POST")
      ),
      action(dialog, "Add Manufacturer").click(),
    ]);

    expect(response.status()).toBe(409);

    await expect(
      dialog.getByRole("alert")
    ).toBeVisible();

    await expect(dialog).toBeVisible();
  });

  test("25 Allows a 100-character manufacturer name", async ({
    page,
  }) => {
    await loginAndOpen(page);

    const prefix = makeName();

    const name =
      prefix + "X".repeat(100 - prefix.length);

    expect(name).toHaveLength(100);

    await createViaUI(page, name);
  });

  test("26 Create recovers from a temporary server error", async ({
    page,
  }) => {
    await loginAndOpen(page);

    const name = makeName();

    await page.route(`${API}/manufacturers`, async route => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: "E2E simulated save error",
          }),
        });
      } else {
        await route.continue();
      }
    });

    const dialog = await openAdd(page);

    await dialog
      .getByLabel("Manufacturer name")
      .fill(name);

    await action(dialog, "Add Manufacturer").click();

    await expect(
      dialog.getByRole("alert")
    ).toContainText("E2E simulated save error");

    await page.unroute(`${API}/manufacturers`);

    await action(dialog, "Add Manufacturer").click();

    await expect(dialog).toHaveCount(0);

    await expect(rowFor(page, name)).toBeVisible();
  });

  test("27 Can create two different manufacturers", async ({ page }) => {
    await loginAndOpen(page);

    const a = await createViaUI(page);
    const b = await createViaUI(page);

    await expect(rowFor(page, a)).toBeVisible();
    await expect(rowFor(page, b)).toBeVisible();
  });
});

// ============================================
// SECTION 3 â€” EDIT MANUFACTURERS
// TESTS 28â€“34
// ============================================

test.describe("Manufacturers - Edit", () => {

  test("28 Edit dialog loads existing name", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    const dialog = await openEdit(page, name);

    await expect(
      dialog.getByLabel("Manufacturer name")
    ).toHaveValue(name);
  });

  test("29 Save Changes is disabled when unchanged", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    const dialog = await openEdit(page, name);

    await expect(
      action(dialog, "Save Changes")
    ).toBeDisabled();
  });

  test("30 Cancel discards edits", async ({ page, request }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    const dialog = await openEdit(page, name);

    await dialog
      .getByLabel("Manufacturer name")
      .fill(makeName());

    await action(dialog, "Cancel").click();

    await expect(rowFor(page, name)).toBeVisible();
  });

  test("31 Empty name cannot be saved", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    const dialog = await openEdit(page, name);

    await dialog
      .getByLabel("Manufacturer name")
      .fill("  ");

    await action(dialog, "Save Changes").click();

    await expect(
      dialog.getByText("Enter the manufacturer name.")
    ).toBeVisible();
  });

  test("32 Updates manufacturer name", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    const dialog = await openEdit(page, name);

    const updated = makeName();

    await dialog
      .getByLabel("Manufacturer name")
      .fill(`  ${updated}  `);

    await action(dialog, "Save Changes").click();

    await expect(dialog).toHaveCount(0);

    await expect(rowFor(page, updated)).toBeVisible();

    await expect(rowFor(page, name)).toHaveCount(0);
  });

  test("33 Renaming to an existing manufacturer fails", async ({
    page,
    request,
  }) => {
    const original = await seedManufacturer(request);
    const existing = await seedManufacturer(request);

    await loginAndOpen(page);

    const dialog = await openEdit(page, original);

    await dialog
      .getByLabel("Manufacturer name")
      .fill(existing);

    await action(dialog, "Save Changes").click();

    await expect(
      dialog.getByRole("alert")
    ).toBeVisible();

    await expect(dialog).toBeVisible();
  });

  test("34 Escape closes Edit without saving", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    const dialog = await openEdit(page, name);

    await dialog
      .getByLabel("Manufacturer name")
      .fill(makeName());

    await page.keyboard.press("Escape");

    await expect(dialog).toHaveCount(0);

    await expect(rowFor(page, name)).toBeVisible();
  });
});

// ============================================
// SECTION 4 â€” DEACTIVATE AND RESTORE
// TESTS 35â€“41
// ============================================

test.describe("Manufacturers - Status", () => {

  test("35 Cancel deactivation leaves record active", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    const dialog = await openStatusDialog(
      page,
      name,
      "Deactivate"
    );

    await expect(
      dialog.getByText(/record will remain available/i)
    ).toBeVisible();

    await action(dialog, "Cancel").click();

    await expect(
      rowFor(page, name).getByText("Active", {
        exact: true,
      })
    ).toBeVisible();
  });

  test("36 Deactivates manufacturer", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    await deactivate(page, name);

    await expect(
      rowFor(page, name).getByRole("button", {
        name: `Restore ${name}`,
        exact: true,
      })
    ).toBeVisible();
  });

  test("37 Inactive manufacturer cannot be edited", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    await deactivate(page, name);

    await expect(
      rowFor(page, name).getByRole("button", {
        name: `Edit ${name}`,
        exact: true,
      })
    ).toBeDisabled();

    await expect(
      rowFor(page, name).getByText(
        "Restore before editing."
      )
    ).toBeVisible();
  });

  test("38 Cancel restore leaves record inactive", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    await deactivate(page, name);

    const dialog = await openStatusDialog(
      page,
      name,
      "Restore"
    );

    await action(dialog, "Cancel").click();

    await expect(
      rowFor(page, name).getByText("Inactive", {
        exact: true,
      })
    ).toBeVisible();
  });

  test("39 Restoring makes inactive record editable", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    await deactivate(page, name);

    await restore(page, name);

    await expect(
      rowFor(page, name).getByRole("button", {
        name: `Edit ${name}`,
        exact: true,
      })
    ).toBeEnabled();
  });

  test("40 Re-adding inactive name offers Restore existing", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    await deactivate(page, name);

    const dialog = await openAdd(page);

    await dialog
      .getByLabel("Manufacturer name")
      .fill(name);

    const [response] = await Promise.all([
      page.waitForResponse(
        res => isManufacturersResponse(res, "POST")
      ),
      action(dialog, "Add Manufacturer").click(),
    ]);

    expect(response.status()).toBe(409);

    const prompt = modal(
      page,
      "Restore existing manufacturer"
    );

    await expect(prompt).toBeVisible();

    await action(prompt, "Restore Manufacturer").click();

    await expect(prompt).toHaveCount(0);

    await expect(
      rowFor(page, name).getByText("Active", {
        exact: true,
      })
    ).toBeVisible();
  });

  test("41 Duplicate-inactive prompt lets user choose a different name", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await loginAndOpen(page);

    await deactivate(page, name);

    const dialog = await openAdd(page);

    await dialog
      .getByLabel("Manufacturer name")
      .fill(name);

    await action(dialog, "Add Manufacturer").click();

    const prompt = modal(
      page,
      "Restore existing manufacturer"
    );

    await expect(prompt).toBeVisible();

    await action(prompt, "Use a different name").click();

    await expect(dialog).toBeVisible();

    const another = makeName();

    await dialog
      .getByLabel("Manufacturer name")
      .fill(another);

    await action(dialog, "Add Manufacturer").click();

    await expect(dialog).toHaveCount(0);

    await expect(
      rowFor(page, another)
    ).toBeVisible();

    await expect(
      rowFor(page, name).getByText("Inactive", {
        exact: true,
      })
    ).toBeVisible();
  });
});

// ============================================
// SECTION 5 â€” API FAILURES AND SECURITY
// TESTS 42â€“47
// ============================================

test.describe("Manufacturers - Errors and Permissions", () => {

  test("42 Loading API failure shows an error", async ({ page }) => {
    await page.route(`${API}/manufacturers`, async route => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: "E2E load failure",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await loginAndOpen(page);

    await expect(
      page.getByRole("alert").getByText(
        "E2E load failure"
      )
    ).toBeVisible();
  });

  test("43 Reload recovers from API failure", async ({
    page,
    request,
  }) => {
    const name = await seedManufacturer(request);

    await page.route(`${API}/manufacturers`, async route => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: "E2E load failure",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await loginAndOpen(page);

    await expect(
      page.getByRole("alert").getByText(
        "E2E load failure"
      )
    ).toBeVisible();

    await page.unroute(`${API}/manufacturers`);

    const [response] = await Promise.all([
      page.waitForResponse(
        res => isManufacturersResponse(res)
      ),
      page.getByRole("button", {
        name: "Reload manufacturers",
      }).click(),
    ]);

    expect(response.status()).toBe(200);

    await expect(rowFor(page, name)).toBeVisible();
  });

  test("44 Missing JWT cannot list manufacturers", async ({
    request,
  }) => {
    const response = await request.get(
      `${API}/manufacturers`
    );

    expect(response.status()).toBe(401);
  });

  test("45 Invalid JWT cannot list manufacturers", async ({
    request,
  }) => {
    const response = await request.get(
      `${API}/manufacturers`,
      {
        headers: {
          Authorization: "Bearer invalid.e2e.token",
        },
      }
    );

    expect(response.status()).toBe(401);
  });

  for (const [number, role] of [
    [46, "Pharmacist"],
    [47, "Customer"],
  ]) {
    test(`${number} ${role} cannot create manufacturer`, async ({
      request,
    }) => {
      const token = await tokenFor(request, role);

      const response = await request.post(
        `${API}/manufacturers`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          data: {
            name: makeName(),
          },
        }
      );

      expect(response.status()).toBe(403);
    });
  }
});

