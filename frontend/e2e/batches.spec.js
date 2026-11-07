
import { test, expect } from "@playwright/test";

// ============================================
// CONFIGURATION
// ============================================

const API = (
  process.env.E2E_API_BASE_URL ||
  "http://127.0.0.1:5000"
).replace(/\/+$/, "");

const ACCOUNTS = {
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

const MAX_STOCK = 2147483647;

let sequence = 0;

const unique = (prefix) =>
  `${prefix}-${process.pid}-${Date.now().toString(36)}-${++sequence}`;

// Use relative dates so tests remain valid in the future.
function dateAfter(days) {
  const date = new Date();

  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const rowFor = (page, number) =>
  page.locator("tbody tr").filter({ hasText: number });

const dialog = (page, title) =>
  page.getByRole("dialog", {
    name: title,
    exact: true,
  });

const button = (scope, name) =>
  scope.getByRole("button", {
    name,
    exact: true,
  });

const isResponse = (res, path, method = "GET") =>
  new URL(res.url()).pathname === path &&
  res.request().method() === method;

// ============================================
// REUSABLE BACKEND HELPERS
// ============================================

async function tokenFor(request, role = "Admin") {
  const account = ACCOUNTS[role];

  expect(
    account.email && account.password,
    `${role} credentials missing`
  ).toBeTruthy();

  const res = await request.post(`${API}/users/login`, {
    data: account,
  });

  expect(res.status()).toBe(200);

  const token = (await res.json()).data?.token;

  expect(token).toBeTruthy();

  return token;
}

async function seedMedicine(request) {
  const token = await tokenFor(request);

  const headers = {
    Authorization: `Bearer ${token}`,
  };

  const manufacturerName = unique("E2E-BATCH-MF");

  const mf = await request.post(
    `${API}/manufacturers`,
    {
      headers,
      data: { name: manufacturerName },
    }
  );

  expect([200, 201], await mf.text()).toContain(
    mf.status()
  );

  const mfs = await request.get(
    `${API}/manufacturers`,
    { headers }
  );

  expect(mfs.status()).toBe(200);

  const manufacturer = (await mfs.json()).data.find(
    (x) => x.name === manufacturerName
  );

  expect(manufacturer?.manufacturer_id).toBeTruthy();

  const name = unique("E2E-BATCH-MED");

  const med = await request.post(
    `${API}/medicines`,
    {
      headers,
      data: {
        name,
        manufacturer_id: manufacturer.manufacturer_id,
        category: "Tablet",
        reorder_level: 10,
      },
    }
  );

  expect([200, 201], await med.text()).toContain(
    med.status()
  );

  const meds = await request.get(
    `${API}/medicines`,
    { headers }
  );

  expect(meds.status()).toBe(200);

  const medicine = (await meds.json()).data.find(
    (x) => x.name === name
  );

  expect(medicine?.medicine_id).toBeTruthy();

  return {
    id: Number(medicine.medicine_id),
    name,
    token,
    manufacturerName,
  };
}

async function seedBatch(
  request,
  medicine = null,
  overrides = {}
) {
  const med = medicine || (await seedMedicine(request));

  const batch = {
    medicine_id: med.id,
    batch_number: unique("E2E-B"),
    purchase_price: 10.5,
    selling_price: 15.75,
    stock_quantity: 20,
    expiry_date: dateAfter(90),
    ...overrides,
  };

  const headers = {
    Authorization: `Bearer ${med.token}`,
  };

  const res = await request.post(`${API}/batches`, {
    headers,
    data: batch,
  });

  expect([200, 201], await res.text()).toContain(
    res.status()
  );

  const list = await request.get(
    `${API}/batches/medicine/${med.id}`,
    { headers }
  );

  expect(list.status()).toBe(200);

  const record = (await list.json()).data.find(
    (x) => x.batch_number === batch.batch_number
  );

  expect(record?.batch_id).toBeTruthy();

  return {
    ...batch,
    id: Number(record.batch_id),
    medicine: med,
  };
}

// ============================================
// LOGIN AND NAVIGATION
// ============================================

async function openBatches(page) {
  const account = ACCOUNTS.Admin;

  expect(
    account.email && account.password
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
      (res) =>
        isResponse(res, "/users/login", "POST")
    ),
    button(page, "Sign In").click(),
  ]);

  expect(login.status()).toBe(200);

  await expect(page).toHaveURL(/\/dashboard$/);

  // Navigate using React Router links.
  // page.goto("/batches") would reset the
  // in-memory authentication session.

  const sidebar = page.getByRole("complementary", {
    name: "Sidebar",
  });

  await button(sidebar, "Inventory").click();

  const [res] = await Promise.all([
    page.waitForResponse(
      (r) => isResponse(r, "/medicines")
    ),
    sidebar
      .getByRole("link", {
        name: "Batches",
        exact: true,
      })
      .click(),
  ]);

  expect(res.status()).toBe(200);

  await expect(page).toHaveURL(/\/batches$/);

  await expect(
    page.getByRole("heading", {
      name: "Batches",
      level: 1,
    })
  ).toBeVisible();
}

