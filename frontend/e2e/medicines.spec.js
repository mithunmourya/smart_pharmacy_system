
import { test, expect } from "@playwright/test";

const API = (
  process.env.E2E_API_BASE_URL ||
  "http://127.0.0.1:5000"
).replace(/\/+$/, "");

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

const categories = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Injection",
  "Ointment",
  "Drops",
  "Powder",
  "Other",
];

let serial = 0;

const unique = (prefix) =>
  `${prefix} ${process.pid} ${Date.now().toString(36)} ${++serial}`;

const rowFor = (page, name) =>
  page.locator("tbody tr").filter({ hasText: name });

const dialog = (page, title) =>
  page.getByRole("dialog", {
    name: title,
    exact: true,
  });

const action = (box, name) =>
  box.getByRole("button", {
    name,
    exact: true,
  });

const apiResponse = (res, path, method = "GET") =>
  new URL(res.url()).pathname === path &&
  res.request().method() === method;

// ============================================
// REUSABLE API HELPERS
// ============================================

async function tokenFor(request, role = "Admin") {
  const user = accounts[role];

  expect(
    user.email && user.password,
    `Missing ${role} E2E credentials`
  ).toBeTruthy();

  const res = await request.post(`${API}/users/login`, {
    data: user,
  });

  expect(res.status()).toBe(200);

  const token = (await res.json()).data?.token;

  expect(token).toBeTruthy();

  return token;
}

async function seedManufacturer(request) {
  const name = unique("E2E MED MF");
  const token = await tokenFor(request);

  const headers = {
    Authorization: `Bearer ${token}`,
  };

  const created = await request.post(
    `${API}/manufacturers`,
    {
      headers,
      data: { name },
    }
  );

  expect(
    [200, 201],
    await created.text()
  ).toContain(created.status());

  const listed = await request.get(
    `${API}/manufacturers`,
    { headers }
  );

  expect(listed.status()).toBe(200);

  const records = (await listed.json()).data;

  const found = records.find(
    (item) => item.name === name
  );

  expect(
    found?.manufacturer_id,
    `Manufacturer ${name} not found`
  ).toBeTruthy();

  return {
    id: Number(found.manufacturer_id),
    name,
    token,
  };
}

async function seedMedicine(request, options = {}) {
  const manufacturer =
    options.manufacturer || await seedManufacturer(request);

  const medicine = {
    name: options.name || unique("E2E MED"),
    manufacturer_id: manufacturer.id,
    category: options.category || "Tablet",
    reorder_level: options.reorder_level ?? 10,
  };

  const res = await request.post(`${API}/medicines`, {
    headers: {
      Authorization: `Bearer ${manufacturer.token}`,
    },
    data: medicine,
  });

  expect(
    [200, 201],
    await res.text()
  ).toContain(res.status());

  return {
    ...medicine,
    manufacturer,
  };
}

// ============================================
// LOGIN AND NAVIGATION
// ============================================

async function loginAndOpen(page) {
  const user = accounts.Admin;

  expect(
    user.email && user.password,
    "Admin credentials missing"
  ).toBeTruthy();

  await page.goto("/login");

  await page
    .getByLabel("Email address")
    .fill(user.email);

  await page
    .getByLabel("Password", { exact: true })
    .fill(user.password);

  const [login] = await Promise.all([
    page.waitForResponse(
      res => apiResponse(res, "/users/login", "POST")
    ),

    page.getByRole("button", {
      name: "Sign In",
      exact: true,
    }).click(),
  ]);

  expect(login.status()).toBe(200);

  await expect(page).toHaveURL(/\/dashboard$/);

  // Use React navigation, not page.goto("/medicines").
  // Login is stored only in React memory.

  const sidebar = page.getByRole("complementary", {
    name: "Sidebar",
  });

  await sidebar.getByRole("button", {
    name: "Inventory",
    exact: true,
  }).click();

  const [response] = await Promise.all([
    page.waitForResponse(
      res => apiResponse(res, "/medicines")
    ),

    sidebar.getByRole("link", {
      name: "Medicines",
      exact: true,
    }).click(),
  ]);

  await expect(page).toHaveURL(/\/medicines$/);

  await expect(
    page.getByRole("heading", {
      name: "Medicines",
      level: 1,
    })
  ).toBeVisible();

  return response;
}

// ============================================
// REUSABLE UI HELPERS
// ============================================

async function openAdd(page) {
  await action(page, "Add Medicine").click();

  const box = dialog(page, "Add medicine");

  await expect(box).toBeVisible();

  return box;
}

async function fillMedicine(box, medicine) {
  await box
    .getByLabel("Medicine name")
    .fill(medicine.name);

  await box
    .getByLabel("Manufacturer", { exact: true })
    .selectOption(String(medicine.manufacturer_id));

  await box
    .getByLabel("Category", { exact: true })
    .selectOption(medicine.category);

  await box
    .getByLabel("Reorder level")
    .fill(String(medicine.reorder_level));
}

async function createInUI(page, manufacturer, overrides = {}) {
  const medicine = {
    name: unique("E2E MED"),
    manufacturer_id: manufacturer.id,
    category: "Tablet",
    reorder_level: 10,
    ...overrides,
  };

  const box = await openAdd(page);

  await fillMedicine(box, medicine);

  const [res] = await Promise.all([
    page.waitForResponse(
      r => apiResponse(r, "/medicines", "POST")
    ),

    action(box, "Add Medicine").click(),
  ]);

  expect(
    [200, 201],
    await res.text()
  ).toContain(res.status());

  await expect(box).toHaveCount(0);

  await expect(
    rowFor(page, medicine.name.trim())
      .filter({ hasText: manufacturer.name })
  ).toBeVisible();

  return medicine;
}

async function openEdit(page, name) {
  await rowFor(page, name)
    .getByRole("button", {
      name: `Edit ${name}`,
      exact: true,
    })
    .click();

  const box = dialog(page, "Edit medicine");

  await expect(box).toBeVisible();

  return box;
}

async function openStatus(page, name, verb) {
  await rowFor(page, name)
    .getByRole("button", {
      name: `${verb} ${name}`,
      exact: true,
    })
    .click();

  const box = dialog(page, `${verb} medicine`);

  await expect(box).toBeVisible();

  return box;
}

async function deactivate(page, name) {
  const box = await openStatus(
    page,
    name,
    "Deactivate"
  );

  await action(box, "Deactivate").click();

  await expect(box).toHaveCount(0);

  await expect(
    rowFor(page, name).getByText("Inactive", {
      exact: true,
    })
  ).toBeVisible();
}

// ============================================
// SECTION 1 — LIST, FILTERS, SORTING
// TESTS 01–20
// ============================================