async function selectMedicine(page, med) {
  const [res] = await Promise.all([
    page.waitForResponse((r) =>
      isResponse(
        r,
        `/batches/medicine/${med.id}`
      )
    ),

    page
      .getByLabel("Medicine", { exact: true })
      .selectOption(String(med.id)),
  ]);

  // Backend may return 404 for zero batches.
  expect([200, 404]).toContain(res.status());

  await expect(
    page.getByRole("status").filter({
      hasText: /\d+ of \d+ batches/,
    })
  ).toBeVisible();
}

async function openPageFor(page, med) {
  await openBatches(page);
  await selectMedicine(page, med);
}

// ============================================
// MODAL HELPERS
// ============================================

async function openAdd(page) {
  await button(page, "Add Batch").click();

  const box = dialog(page, "Add batch");

  await expect(box).toBeVisible();

  return box;
}

async function fillBatch(box, values) {
  await box
    .getByLabel("Batch number")
    .fill(values.batch_number);

  await box
    .getByLabel("Purchase price")
    .fill(String(values.purchase_price));

  await box
    .getByLabel("Selling price")
    .fill(String(values.selling_price));

  if (values.stock_quantity !== undefined) {
    await box
      .getByLabel("Initial stock quantity")
      .fill(String(values.stock_quantity));
  }

  await box
    .getByLabel("Expiry date")
    .fill(values.expiry_date);
}

async function createInUI(page, overrides = {}) {
  const values = {
    batch_number: unique("E2E-B"),
    purchase_price: 10.5,
    selling_price: 15.75,
    stock_quantity: 20,
    expiry_date: dateAfter(90),
    ...overrides,
  };

  const box = await openAdd(page);

  await fillBatch(box, values);

  const [res] = await Promise.all([
    page.waitForResponse((r) =>
      isResponse(r, "/batches", "POST")
    ),

    button(box, "Add Batch").click(),
  ]);

  expect([200, 201], await res.text()).toContain(
    res.status()
  );

  await expect(box).toHaveCount(0);

  await expect(
    rowFor(page, values.batch_number.trim())
  ).toBeVisible();

  return values;
}

async function openAction(page, batch, verb, title) {
  await rowFor(page, batch.batch_number)
    .getByRole("button", {
      name: `${verb} batch ${batch.batch_number}`,
      exact: true,
    })
    .click();

  const box = dialog(page, title);

  await expect(box).toBeVisible();

  // Edit, stock, and status dialogs fetch
  // the latest details before showing the form.

  await expect(
    button(box, "Cancel")
  ).toBeVisible();

  return box;
}

async function deactivate(page, batch) {
  const box = await openAction(
    page,
    batch,
    "Deactivate",
    "Deactivate batch"
  );

  await button(box, "Deactivate").click();

  await expect(box).toHaveCount(0);

  await expect(
    rowFor(page, batch.batch_number).getByText(
      "Inactive",
      { exact: true }
    )
  ).toBeVisible();
}

// ============================================
// SECTION 1 â€” LISTING AND FILTERS
// TESTS 01â€“20
// ============================================

test.describe("Batches - Listing and Filters", () => {
  test("01 Before choosing medicine, batch list asks for selection", async ({ page }) => {
    await openBatches(page);

    await expect(
      button(page, "Add Batch")
    ).toBeDisabled();

    await expect(
      page.getByText(
        "Choose a medicine above to view its batches."
      )
    ).toBeVisible();
  });

  test("02 Medicine without batches shows empty state", async ({ page, request }) => {
    const med = await seedMedicine(request);

    await openPageFor(page, med);

    await expect(
      page.getByRole("heading", {
        name: "No batches found",
      })
    ).toBeVisible();

    await expect(
      button(page, "Add Batch")
    ).toBeEnabled();
  });

  test("03 Lists batch number, stock, prices and active status", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    const row = rowFor(page, batch.batch_number);

    await expect(row).toContainText("10.50");
    await expect(row).toContainText("15.75");

    await expect(
      row.locator("td").nth(3)
    ).toContainText("20");

    await expect(
      row.getByText("Active", { exact: true })
    ).toBeVisible();
  });

  test("04 Search batch by number", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    await page
      .getByLabel("Search batches")
      .fill(batch.batch_number);

    await expect(
      rowFor(page, batch.batch_number)
    ).toBeVisible();

    await expect(
      page.locator("tbody tr")
    ).toHaveCount(1);
  });

  test("05 Search ignores uppercase/lowercase", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    await page
      .getByLabel("Search batches")
      .fill(batch.batch_number.toLowerCase());

    await expect(
      rowFor(page, batch.batch_number)
    ).toBeVisible();
  });

  test("06 Search with unknown number shows no matching batches", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    await page
      .getByLabel("Search batches")
      .fill("nothing-matches-e2e-xyz");

    await expect(
      page.getByRole("heading", {
        name: "No matching batches",
      })
    ).toBeVisible();
  });

  test("07 Clear filters restores batch list", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    await page
      .getByLabel("Search batches")
      .fill("nothing-matches-e2e-xyz");

    await button(page, "Clear filters")
      .last()
      .click();

    await expect(
      page.getByLabel("Search batches")
    ).toHaveValue("");

    await expect(
      rowFor(page, batch.batch_number)
    ).toBeVisible();
  });

  test("08 Active filter excludes inactive batch", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    await deactivate(page, batch);

    await page
      .getByLabel("Batch status")
      .selectOption("Active");

    await expect(
      rowFor(page, batch.batch_number)
    ).toHaveCount(0);
  });

  test("09 Inactive filter includes deactivated batch", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    await deactivate(page, batch);

    await page
      .getByLabel("Batch status")
      .selectOption("Inactive");

    await expect(
      rowFor(page, batch.batch_number)
    ).toBeVisible();
  });

  test("10 Within 10 days filter includes soon-expiring batch", async ({ page, request }) => {
    const batch = await seedBatch(request, null, {
      expiry_date: dateAfter(5),
    });

    await openPageFor(page, batch.medicine);

    await page
      .getByLabel("Expiry", { exact: true })
      .selectOption("Soon");

    await expect(
      rowFor(page, batch.batch_number)
    ).toBeVisible();
  });

  test("11 Later filter includes batch expiring after 10 days", async ({ page, request }) => {
    const batch = await seedBatch(request, null, {
      expiry_date: dateAfter(90),
    });

    await openPageFor(page, batch.medicine);

    await page
      .getByLabel("Expiry", { exact: true })
      .selectOption("Later");

    await expect(
      rowFor(page, batch.batch_number)
    ).toBeVisible();

    await page
      .getByLabel("Expiry", { exact: true })
      .selectOption("Soon");

    await expect(
      rowFor(page, batch.batch_number)
    ).toHaveCount(0);
  });

  test("12 Summary counts batches expiring soon", async ({ page, request }) => {
    const batch = await seedBatch(request, null, {
      expiry_date: dateAfter(3),
    });

    await openPageFor(page, batch.medicine);

    await expect(
      page.getByRole("group", {
        name: "Summary before filtering",
      })
    ).toContainText("expire within 10 days");
  });

  test("13 Reload batches calls backend again", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    const [res] = await Promise.all([
      page.waitForResponse((r) =>
        isResponse(
          r,
          `/batches/medicine/${batch.medicine.id}`
        )
      ),

      page.getByRole("button", {
        name: "Reload batches",
      }).click(),
    ]);

    expect(res.status()).toBe(200);

    await expect(
      rowFor(page, batch.batch_number)
    ).toBeVisible();
  });

  test("14 Switching medicines clears search and filters", async ({ page, request }) => {
    const first = await seedBatch(request);
    const second = await seedMedicine(request);

    await openPageFor(page, first.medicine);

    await page
      .getByLabel("Search batches")
      .fill("nonexistent-e2e");

    await page
      .getByLabel("Batch status")
      .selectOption("Inactive");

    await selectMedicine(page, second);

    await expect(
      page.getByLabel("Search batches")
    ).toHaveValue("");

    await expect(
      page.getByLabel("Batch status")
    ).toHaveValue("All");

    await expect(
      page.getByRole("heading", {
        name: "No batches found",
      })
    ).toBeVisible();
  });

  // TESTS 15â€“20: SORTING

  for (const [number, label] of [
    [15, "Batch number"],
    [16, "Purchase price"],
    [17, "Selling price"],
    [18, "Stock"],
    [19, "Expiry"],
    [20, "Created"],
  ]) {
    test(`${number} Sort ${label} ascending and descending`, async ({
      page,
      request,
    }) => {
      const batch = await seedBatch(request);

      await openPageFor(page, batch.medicine);

      const sortButton = page.getByRole("button", {
        name: new RegExp(`^${label}: sort (ascending|descending)$`, "i"),
      });

      await sortButton.click();

      const first = await sortButton.locator("..").getAttribute(
        "aria-sort"
      );

      expect([
        "ascending",
        "descending",
      ]).toContain(first);

      await sortButton.click();

      expect(
        await sortButton.locator("..").getAttribute("aria-sort")
      ).not.toBe(first);
    });
  }
});