test.describe("Medicines - List, Filters, Sorting", () => {

  test("01 Empty medicines response shows empty state", async ({ page }) => {
    await page.route(`${API}/medicines`, async route => {
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
        name: "No medicines found",
      })
    ).toBeVisible();
  });

  test("02 Shows a seeded medicine with correct data", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request, {
      category: "Syrup",
      reorder_level: 7,
    });

    await loginAndOpen(page);

    const row = rowFor(page, med.name);

    await expect(row).toContainText(
      med.manufacturer.name
    );

    await expect(row).toContainText("Syrup");

    await expect(
      row.locator("td").nth(3)
    ).toHaveText("7");

    await expect(
      row.getByText("Active", { exact: true })
    ).toBeVisible();
  });

  test("03 Reload fetches medicines again", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    const [res] = await Promise.all([
      page.waitForResponse(
        r => apiResponse(r, "/medicines")
      ),

      page.getByRole("button", {
        name: "Reload medicines",
      }).click(),
    ]);

    expect(res.status()).toBe(200);

    await expect(
      rowFor(page, med.name)
    ).toBeVisible();
  });

  test("04 Search by medicine name", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    await page
      .getByLabel("Search")
      .fill(med.name);

    await expect(
      rowFor(page, med.name)
    ).toBeVisible();

    await expect(
      page.locator("tbody tr")
    ).toHaveCount(1);
  });

  test("05 Search by manufacturer name", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    await page
      .getByLabel("Search")
      .fill(med.manufacturer.name);

    await expect(
      rowFor(page, med.name)
    ).toBeVisible();
  });

  test("06 Search is case-insensitive", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    await page
      .getByLabel("Search")
      .fill(med.name.toUpperCase());

    await expect(
      rowFor(page, med.name)
    ).toBeVisible();

    await expect(
      page.locator("tbody tr")
    ).toHaveCount(1);
  });

  test("07 Unknown search shows No matching medicines", async ({
    page,
    request,
  }) => {
    await seedMedicine(request);

    await loginAndOpen(page);

    await page
      .getByLabel("Search")
      .fill("no-such-e2e-medicine-zzzzzzz");

    await expect(
      page.getByRole("heading", {
        name: "No matching medicines",
      })
    ).toBeVisible();
  });

  test("08 Clear filters restores medicine list", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    await page
      .getByLabel("Search")
      .fill("no-such-e2e-medicine-zzzzzzz");

    await page
      .getByRole("button", {
        name: "Clear filters",
      })
      .last()
      .click();

    await expect(
      page.getByLabel("Search")
    ).toHaveValue("");

    await expect(
      rowFor(page, med.name)
    ).toBeVisible();
  });

  test("09 Category filter selects matching medicine", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request, {
      category: "Powder",
    });

    await loginAndOpen(page);

    await page
      .getByLabel("Category", { exact: true })
      .selectOption("Powder");

    await page
      .getByLabel("Search")
      .fill(med.name);

    await expect(
      rowFor(page, med.name)
    ).toBeVisible();

    await page
      .getByLabel("Category", { exact: true })
      .selectOption("Tablet");

    await expect(
      page.getByRole("heading", {
        name: "No matching medicines",
      })
    ).toBeVisible();
  });

  test("10 Manufacturer filter selects matching medicine", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    await page
      .getByLabel("Manufacturer", { exact: true })
      .selectOption(String(med.manufacturer.id));

    await page
      .getByLabel("Search")
      .fill(med.name);

    await expect(
      rowFor(page, med.name)
    ).toBeVisible();

    await expect(
      page.locator("tbody tr")
    ).toHaveCount(1);
  });

  test("11 Active filter excludes deactivated medicine", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    await deactivate(page, med.name);

    await page
      .getByLabel("Medicine status")
      .selectOption("Active");

    await expect(
      rowFor(page, med.name)
    ).toHaveCount(0);
  });

  test("12 Inactive filter includes deactivated medicine", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    await deactivate(page, med.name);

    await page
      .getByLabel("Medicine status")
      .selectOption("Inactive");

    await expect(
      rowFor(page, med.name)
    ).toBeVisible();
  });

  test("13 Search, category, and manufacturer filters combine", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request, {
      category: "Capsule",
    });

    await loginAndOpen(page);

    await page
      .getByLabel("Search")
      .fill(med.name);

    await page
      .getByLabel("Category", { exact: true })
      .selectOption("Capsule");

    await page
      .getByLabel("Manufacturer", { exact: true })
      .selectOption(String(med.manufacturer.id));

    await expect(
      page.locator("tbody tr")
    ).toHaveCount(1);

    await page
      .getByLabel("Category", { exact: true })
      .selectOption("Drops");

    await expect(
      page.getByRole("heading", {
        name: "No matching medicines",
      })
    ).toBeVisible();
  });

  test("14 Filtered count displays one result", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    await page
      .getByLabel("Search")
      .fill(med.name);

    await expect(
      page.getByRole("status").filter({
        hasText: /1 of \d+ medicines/,
      })
    ).toBeVisible();
  });

  test("15 Summary includes total and active", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    await expect(
      rowFor(page, med.name)
    ).toBeVisible();

    await expect(
      page.getByRole("group", {
        name: "Summary before filtering",
      })
    ).toContainText("active");
  });

  // TESTS 16–20: SORTING

  for (const [num, label] of [
    [16, "Medicine"],
    [17, "Manufacturer"],
    [18, "Category"],
    [19, "Reorder level"],
    [20, "Created"],
  ]) {
    test(`${num} Sort ${label} ascending and descending`, async ({
      page,
      request,
    }) => {
      await seedMedicine(request);

      await loginAndOpen(page);

      const head = page.getByRole("columnheader", {
        name: new RegExp(label, "i"),
      });

      await head.getByRole("button").click();

      const first = await head.getAttribute(
        "aria-sort"
      );

      expect([
        "ascending",
        "descending",
      ]).toContain(first);

      await head.getByRole("button").click();

      expect(
        await head.getAttribute("aria-sort")
      ).not.toBe(first);
    });
  }
});