// ============================================
// SECTION 2 â€” CREATE AND FORM VALIDATION
// TESTS 21â€“40
// ============================================

test.describe("Batches - Create and Validation", () => {
  test("21 Add Batch dialog displays required fields", async ({ page, request }) => {
    const med = await seedMedicine(request);

    await openPageFor(page, med);

    const box = await openAdd(page);

    for (const label of [
      "Batch number",
      "Purchase price",
      "Selling price",
      "Initial stock quantity",
      "Expiry date",
    ]) {
      await expect(
        box.getByLabel(label)
      ).toBeVisible();
    }

    await expect(
      box.getByLabel("Initial stock quantity")
    ).toHaveValue("0");
  });

  test("22 Cancel closes Add Batch dialog", async ({ page, request }) => {
    const med = await seedMedicine(request);

    await openPageFor(page, med);

    const box = await openAdd(page);

    await button(box, "Cancel").click();

    await expect(box).toHaveCount(0);
  });

  test("23 Close dialog button works", async ({ page, request }) => {
    const med = await seedMedicine(request);

    await openPageFor(page, med);

    const box = await openAdd(page);

    await button(box, "Close dialog").click();

    await expect(box).toHaveCount(0);
  });

  test("24 Escape closes Add dialog", async ({ page, request }) => {
    const med = await seedMedicine(request);

    await openPageFor(page, med);

    const box = await openAdd(page);

    await page.keyboard.press("Escape");

    await expect(box).toHaveCount(0);
  });

  test("25 Empty required fields show validation", async ({ page, request }) => {
    const med = await seedMedicine(request);

    await openPageFor(page, med);

    const box = await openAdd(page);

    await button(box, "Add Batch").click();

    for (const message of [
      "Enter the batch number.",
      "Enter a price from 0 to 99999999.99, with up to two decimal places.",
      "Choose a future expiry date.",
    ]) {
      await expect(
        box.getByText(message).first()
      ).toBeVisible();
    }
  });

  test("26 Whitespace-only batch number is rejected", async ({ page, request }) => {
    const med = await seedMedicine(request);

    await openPageFor(page, med);

    const box = await openAdd(page);

    await fillBatch(box, {
      batch_number: "   ",
      purchase_price: 10,
      selling_price: 15,
      stock_quantity: 5,
      expiry_date: dateAfter(90),
    });

    await button(box, "Add Batch").click();

    await expect(
      box.getByText("Enter the batch number.")
    ).toBeVisible();
  });

  // TESTS 27â€“35: INVALID INPUTS

  for (const [number, field, value, message] of [
    [
      27,
      "Purchase price",
      "-1",
      "Enter a price from 0 to 99999999.99, with up to two decimal places.",
    ],
    [
      28,
      "Selling price",
      "-1",
      "Enter a price from 0 to 99999999.99, with up to two decimal places.",
    ],
    [
      29,
      "Selling price",
      "5",
      "Selling price cannot be less than purchase price.",
    ],
    [
      30,
      "Expiry date",
      "",
      "Choose a future expiry date.",
    ],
    [
      31,
      "Expiry date",
      dateAfter(-2),
      "Choose a future expiry date.",
    ],
    [
      32,
      "Initial stock quantity",
      "",
      `Enter a whole number from 0 to ${MAX_STOCK}.`,
    ],
    [
      33,
      "Initial stock quantity",
      "-1",
      `Enter a whole number from 0 to ${MAX_STOCK}.`,
    ],
    [
      34,
      "Initial stock quantity",
      "1.5",
      `Enter a whole number from 0 to ${MAX_STOCK}.`,
    ],
    [
      35,
      "Initial stock quantity",
      String(MAX_STOCK + 1),
      `Enter a whole number from 0 to ${MAX_STOCK}.`,
    ],
  ]) {
    test(`${number} Invalid ${field} ${JSON.stringify(value)} is rejected`, async ({
      page,
      request,
    }) => {
      const med = await seedMedicine(request);

      await openPageFor(page, med);

      const box = await openAdd(page);

      await fillBatch(box, {
        batch_number: unique("E2E-B"),
        purchase_price: 10,
        selling_price: 15,
        stock_quantity: 5,
        expiry_date: dateAfter(90),
      });

      await box.getByLabel(field).fill(value);

      await button(box, "Add Batch").click();

      await expect(
        box.getByText(message)
      ).toBeVisible();
    });
  }

  test("36 Batch number input has max length 50", async ({ page, request }) => {
    const med = await seedMedicine(request);

    await openPageFor(page, med);

    const box = await openAdd(page);

    await expect(
      box.getByLabel("Batch number")
    ).toHaveAttribute("maxlength", "50");
  });

  test("37 Admin can create a batch with trimmed number", async ({ page, request }) => {
    const med = await seedMedicine(request);

    await openPageFor(page, med);

    const number = unique("E2E-B");

    await createInUI(page, {
      batch_number: `  ${number}  `,
      stock_quantity: 11,
    });

    await expect(
      rowFor(page, number).locator("td").nth(3)
    ).toHaveText("11");
  });

  test("38 Zero initial stock is valid", async ({ page, request }) => {
    const med = await seedMedicine(request);

    await openPageFor(page, med);

    const batch = await createInUI(page, {
      stock_quantity: 0,
    });

    await expect(
      rowFor(page, batch.batch_number)
        .getByText("Out of stock")
    ).toBeVisible();
  });

  test("39 Duplicate batch number in same medicine is rejected", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    const box = await openAdd(page);

    await fillBatch(box, batch);

    const [res] = await Promise.all([
      page.waitForResponse((r) =>
        isResponse(r, "/batches", "POST")
      ),

      button(box, "Add Batch").click(),
    ]);

    expect(res.status()).toBe(409);

    await expect(
      box.getByRole("alert")
    ).toBeVisible();
  });

  test("40 Same batch number is allowed for different medicines", async ({ page, request }) => {
    const first = await seedBatch(request);
    const second = await seedMedicine(request);

    await openPageFor(page, second);

    await createInUI(page, {
      batch_number: first.batch_number,
      purchase_price: 10.5,
      selling_price: 15.75,
      stock_quantity: 9,
    });

    await expect(
      rowFor(page, first.batch_number)
    ).toBeVisible();
  });
});