// ============================================
// SECTION 2 — CREATE AND VALIDATION
// TESTS 21–39
// ============================================

test.describe("Medicines - Create and Validation", () => {

  test("21 Add dialog shows all fields and categories", async ({
    page,
    request,
  }) => {
    await seedManufacturer(request);

    await loginAndOpen(page);

    const box = await openAdd(page);

    await expect(
      box.getByLabel("Medicine name")
    ).toBeVisible();

    await expect(
      box.getByLabel("Manufacturer", { exact: true })
    ).toBeVisible();

    await expect(
      box.getByLabel("Reorder level")
    ).toHaveValue("10");

    for (const category of categories) {
      await expect(
        box.getByRole("option", {
          name: category,
          exact: true,
        })
      ).toHaveCount(1);
    }
  });

  test("22 Cancel closes Add dialog", async ({ page }) => {
    await loginAndOpen(page);

    const box = await openAdd(page);

    await action(box, "Cancel").click();

    await expect(box).toHaveCount(0);
  });

  test("23 Close dialog button works", async ({ page }) => {
    await loginAndOpen(page);

    const box = await openAdd(page);

    await action(box, "Close dialog").click();

    await expect(box).toHaveCount(0);
  });

  test("24 Escape closes Add dialog", async ({ page }) => {
    await loginAndOpen(page);

    const box = await openAdd(page);

    await page.keyboard.press("Escape");

    await expect(box).toHaveCount(0);
  });

  test("25 Missing required fields show validation errors", async ({
    page,
    request,
  }) => {
    await seedManufacturer(request);

    await loginAndOpen(page);

    const box = await openAdd(page);

    await action(box, "Add Medicine").click();

    for (const error of [
      "Enter the medicine name.",
      "Select an active manufacturer.",
      "Select a category.",
    ]) {
      await expect(
        box.getByText(error)
      ).toBeVisible();
    }
  });

  test("26 Whitespace-only medicine name rejected", async ({
    page,
    request,
  }) => {
    const mf = await seedManufacturer(request);

    await loginAndOpen(page);

    const box = await openAdd(page);

    await fillMedicine(box, {
      name: "   ",
      manufacturer_id: mf.id,
      category: "Tablet",
      reorder_level: 10,
    });

    await action(box, "Add Medicine").click();

    await expect(
      box.getByText("Enter the medicine name.")
    ).toBeVisible();
  });

  test("27 Missing manufacturer rejected", async ({
    page,
    request,
  }) => {
    await seedManufacturer(request);

    await loginAndOpen(page);

    const box = await openAdd(page);

    await box
      .getByLabel("Medicine name")
      .fill(unique("E2E MED"));

    await box
      .getByLabel("Category", { exact: true })
      .selectOption("Tablet");

    await action(box, "Add Medicine").click();

    await expect(
      box.getByText("Select an active manufacturer.")
    ).toBeVisible();
  });

  test("28 Missing category rejected", async ({
    page,
    request,
  }) => {
    const mf = await seedManufacturer(request);

    await loginAndOpen(page);

    const box = await openAdd(page);

    await box
      .getByLabel("Medicine name")
      .fill(unique("E2E MED"));

    await box
      .getByLabel("Manufacturer", { exact: true })
      .selectOption(String(mf.id));

    await action(box, "Add Medicine").click();

    await expect(
      box.getByText("Select a category.")
    ).toBeVisible();
  });

  // TESTS 29–32: REORDER LEVEL BOUNDARIES

  for (const [num, value] of [
    [29, ""],
    [30, "-1"],
    [31, "1.5"],
    [32, "2147483648"],
  ]) {
    test(`${num} Invalid reorder level ${JSON.stringify(value)} is rejected`, async ({
      page,
      request,
    }) => {
      const mf = await seedManufacturer(request);

      await loginAndOpen(page);

      const box = await openAdd(page);

      await fillMedicine(box, {
        name: unique("E2E MED"),
        manufacturer_id: mf.id,
        category: "Tablet",
        reorder_level: 10,
      });

      await box
        .getByLabel("Reorder level")
        .fill(value);

      await action(box, "Add Medicine").click();

      await expect(
        box.getByText(
          "Enter a whole number from 0 to 2147483647."
        )
      ).toBeVisible();
    });
  }

  test("33 Medicine name max length is 100", async ({ page }) => {
    await loginAndOpen(page);

    const box = await openAdd(page);

    await expect(
      box.getByLabel("Medicine name")
    ).toHaveAttribute("maxlength", "100");
  });

  test("34 Add Medicine succeeds and trims name", async ({
    page,
    request,
  }) => {
    const mf = await seedManufacturer(request);

    await loginAndOpen(page);

    const name = unique("E2E MED");

    await createInUI(page, mf, {
      name: `  ${name}  `,
      category: "Injection",
      reorder_level: 3,
    });

    await expect(
      rowFor(page, name).locator("td").nth(2)
    ).toHaveText("Injection");

    await expect(
      rowFor(page, name).locator("td").nth(3)
    ).toHaveText("3");
  });

  test("35 Active duplicate under same manufacturer shows error", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    const box = await openAdd(page);

    await fillMedicine(box, med);

    const [res] = await Promise.all([
      page.waitForResponse(
        r => apiResponse(r, "/medicines", "POST")
      ),

      action(box, "Add Medicine").click(),
    ]);

    expect(res.status()).toBe(409);

    await expect(
      box.getByRole("alert")
    ).toBeVisible();
  });

  test("36 Same medicine name with another manufacturer is allowed", async ({
    page,
    request,
  }) => {
    const name = unique("E2E MED");

    await seedMedicine(request, { name });

    const other = await seedManufacturer(request);

    await loginAndOpen(page);

    await createInUI(page, other, { name });

    await expect(
      page.locator("tbody tr").filter({
        hasText: name,
      })
    ).toHaveCount(2);
  });

  test("37 Reorder level zero is accepted", async ({
    page,
    request,
  }) => {
    const mf = await seedManufacturer(request);

    await loginAndOpen(page);

    const med = await createInUI(page, mf, {
      reorder_level: 0,
    });

    await expect(
      rowFor(page, med.name).locator("td").nth(3)
    ).toHaveText("0");
  });

  test("38 No active manufacturers disables Save", async ({
    page,
  }) => {
    await page.route(
      `${API}/manufacturers`,
      async route => {
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
      }
    );

    await loginAndOpen(page);

    const box = await openAdd(page);

    await expect(
      box.getByText(
        "Add or restore a manufacturer before saving a medicine."
      )
    ).toBeVisible();

    await expect(
      action(box, "Add Medicine")
    ).toBeDisabled();
  });

  test("39 Manufacturer loading error supports retry", async ({
    page,
    request,
  }) => {
    const mf = await seedManufacturer(request);

    await page.route(
      `${API}/manufacturers`,
      async route => {
        if (route.request().method() !== "GET") {
          return route.continue();
        }

        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: "E2E manufacturer load failure",
          }),
        });
      }
    );

    await loginAndOpen(page);

    const box = await openAdd(page);

    await expect(
      box.getByRole("alert")
    ).toContainText("E2E manufacturer load failure");

    await page.unroute(`${API}/manufacturers`);

    await action(
      box,
      "Retry loading manufacturers"
    ).click();

    await expect(
      box.getByRole("option", {
        name: mf.name,
        exact: true,
      })
    ).toHaveCount(1);

    await expect(
      box.getByLabel("Manufacturer", { exact: true })
    ).toBeEnabled();
  });
});

// ============================================
// SECTION 3 — EDIT MEDICINES
// TESTS 40–45
// ============================================

test.describe("Medicines - Edit", () => {

  test("40 Edit dialog prefills existing fields", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request, {
      category: "Drops",
      reorder_level: 9,
    });

    await loginAndOpen(page);

    const box = await openEdit(page, med.name);

    await expect(
      box.getByLabel("Medicine name")
    ).toHaveValue(med.name);

    await expect(
      box.getByLabel("Manufacturer", { exact: true })
    ).toHaveValue(String(med.manufacturer.id));

    await expect(
      box.getByLabel("Category", { exact: true })
    ).toHaveValue("Drops");

    await expect(
      box.getByLabel("Reorder level")
    ).toHaveValue("9");
  });

  test("41 Save Changes disabled when unchanged", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    const box = await openEdit(page, med.name);

    await expect(
      action(box, "Save Changes")
    ).toBeDisabled();
  });

  test("42 Cancel edit preserves original medicine", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    const box = await openEdit(page, med.name);

    await box
      .getByLabel("Medicine name")
      .fill(unique("Unsaved MED"));

    await action(box, "Cancel").click();

    await expect(box).toHaveCount(0);

    await expect(
      rowFor(page, med.name)
    ).toBeVisible();
  });

  test("43 Update name, category and reorder level", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    const box = await openEdit(page, med.name);

    const updated = unique("E2E MED Updated");

    await box
      .getByLabel("Medicine name")
      .fill(` ${updated} `);

    await box
      .getByLabel("Category", { exact: true })
      .selectOption("Ointment");

    await box
      .getByLabel("Reorder level")
      .fill("25");

    await action(box, "Save Changes").click();

    await expect(box).toHaveCount(0);

    const row = rowFor(page, updated);

    await expect(row).toContainText("Ointment");

    await expect(
      row.locator("td").nth(3)
    ).toHaveText("25");

    await expect(
      rowFor(page, med.name)
    ).toHaveCount(0);
  });

  test("44 Renaming to a duplicate under same manufacturer fails", async ({
    page,
    request,
  }) => {
    const mf = await seedManufacturer(request);

    const original = await seedMedicine(request, {
      manufacturer: mf,
    });

    const other = await seedMedicine(request, {
      manufacturer: mf,
    });

    await loginAndOpen(page);

    const box = await openEdit(page, original.name);

    await box
      .getByLabel("Medicine name")
      .fill(other.name);

    await action(box, "Save Changes").click();

    await expect(
      box.getByRole("alert")
    ).toBeVisible();

    await expect(box).toBeVisible();
  });

  test("45 Empty edit name is rejected", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    const box = await openEdit(page, med.name);

    await box
      .getByLabel("Medicine name")
      .fill("   ");

    await action(box, "Save Changes").click();

    await expect(
      box.getByText("Enter the medicine name.")
    ).toBeVisible();
  });
});