// ============================================
// SECTION 3 â€” EDIT BATCH DETAILS
// TESTS 41â€“46
// ============================================

test.describe("Batches - Edit Details", () => {
  test("41 Edit dialog preloads saved data", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    const box = await openAction(
      page,
      batch,
      "Edit",
      "Edit batch"
    );

    await expect(
      box.getByLabel("Batch number")
    ).toHaveValue(batch.batch_number);

    await expect(
      box.getByLabel("Purchase price")
    ).toHaveValue("10.50");

    await expect(
      box.getByLabel("Selling price")
    ).toHaveValue("15.75");

    await expect(
      box.getByText("Medicine cannot be changed.", {
        exact: false,
      })
    ).toBeVisible();
  });

  test("42 Save Changes disabled when no changes made", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    const box = await openAction(
      page,
      batch,
      "Edit",
      "Edit batch"
    );

    await expect(
      button(box, "Save Changes")
    ).toBeDisabled();
  });

  test("43 Cancel edit preserves original batch", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    const box = await openAction(
      page,
      batch,
      "Edit",
      "Edit batch"
    );

    await box
      .getByLabel("Batch number")
      .fill(unique("NOT-SAVED"));

    await button(box, "Cancel").click();

    await expect(
      rowFor(page, batch.batch_number)
    ).toBeVisible();
  });

  test("44 Update batch number and prices successfully", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    const box = await openAction(
      page,
      batch,
      "Edit",
      "Edit batch"
    );

    const updated = unique("E2E-UPDATED");

    await box
      .getByLabel("Batch number")
      .fill(updated);

    await box
      .getByLabel("Purchase price")
      .fill("12.25");

    await box
      .getByLabel("Selling price")
      .fill("20.50");

    await button(box, "Save Changes").click();

    await expect(box).toHaveCount(0);

    await expect(
      rowFor(page, updated)
    ).toContainText("12.25");

    await expect(
      rowFor(page, updated)
    ).toContainText("20.50");

    await expect(
      rowFor(page, batch.batch_number)
    ).toHaveCount(0);
  });

  test("45 Edit rejects selling price below purchase price", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    const box = await openAction(
      page,
      batch,
      "Edit",
      "Edit batch"
    );

    await box
      .getByLabel("Selling price")
      .fill("1");

    await button(box, "Save Changes").click();

    await expect(
      box.getByText(
        "Selling price cannot be less than purchase price."
      )
    ).toBeVisible();
  });

  test("46 Edit rejects duplicate batch number for same medicine", async ({ page, request }) => {
    const first = await seedBatch(request);

    const second = await seedBatch(
      request,
      first.medicine
    );

    await openPageFor(page, first.medicine);

    const box = await openAction(
      page,
      second,
      "Edit",
      "Edit batch"
    );

    await box
      .getByLabel("Batch number")
      .fill(first.batch_number);

    await button(box, "Save Changes").click();

    await expect(
      box.getByRole("alert")
    ).toBeVisible();
  });
});