// ============================================
// SECTION 4 — DEACTIVATE AND RESTORE
// TESTS 46–52
// ============================================

test.describe("Medicines - Status", () => {

  test("46 Cancel deactivation keeps medicine active", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    const box = await openStatus(
      page,
      med.name,
      "Deactivate"
    );

    await action(box, "Cancel").click();

    await expect(
      rowFor(page, med.name).getByText("Active", {
        exact: true,
      })
    ).toBeVisible();
  });

  test("47 Deactivation makes medicine inactive", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    await deactivate(page, med.name);

    await expect(
      rowFor(page, med.name).getByRole("button", {
        name: `Restore ${med.name}`,
        exact: true,
      })
    ).toBeVisible();
  });

  test("48 Inactive medicine cannot be edited", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    await deactivate(page, med.name);

    await expect(
      rowFor(page, med.name).getByRole("button", {
        name: `Edit ${med.name}`,
        exact: true,
      })
    ).toBeDisabled();

    await expect(
      rowFor(page, med.name).getByText(
        "Restore before editing."
      )
    ).toBeVisible();
  });

  test("49 Cancel restoration keeps medicine inactive", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    await deactivate(page, med.name);

    const box = await openStatus(
      page,
      med.name,
      "Restore"
    );

    await action(box, "Cancel").click();

    await expect(
      rowFor(page, med.name).getByText("Inactive", {
        exact: true,
      })
    ).toBeVisible();
  });

  test("50 Restoring medicine enables editing again", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    await deactivate(page, med.name);

    const box = await openStatus(
      page,
      med.name,
      "Restore"
    );

    await action(box, "Restore").click();

    await expect(box).toHaveCount(0);

    await expect(
      rowFor(page, med.name).getByText("Active", {
        exact: true,
      })
    ).toBeVisible();

    await expect(
      rowFor(page, med.name).getByRole("button", {
        name: `Edit ${med.name}`,
        exact: true,
      })
    ).toBeEnabled();
  });

  test("51 Adding inactive duplicate offers Restore existing medicine", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    await deactivate(page, med.name);

    const box = await openAdd(page);

    await fillMedicine(box, med);

    const [res] = await Promise.all([
      page.waitForResponse(
        r => apiResponse(r, "/medicines", "POST")
      ),

      action(box, "Add Medicine").click(),
    ]);

    expect(res.status()).toBe(409);

    const restoreBox = dialog(
      page,
      "Restore existing medicine"
    );

    await expect(restoreBox).toBeVisible();

    await action(
      restoreBox,
      "Restore Medicine"
    ).click();

    await expect(restoreBox).toHaveCount(0);

    await expect(
      rowFor(page, med.name).getByText("Active", {
        exact: true,
      })
    ).toBeVisible();
  });

  test("52 Restore prompt can return to medicine details", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await loginAndOpen(page);

    await deactivate(page, med.name);

    const box = await openAdd(page);

    await fillMedicine(box, med);

    await action(box, "Add Medicine").click();

    const prompt = dialog(
      page,
      "Restore existing medicine"
    );

    await expect(prompt).toBeVisible();

    await action(
      prompt,
      "Back to medicine details"
    ).click();

    await expect(
      dialog(page, "Add medicine")
    ).toBeVisible();

    await action(
      dialog(page, "Add medicine"),
      "Cancel"
    ).click();

    await expect(
      rowFor(page, med.name).getByText("Inactive", {
        exact: true,
      })
    ).toBeVisible();
  });
});