// ============================================
// SECTION 4 â€” STOCK ADJUSTMENTS
// TESTS 47â€“54
// ============================================

test.describe("Batches - Adjust Stock", () => {
  test("47 Adjust Stock dialog displays current stock", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    const box = await openAction(
      page,
      batch,
      "Adjust stock for",
      "Adjust stock"
    );

    await expect(box).toContainText(
      "Current stock:"
    );

    await expect(box).toContainText("20");

    await expect(
      box.getByLabel("Adjustment")
    ).toHaveValue("add");
  });

  test("48 Add stock updates quantity", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    const box = await openAction(
      page,
      batch,
      "Adjust stock for",
      "Adjust stock"
    );

    await box
      .getByLabel("Quantity to add")
      .fill("5");

    await expect(
      box.getByRole("status")
    ).toContainText("25");

    await button(box, "Confirm Adjustment").click();

    await expect(box).toHaveCount(0);

    await expect(
      rowFor(page, batch.batch_number)
        .locator("td")
        .nth(3)
    ).toHaveText("25");
  });

  test("49 Remove stock updates quantity", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    const box = await openAction(
      page,
      batch,
      "Adjust stock for",
      "Adjust stock"
    );

    await box
      .getByLabel("Adjustment")
      .selectOption("remove");

    await box
      .getByLabel("Quantity to remove")
      .fill("3");

    await expect(
      box.getByRole("status")
    ).toContainText("17");

    await button(box, "Confirm Adjustment").click();

    await expect(box).toHaveCount(0);

    await expect(
      rowFor(page, batch.batch_number)
        .locator("td")
        .nth(3)
    ).toHaveText("17");
  });

  test("50 Cannot remove more stock than available", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    const box = await openAction(
      page,
      batch,
      "Adjust stock for",
      "Adjust stock"
    );

    await box
      .getByLabel("Adjustment")
      .selectOption("remove");

    await box
      .getByLabel("Quantity to remove")
      .fill("21");

    await button(box, "Confirm Adjustment").click();

    await expect(
      box.getByText(
        "You cannot remove more than the current stock."
      )
    ).toBeVisible();
  });

  // TESTS 51â€“53

  for (const [number, value] of [
    [51, ""],
    [52, "0"],
    [53, "1.5"],
  ]) {
    test(`${number} Invalid stock adjustment ${JSON.stringify(value)} rejected`, async ({
      page,
      request,
    }) => {
      const batch = await seedBatch(request);

      await openPageFor(page, batch.medicine);

      const box = await openAction(
        page,
        batch,
        "Adjust stock for",
        "Adjust stock"
      );

      await box
        .getByLabel("Quantity to add")
        .fill(value);

      await button(box, "Confirm Adjustment").click();

      await expect(
        box.getByText(
          `Enter a whole number from 1 to ${MAX_STOCK}.`
        )
      ).toBeVisible();
    });
  }

  test("54 Cancel stock adjustment keeps quantity unchanged", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    const box = await openAction(
      page,
      batch,
      "Adjust stock for",
      "Adjust stock"
    );

    await box
      .getByLabel("Quantity to add")
      .fill("7");

    await button(box, "Cancel").click();

    await expect(
      rowFor(page, batch.batch_number)
        .locator("td")
        .nth(3)
    ).toHaveText("20");
  });
});