// ============================================
// SECTION 5 — API ERRORS AND PERMISSIONS
// TESTS 53–58
// ============================================

test.describe("Medicines - Errors and Permissions", () => {

  test("53 Medicines list API failure displays error", async ({
    page,
  }) => {
    await page.route(
      `${API}/medicines`,
      async route => {
        if (route.request().method() !== "GET") {
          return route.continue();
        }

        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: "E2E medicines load failure",
          }),
        });
      }
    );

    await loginAndOpen(page);

    await expect(
      page.getByRole("alert")
    ).toContainText("E2E medicines load failure");
  });

  test("54 Reload recovers from medicines list failure", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await page.route(
      `${API}/medicines`,
      async route => {
        if (route.request().method() !== "GET") {
          return route.continue();
        }

        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: "E2E medicines load failure",
          }),
        });
      }
    );

    await loginAndOpen(page);

    await expect(
      page.getByRole("alert")
    ).toContainText("E2E medicines load failure");

    await page.unroute(`${API}/medicines`);

    const [res] = await Promise.all([
      page.waitForResponse(
        r => apiResponse(r, "/medicines")
      ),

      page.getByRole("button", {
        name: "Reload medicines",
      }).click(),
    ]);

    expect(res.status()).toBe(200);

    await expect(
      rowFor(page, med.name)
    ).toBeVisible();
  });

  test("55 Missing JWT cannot list medicines", async ({
    request,
  }) => {
    const res = await request.get(
      `${API}/medicines`
    );

    expect(res.status()).toBe(401);
  });

  test("56 Invalid JWT is rejected", async ({ request }) => {
    const res = await request.get(
      `${API}/medicines`,
      {
        headers: {
          Authorization: "Bearer invalid.e2e.token",
        },
      }
    );

    expect(res.status()).toBe(401);
  });

  // TESTS 57–58

  for (const [num, role] of [
    [57, "Pharmacist"],
    [58, "Customer"],
  ]) {
    test(`${num} ${role} cannot create medicine`, async ({
      request,
    }) => {
      const mf = await seedManufacturer(request);

      const token = await tokenFor(
        request,
        role
      );

      const res = await request.post(
        `${API}/medicines`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },

          data: {
            name: unique("Blocked MED"),
            manufacturer_id: mf.id,
            category: "Tablet",
            reorder_level: 10,
          },
        }
      );

      expect(res.status()).toBe(403);
    });
  }
});