// ============================================
// SECTION 5 â€” DEACTIVATE AND RESTORE
// TESTS 55â€“59
// ============================================

test.describe("Batches - Status", () => {
  test("55 Cancel deactivation keeps batch active", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    const box = await openAction(
      page,
      batch,
      "Deactivate",
      "Deactivate batch"
    );

    await button(box, "Cancel").click();

    await expect(
      rowFor(page, batch.batch_number).getByText(
        "Active",
        { exact: true }
      )
    ).toBeVisible();
  });

  test("56 Deactivation disables Edit and Adjust Stock", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    await deactivate(page, batch);

    const row = rowFor(page, batch.batch_number);

    await expect(
      row.getByRole("button", {
        name: `Edit batch ${batch.batch_number}`,
      })
    ).toBeDisabled();

    await expect(
      row.getByRole("button", {
        name: `Adjust stock for batch ${batch.batch_number}`,
      })
    ).toBeDisabled();

    await expect(
      row.getByText(
        "Restore before editing or adjusting stock."
      )
    ).toBeVisible();
  });

  test("57 Cancel restore keeps batch inactive", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    await deactivate(page, batch);

    const box = await openAction(
      page,
      batch,
      "Restore",
      "Restore batch"
    );

    await button(box, "Cancel").click();

    await expect(
      rowFor(page, batch.batch_number).getByText(
        "Inactive",
        { exact: true }
      )
    ).toBeVisible();
  });

  test("58 Restore makes batch active and editable again", async ({ page, request }) => {
    const batch = await seedBatch(request);

    await openPageFor(page, batch.medicine);

    await deactivate(page, batch);

    const box = await openAction(
      page,
      batch,
      "Restore",
      "Restore batch"
    );

    await button(box, "Restore").click();

    await expect(box).toHaveCount(0);

    await expect(
      rowFor(page, batch.batch_number).getByText(
        "Active",
        { exact: true }
      )
    ).toBeVisible();

    await expect(
      rowFor(page, batch.batch_number).getByRole(
        "button",
        {
          name: `Edit batch ${batch.batch_number}`,
        }
      )
    ).toBeEnabled();
  });

  test("59 Inactive medicine prevents creating new batches", async ({ page, request }) => {
    const med = await seedMedicine(request);

    const res = await request.patch(
      `${API}/medicines/${med.id}/deactivate`,
      {
        headers: {
          Authorization: `Bearer ${med.token}`,
        },
      }
    );

    expect(res.status()).toBe(200);

    await openPageFor(page, med);

    await expect(
      button(page, "Add Batch")
    ).toBeDisabled();

    await expect(
      page.getByText(
        /Inactive medicine: existing batches remain visible/
      )
    ).toBeVisible();
  });
});

// ============================================
// SECTION 6 â€” API ERRORS AND AUTHORIZATION
// TESTS 60â€“66
// ============================================

test.describe("Batches - Errors and Permissions", () => {
  test("60 Batch list server error shows alert and reload recovers", async ({
    page,
    request,
  }) => {
    const batch = await seedBatch(request);

    await page.route(
      `**/batches/medicine/${batch.medicine.id}`,
      async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: "E2E batch list failure",
          }),
        });
      }
    );

    await openBatches(page);

    const [res] = await Promise.all([
      page.waitForResponse((r) =>
        isResponse(
          r,
          `/batches/medicine/${batch.medicine.id}`
        )
      ),

      page
        .getByLabel("Medicine", { exact: true })
        .selectOption(String(batch.medicine.id)),
    ]);

    expect(res.status()).toBe(500);

    await expect(
      page.getByRole("alert").getByText(
        "E2E batch list failure"
      )
    ).toBeVisible();

    await page.unroute(
      `**/batches/medicine/${batch.medicine.id}`
    );

    const [reloaded] = await Promise.all([
      page.waitForResponse((r) =>
        isResponse(
          r,
          `/batches/medicine/${batch.medicine.id}`
        )
      ),

      page.getByRole("button", {
        name: "Reload batches",
      }).click(),
    ]);

    expect(reloaded.status()).toBe(200);

    await expect(
      rowFor(page, batch.batch_number)
    ).toBeVisible();
  });

  test("61 Medicine loading error supports retry", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await page.route(
      `${API}/medicines`,
      async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: "E2E medicine failure",
          }),
        });
      }
    );

    await page.goto("/login");

    const admin = ACCOUNTS.Admin;

    await page
      .getByLabel("Email address")
      .fill(admin.email);

    await page
      .getByLabel("Password", { exact: true })
      .fill(admin.password);

    await button(page, "Sign In").click();

    await expect(page).toHaveURL(/\/dashboard$/);

    const sidebar = page.getByRole(
      "complementary",
      { name: "Sidebar" }
    );

    await button(sidebar, "Inventory").click();

    await sidebar
      .getByRole("link", {
        name: "Batches",
        exact: true,
      })
      .click();

    await expect(
      page.getByRole("alert").getByText(
        "E2E medicine failure"
      )
    ).toBeVisible();

    await page.unroute(`${API}/medicines`);

    await button(
      page,
      "Retry loading medicines"
    ).click();

    await expect(
      page
        .getByLabel("Medicine", { exact: true })
        .getByRole("option", {
          name: new RegExp(med.name),
        })
    ).toHaveCount(1);
  });

  test("62 Create request server error shows alert, then retry succeeds", async ({
    page,
    request,
  }) => {
    const med = await seedMedicine(request);

    await openPageFor(page, med);

    await page.route(
      `${API}/batches`,
      async (route) => {
        if (
          route.request().method() !== "POST"
        ) {
          return route.continue();
        }

        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: "E2E batch save failure",
          }),
        });
      }
    );

    const box = await openAdd(page);

    const values = {
      batch_number: unique("E2E-B"),
      purchase_price: 10,
      selling_price: 15,
      stock_quantity: 5,
      expiry_date: dateAfter(90),
    };

    await fillBatch(box, values);

    await button(box, "Add Batch").click();

    await expect(
      box.getByRole("alert")
    ).toContainText("E2E batch save failure");

    await page.unroute(`${API}/batches`);

    await button(box, "Add Batch").click();

    await expect(box).toHaveCount(0);

    await expect(
      rowFor(page, values.batch_number)
    ).toBeVisible();
  });

  test("63 Missing JWT cannot list batches", async ({
    request,
  }) => {
    const res = await request.get(
      `${API}/batches/medicine/1`
    );

    expect(res.status()).toBe(401);
  });

  test("64 Invalid JWT cannot list batches", async ({
    request,
  }) => {
    const res = await request.get(
      `${API}/batches/medicine/1`,
      {
        headers: {
          Authorization: "Bearer invalid.e2e.token",
        },
      }
    );

    expect(res.status()).toBe(401);
  });

  // TESTS 65â€“66

  for (const [number, role] of [
    [65, "Pharmacist"],
    [66, "Customer"],
  ]) {
    test(`${number} ${role} cannot create batches`, async ({
      request,
    }) => {
      const med = await seedMedicine(request);

      const token = await tokenFor(
        request,
        role
      );

      const res = await request.post(
        `${API}/batches`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },

          data: {
            medicine_id: med.id,
            batch_number: unique("BLOCKED-B"),
            purchase_price: 10,
            selling_price: 15,
            stock_quantity: 5,
            expiry_date: dateAfter(90),
          },
        }
      );

      expect(res.status()).toBe(403);
    });
  }
});

