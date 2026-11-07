
import { test, expect } from "@playwright/test";

// ============================================
// CONFIGURATION
// ============================================

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

let serial = 0;

const unique = (prefix) =>
  `${prefix}-${process.pid}-${Date.now().toString(36)}-${++serial}`;

function dateAfter(days) {
  const d = new Date();

  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);

  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`
  );
}

const pathFor = (mode) =>
  mode === "inventory"
    ? "/batches/inventory"
    : "/batches/low-stock";

const titleFor = (mode) =>
  mode === "inventory"
    ? "Available Inventory"
    : "Low Stock";

const isResponse = (res, path, method = "GET") =>
  new URL(res.url()).pathname === path &&
  res.request().method() === method;

const headers = (token) => ({
  Authorization: `Bearer ${token}`,
});

const rowFor = (page, mode, name) =>
  page
    .getByRole("region", {
      name: titleFor(mode),
      exact: true,
    })
    .locator("tbody tr")
    .filter({
      has: page.getByRole("cell", {
        name,
        exact: true,
      }),
    });

const search = (page) =>
  page.getByRole("searchbox", {
    name: "Search",
  });

const summary = (page) =>
  page.getByRole("group", {
    name: "Summary for all medicines before filtering",
  });

// ============================================
// API HELPERS
// ============================================

async function tokenFor(request, role = "Admin") {
  const account = accounts[role];

  expect(
    account.email && account.password,
    `Missing ${role} E2E credentials`
  ).toBeTruthy();

  const res = await request.post(`${API}/users/login`, {
    data: account,
  });

  expect(res.status()).toBe(200);

  const token = (await res.json()).data?.token;

  expect(token).toBeTruthy();

  return token;
}

async function seedMedicine(
  request,
  { category = "Tablet", reorder = 10 } = {}
) {
  const token = await tokenFor(request);

  const mfName = unique("E2E-INV-MF");

  const mfRes = await request.post(
    `${API}/manufacturers`,
    {
      headers: headers(token),
      data: { name: mfName },
    }
  );

  expect([200, 201], await mfRes.text()).toContain(
    mfRes.status()
  );

  const mfList = await request.get(
    `${API}/manufacturers`,
    { headers: headers(token) }
  );

  expect(mfList.status()).toBe(200);

  const mf = (await mfList.json()).data.find(
    (item) => item.name === mfName
  );

  expect(mf?.manufacturer_id).toBeTruthy();

  const name = unique("E2E-INV-MED");

  const medRes = await request.post(
    `${API}/medicines`,
    {
      headers: headers(token),
      data: {
        name,
        manufacturer_id: mf.manufacturer_id,
        category,
        reorder_level: reorder,
      },
    }
  );

  expect([200, 201], await medRes.text()).toContain(
    medRes.status()
  );

  const medList = await request.get(
    `${API}/medicines`,
    { headers: headers(token) }
  );

  expect(medList.status()).toBe(200);

  const med = (await medList.json()).data.find(
    (item) => item.name === name
  );

  expect(med?.medicine_id).toBeTruthy();

  return {
    id: Number(med.medicine_id),
    name,
    mfName,
    mfId: Number(mf.manufacturer_id),
    category,
    reorder,
    token,
  };
}

async function addBatch(
  request,
  med,
  { quantity = 15, days = 90, price = 24.5 } = {}
) {
  const number = unique("E2E-INV-B");

  const res = await request.post(`${API}/batches`, {
    headers: headers(med.token),
    data: {
      medicine_id: med.id,
      batch_number: number,
      purchase_price: 10.5,
      selling_price: price,
      stock_quantity: quantity,
      expiry_date: dateAfter(days),
    },
  });

  expect([200, 201], await res.text()).toContain(
    res.status()
  );

  const list = await request.get(
    `${API}/batches/medicine/${med.id}`,
    { headers: headers(med.token) }
  );

  expect(list.status()).toBe(200);

  const batch = (await list.json()).data.find(
    (item) => item.batch_number === number
  );

  expect(batch?.batch_id).toBeTruthy();

  return {
    id: Number(batch.batch_id),
    number,
    quantity,
    days,
    price,
  };
}

async function seedStock(
  request,
  {
    quantity = 15,
    reorder = 10,
    days = 90,
    category = "Tablet",
    withBatch = true,
  } = {}
) {
  const med = await seedMedicine(request, {
    category,
    reorder,
  });

  const batch = withBatch
    ? await addBatch(request, med, {
        quantity,
        days,
      })
    : null;

  return { ...med, batch };
}

// ============================================
// LOGIN AND NAVIGATION
// ============================================

async function loginAndOpen(
  page,
  mode = "inventory",
  role = "Admin"
) {
  const account = accounts[role];

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
    page.waitForResponse((r) =>
      isResponse(r, "/users/login", "POST")
    ),

    page
      .getByRole("button", {
        name: "Sign In",
        exact: true,
      })
      .click(),
  ]);

  expect(login.status()).toBe(200);

  await expect(page).toHaveURL(/\/dashboard$/);

  // React stores authentication in memory.
  // Use sidebar links instead of page.goto().

  const sidebar = page.getByRole("complementary", {
    name: "Sidebar",
  });

  if (role === "Admin") {
    await sidebar
      .getByRole("button", {
        name: "Inventory",
        exact: true,
      })
      .click();
  }

  const [res] = await Promise.all([
    page.waitForResponse((r) =>
      isResponse(r, pathFor(mode))
    ),

    sidebar
      .getByRole("link", {
        name: titleFor(mode),
        exact: true,
      })
      .click(),
  ]);

  await expect(page).toHaveURL(
    new RegExp(
      `/${mode === "inventory" ? "inventory" : "low-stock"}$`
    )
  );

  await expect(
    page.getByRole("heading", {
      name: titleFor(mode),
      level: 1,
    })
  ).toBeVisible();

  return res;
}

async function reload(page, mode) {
  const [res] = await Promise.all([
    page.waitForResponse((r) =>
      isResponse(r, pathFor(mode))
    ),

    page
      .getByRole("button", {
        name: `Reload ${titleFor(mode).toLowerCase()}`,
      })
      .click(),
  ]);

  return res;
}

async function sortTwice(page, label) {
  const sortButton = page.getByRole("button", {
    name: new RegExp(`^${label}: sort `, "i"),
  });

  const header = sortButton.locator("..");

  await sortButton.click();

  await expect(header).toHaveAttribute(
    "aria-sort",
    /ascending|descending/
  );

  const first = await header.getAttribute("aria-sort");

  await sortButton.click();

  expect(
    await header.getAttribute("aria-sort")
  ).not.toBe(first);
}

// ============================================
// SECTION 1 â€” AVAILABLE INVENTORY
// ============================================

test.describe("Available Inventory - Real Workflows", () => {

  for (const role of ["Admin", "Pharmacist"]) {
    test(`${role} can open available inventory`, async ({
      page,
      request,
    }) => {
      const med = await seedStock(request);

      const res = await loginAndOpen(
        page,
        "inventory",
        role
      );

      expect(res.status()).toBe(200);

      await expect(
        rowFor(page, "inventory", med.name)
      ).toBeVisible();
    });
  }

  test("shows medicine, manufacturer, category, and stock", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 17,
      category: "Capsule",
    });

    await loginAndOpen(page);

    const row = rowFor(page, "inventory", med.name);

    await expect(row).toContainText(med.mfName);

    await expect(
      row.locator("td").nth(2)
    ).toHaveText("Capsule");

    await expect(
      row.locator("td").nth(3)
    ).toHaveText("17");
  });

  test("sums stock from two active batches", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 7,
    });

    await addBatch(request, med, {
      quantity: 8,
      days: 20,
    });

    await loginAndOpen(page);

    const row = rowFor(page, "inventory", med.name);

    await expect(
      row.locator("td").nth(3)
    ).toHaveText("15");

    await expect(row).toContainText(
      "View batches (2)"
    );
  });

  test("searches medicine names", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await loginAndOpen(page);

    await search(page).fill(med.name);

    await expect(
      rowFor(page, "inventory", med.name)
    ).toBeVisible();

    await expect(
      page
        .getByRole("region", {
          name: "Available Inventory",
        })
        .locator("tbody tr")
    ).toHaveCount(1);
  });

  test("searches manufacturer names", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await loginAndOpen(page);

    await search(page).fill(med.mfName);

    await expect(
      rowFor(page, "inventory", med.name)
    ).toBeVisible();
  });

  test("searches batch numbers", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await loginAndOpen(page);

    await search(page).fill(med.batch.number);

    await expect(
      rowFor(page, "inventory", med.name)
    ).toBeVisible();
  });

  test("search ignores case and surrounding spaces", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await loginAndOpen(page);

    await search(page).fill(
      `  ${med.name.toUpperCase()}  `
    );

    await expect(
      rowFor(page, "inventory", med.name)
    ).toBeVisible();
  });

  test("unknown search shows no matching medicines", async ({
    page,
    request,
  }) => {
    await seedStock(request);

    await loginAndOpen(page);

    await search(page).fill(
      "never-matching-e2e-inventory-xyz"
    );

    await expect(
      page.getByRole("heading", {
        name: "No matching medicines",
      })
    ).toBeVisible();
  });

  test("Clear filters restores inventory", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await loginAndOpen(page);

    await search(page).fill(
      "never-matching-e2e-inventory-xyz"
    );

    await page
      .getByRole("button", {
        name: "Clear filters",
      })
      .last()
      .click();

    await expect(search(page)).toHaveValue("");

    await expect(
      rowFor(page, "inventory", med.name)
    ).toBeVisible();
  });

  test("filters by category", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      category: "Syrup",
    });

    await loginAndOpen(page);

    await search(page).fill(med.name);

    await page
      .getByRole("combobox", {
        name: "Category",
      })
      .selectOption("Syrup");

    await expect(
      rowFor(page, "inventory", med.name)
    ).toBeVisible();

    await page
      .getByRole("combobox", {
        name: "Category",
      })
      .selectOption("Tablet");

    await expect(
      page.getByRole("heading", {
        name: "No matching medicines",
      })
    ).toBeVisible();
  });

  test("filters by manufacturer", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await loginAndOpen(page);

    await search(page).fill(med.name);

    await page
      .getByRole("combobox", {
        name: "Manufacturer",
      })
      .selectOption(String(med.mfId));

    await expect(
      rowFor(page, "inventory", med.name)
    ).toBeVisible();
  });

  test("Within 10 days shows soon-expiring medicine", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      days: 5,
    });

    await loginAndOpen(page);

    await search(page).fill(med.name);

    await page
      .getByRole("combobox", {
        name: "Expiry",
      })
      .selectOption("Soon");

    await expect(
      rowFor(page, "inventory", med.name)
    ).toBeVisible();
  });

  test("Within 10 days excludes later-expiring medicine", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      days: 90,
    });

    await loginAndOpen(page);

    await search(page).fill(med.name);

    await page
      .getByRole("combobox", {
        name: "Expiry",
      })
      .selectOption("Soon");

    await expect(
      page.getByRole("heading", {
        name: "No matching medicines",
      })
    ).toBeVisible();
  });

  test("combines search, category, manufacturer and expiry", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      category: "Drops",
      days: 3,
    });

    await loginAndOpen(page);

    await search(page).fill(med.name);

    await page
      .getByRole("combobox", {
        name: "Category",
      })
      .selectOption("Drops");

    await page
      .getByRole("combobox", {
        name: "Manufacturer",
      })
      .selectOption(String(med.mfId));

    await page
      .getByRole("combobox", {
        name: "Expiry",
      })
      .selectOption("Soon");

    await expect(
      rowFor(page, "inventory", med.name)
    ).toBeVisible();
  });

  test("summary remains unchanged when searching", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await loginAndOpen(page);

    await expect(
      rowFor(page, "inventory", med.name)
    ).toBeVisible();

    const before = await summary(page).innerText();

    await search(page).fill(med.name);

    await expect.poll(() => summary(page).innerText()).toBe(before);
  });

  // SORTING TESTS

  for (const label of [
    "Medicine",
    "Manufacturer",
    "Category",
    "Available stock",
    "Earliest expiry",
  ]) {
    test(`sorts ${label} ascending and descending`, async ({
      page,
      request,
    }) => {
      await seedStock(request);

      await loginAndOpen(page);

      await sortTwice(page, label);
    });
  }

  // BATCH DETAILS

  test("batch modal shows batch number, price and stock", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 12,
    });

    await loginAndOpen(page);

    await rowFor(page, "inventory", med.name)
      .getByRole("button", {
        name: `View available batches for ${med.name}`,
      })
      .click();

    const box = page.getByRole("dialog", {
      name: "Available batches",
    });

    await expect(box).toContainText(med.batch.number);
    await expect(box).toContainText("24.50");
    await expect(box).toContainText("12");
  });

  test("batch modal orders batches by earliest expiry", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 8,
      days: 90,
    });

    const earlier = await addBatch(request, med, {
      quantity: 6,
      days: 5,
    });

    await loginAndOpen(page);

    await rowFor(page, "inventory", med.name)
      .getByRole("button", {
        name: `View available batches for ${med.name}`,
      })
      .click();

    const numbers = await page
      .getByRole("dialog", {
        name: "Available batches",
      })
      .locator("tbody td:first-child")
      .allTextContents();

    expect(numbers.map((x) => x.trim())).toEqual([
      earlier.number,
      med.batch.number,
    ]);
  });

  for (const closeBy of [
    "Close button",
    "Escape key",
    "Close dialog button",
  ]) {
    test(`batch modal closes using ${closeBy}`, async ({
      page,
      request,
    }) => {
      const med = await seedStock(request);

      await loginAndOpen(page);

      await rowFor(page, "inventory", med.name)
        .getByRole("button", {
          name: `View available batches for ${med.name}`,
        })
        .click();

      const box = page.getByRole("dialog", {
        name: "Available batches",
      });

      await expect(box).toBeVisible();

      if (closeBy === "Escape key") {
        await page.keyboard.press("Escape");
      } else {
        await box
          .getByRole("button", {
            name:
              closeBy === "Close button"
                ? "Close"
                : "Close dialog",
            exact: true,
          })
          .click();
      }

      await expect(box).toHaveCount(0);
    });
  }

  // STOCK UPDATES

  test("Reload fetches fresh inventory", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await loginAndOpen(page);

    const res = await reload(page, "inventory");

    expect(res.status()).toBe(200);

    await expect(
      rowFor(page, "inventory", med.name)
    ).toBeVisible();
  });

  test("stock increase becomes visible after reload", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 10,
    });

    await loginAndOpen(page);

    const changed = await request.patch(
      `${API}/batches/${med.batch.id}/stock`,
      {
        headers: headers(med.token),
        data: { quantity: 5 },
      }
    );

    expect(changed.status()).toBe(200);

    await reload(page, "inventory");

    await expect(
      rowFor(page, "inventory", med.name)
        .locator("td")
        .nth(3)
    ).toHaveText("15");
  });

  test("stock decrease becomes visible after reload", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 10,
    });

    await loginAndOpen(page);

    const changed = await request.patch(
      `${API}/batches/${med.batch.id}/stock`,
      {
        headers: headers(med.token),
        data: { quantity: -3 },
      }
    );

    expect(changed.status()).toBe(200);

    await reload(page, "inventory");

    await expect(
      rowFor(page, "inventory", med.name)
        .locator("td")
        .nth(3)
    ).toHaveText("7");
  });

  test("deactivated batch is excluded from available stock", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 7,
    });

    const extra = await addBatch(request, med, {
      quantity: 8,
    });

    await loginAndOpen(page);

    const changed = await request.patch(
      `${API}/batches/${extra.id}/deactivate`,
      {
        headers: headers(med.token),
      }
    );

    expect(changed.status()).toBe(200);

    await reload(page, "inventory");

    await expect(
      rowFor(page, "inventory", med.name)
        .locator("td")
        .nth(3)
    ).toHaveText("7");
  });

  test("search filter persists after Reload", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await loginAndOpen(page);

    await search(page).fill(med.name);

    await reload(page, "inventory");

    await expect(search(page)).toHaveValue(med.name);

    await expect(
      rowFor(page, "inventory", med.name)
    ).toBeVisible();
  });
});

// ============================================
// SECTION 2 â€” LOW STOCK
// ============================================

test.describe("Low Stock - Real Workflows", () => {

  for (const role of ["Admin", "Pharmacist"]) {
    test(`${role} can open Low Stock`, async ({
      page,
      request,
    }) => {
      const med = await seedStock(request, {
        quantity: 4,
        reorder: 10,
      });

      const res = await loginAndOpen(
        page,
        "low-stock",
        role
      );

      expect(res.status()).toBe(200);

      await expect(
        rowFor(page, "low-stock", med.name)
      ).toBeVisible();
    });
  }

  test("medicine without batches appears Out of stock", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      withBatch: false,
      reorder: 10,
    });

    await loginAndOpen(page, "low-stock");

    const row = rowFor(page, "low-stock", med.name);

    await expect(
      row.locator("td").nth(3)
    ).toHaveText("0");

    await expect(row).toContainText("Out of stock");
  });

  test("shows low stock quantity and units to threshold", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 4,
      reorder: 10,
    });

    await loginAndOpen(page, "low-stock");

    const row = rowFor(page, "low-stock", med.name);

    await expect(
      row.locator("td").nth(3)
    ).toHaveText("4");

    await expect(
      row.locator("td").nth(4)
    ).toHaveText("10");

    await expect(
      row.locator("td").nth(5)
    ).toContainText("6");

    await expect(row).toContainText("Low stock");
  });

  test("medicine at reorder level is included", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 10,
      reorder: 10,
    });

    await loginAndOpen(page, "low-stock");

    await expect(
      rowFor(page, "low-stock", med.name)
    ).toContainText("At reorder level");
  });

  test("medicine above reorder level is excluded", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 20,
      reorder: 10,
    });

    await loginAndOpen(page, "low-stock");

    await expect(
      rowFor(page, "low-stock", med.name)
    ).toHaveCount(0);
  });

  test("searches low stock by medicine", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 3,
    });

    await loginAndOpen(page, "low-stock");

    await search(page).fill(med.name);

    await expect(
      rowFor(page, "low-stock", med.name)
    ).toBeVisible();
  });

  test("searches low stock by manufacturer", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 3,
    });

    await loginAndOpen(page, "low-stock");

    await search(page).fill(med.mfName);

    await expect(
      rowFor(page, "low-stock", med.name)
    ).toBeVisible();
  });

  test("low stock search ignores case", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 3,
    });

    await loginAndOpen(page, "low-stock");

    await search(page).fill(med.name.toUpperCase());

    await expect(
      rowFor(page, "low-stock", med.name)
    ).toBeVisible();
  });

  test("unknown low-stock search shows No matching medicines", async ({
    page,
    request,
  }) => {
    await seedStock(request, {
      quantity: 2,
    });

    await loginAndOpen(page, "low-stock");

    await search(page).fill(
      "never-matching-e2e-low-xyz"
    );

    await expect(
      page.getByRole("heading", {
        name: "No matching medicines",
      })
    ).toBeVisible();
  });

  test("Clear filters restores low-stock list", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 3,
    });

    await loginAndOpen(page, "low-stock");

    await search(page).fill(
      "never-matching-e2e-low-xyz"
    );

    await page
      .getByRole("button", {
        name: "Clear filters",
      })
      .last()
      .click();

    await expect(search(page)).toHaveValue("");

    await expect(
      rowFor(page, "low-stock", med.name)
    ).toBeVisible();
  });

  test("Out of stock condition shows zero stock", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      withBatch: false,
    });

    await loginAndOpen(page, "low-stock");

    await search(page).fill(med.name);

    await page
      .getByRole("combobox", {
        name: "Stock condition",
      })
      .selectOption("Out");

    await expect(
      rowFor(page, "low-stock", med.name)
    ).toBeVisible();
  });

  test("Low stock above zero condition excludes zero stock", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      withBatch: false,
    });

    await loginAndOpen(page, "low-stock");

    await search(page).fill(med.name);

    await page
      .getByRole("combobox", {
        name: "Stock condition",
      })
      .selectOption("Low");

    await expect(
      page.getByRole("heading", {
        name: "No matching medicines",
      })
    ).toBeVisible();
  });

  test("Low stock above zero includes low positive stock", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 4,
    });

    await loginAndOpen(page, "low-stock");

    await search(page).fill(med.name);

    await page
      .getByRole("combobox", {
        name: "Stock condition",
      })
      .selectOption("Low");

    await expect(
      rowFor(page, "low-stock", med.name)
    ).toBeVisible();
  });

  test("filters low stock by category", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 5,
      category: "Injection",
    });

    await loginAndOpen(page, "low-stock");

    await search(page).fill(med.name);

    await page
      .getByRole("combobox", {
        name: "Category",
      })
      .selectOption("Injection");

    await expect(
      rowFor(page, "low-stock", med.name)
    ).toBeVisible();

    await page
      .getByRole("combobox", {
        name: "Category",
      })
      .selectOption("Tablet");

    await expect(
      page.getByRole("heading", {
        name: "No matching medicines",
      })
    ).toBeVisible();
  });

  test("filters low stock by manufacturer", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 5,
    });

    await loginAndOpen(page, "low-stock");

    await search(page).fill(med.name);

    await page
      .getByRole("combobox", {
        name: "Manufacturer",
      })
      .selectOption(String(med.mfId));

    await expect(
      rowFor(page, "low-stock", med.name)
    ).toBeVisible();
  });

  test("combines low stock search, category, manufacturer and condition", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 5,
      category: "Ointment",
    });

    await loginAndOpen(page, "low-stock");

    await search(page).fill(med.name);

    await page
      .getByRole("combobox", {
        name: "Category",
      })
      .selectOption("Ointment");

    await page
      .getByRole("combobox", {
        name: "Manufacturer",
      })
      .selectOption(String(med.mfId));

    await page
      .getByRole("combobox", {
        name: "Stock condition",
      })
      .selectOption("Low");

    await expect(
      rowFor(page, "low-stock", med.name)
    ).toBeVisible();
  });

  test("low stock summary remains unchanged when filtered", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 5,
    });

    await loginAndOpen(page, "low-stock");

    await expect(
      rowFor(page, "low-stock", med.name)
    ).toBeVisible();

    const before = await summary(page).innerText();

    await search(page).fill(med.name);

    await expect.poll(() => summary(page).innerText()).toBe(before);
  });

  // LOW STOCK SORTING

  for (const label of [
    "Medicine",
    "Manufacturer",
    "Category",
    "Available stock",
    "Reorder level",
    "Units to threshold",
  ]) {
    test(`sorts low stock by ${label} both directions`, async ({
      page,
      request,
    }) => {
      await seedStock(request, {
        quantity: 4,
      });

      await loginAndOpen(page, "low-stock");

      await sortTwice(page, label);
    });
  }

  test("Low Stock has no View batches controls", async ({
    page,
    request,
  }) => {
    await seedStock(request, {
      quantity: 4,
    });

    await loginAndOpen(page, "low-stock");

    await expect(
      page.getByRole("button", {
        name: /View available batches for/i,
      })
    ).toHaveCount(0);
  });

  test("Reload removes medicine after stock rises above reorder level", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 5,
      reorder: 10,
    });

    await loginAndOpen(page, "low-stock");

    await expect(
      rowFor(page, "low-stock", med.name)
    ).toBeVisible();

    const changed = await request.patch(
      `${API}/batches/${med.batch.id}/stock`,
      {
        headers: headers(med.token),
        data: { quantity: 6 },
      }
    );

    expect(changed.status()).toBe(200);

    await reload(page, "low-stock");

    await expect(
      rowFor(page, "low-stock", med.name)
    ).toHaveCount(0);
  });

  test("Reload adds medicine that falls below reorder level", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 15,
      reorder: 10,
    });

    await loginAndOpen(page, "low-stock");

    await expect(
      rowFor(page, "low-stock", med.name)
    ).toHaveCount(0);

    const changed = await request.patch(
      `${API}/batches/${med.batch.id}/stock`,
      {
        headers: headers(med.token),
        data: { quantity: -7 },
      }
    );

    expect(changed.status()).toBe(200);

    await reload(page, "low-stock");

    await expect(
      rowFor(page, "low-stock", med.name)
        .locator("td")
        .nth(3)
    ).toHaveText("8");
  });

  test("inactive medicine does not appear in Low Stock", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 3,
    });

    const changed = await request.patch(
      `${API}/medicines/${med.id}/deactivate`,
      {
        headers: headers(med.token),
      }
    );

    expect(changed.status()).toBe(200);

    await loginAndOpen(page, "low-stock");

    await expect(
      rowFor(page, "low-stock", med.name)
    ).toHaveCount(0);
  });

  test("inactive manufacturer is excluded from Low Stock", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      quantity: 3,
    });

    const changed = await request.patch(
      `${API}/manufacturers/${med.mfId}/deactivate`,
      {
        headers: headers(med.token),
      }
    );

    expect(changed.status()).toBe(200);

    await loginAndOpen(page, "low-stock");

    await expect(
      rowFor(page, "low-stock", med.name)
    ).toHaveCount(0);
  });
});

// ============================================
// SECTION 3 â€” API ERRORS AND AUTHORIZATION
// ============================================

test.describe("Inventory and Low Stock - Error Handling", () => {

  for (const mode of ["inventory", "low-stock"]) {

    test(`${mode}: empty API list displays empty state`, async ({
      page,
    }) => {
      await page.route(
        `${API}${pathFor(mode)}`,
        async (route) => {
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

      await loginAndOpen(page, mode);

      await expect(
        page.getByRole("heading", {
          name:
            mode === "inventory"
              ? "No available inventory"
              : "No low-stock medicines found",
        })
      ).toBeVisible();
    });

    test(`${mode}: HTTP 500 shows error; Reload recovers`, async ({
      page,
      request,
    }) => {
      const med = await seedStock(request, {
        quantity: 5,
      });

      await page.route(
        `${API}${pathFor(mode)}`,
        async (route) => {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({
              success: false,
              message: "E2E temporary inventory error",
            }),
          });
        }
      );

      await loginAndOpen(page, mode);

      await expect(
        page.getByRole("alert")
      ).toContainText("E2E temporary inventory error");

      await page.unroute(`${API}${pathFor(mode)}`);

      const res = await reload(page, mode);

      expect(res.status()).toBe(200);

      await expect(
        rowFor(page, mode, med.name)
      ).toBeVisible();
    });

    test(`${mode}: invalid API data displays error`, async ({
      page,
    }) => {
      await page.route(
        `${API}${pathFor(mode)}`,
        async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              data: { bad: "shape" },
            }),
          });
        }
      );

      await loginAndOpen(page, mode);

      await expect(
        page.getByRole("alert")
      ).toContainText(
        mode === "inventory"
          ? "invalid inventory list"
          : "invalid low-stock list"
      );
    });

    test(`${mode}: missing token is rejected`, async ({
      request,
    }) => {
      const res = await request.get(
        `${API}${pathFor(mode)}`
      );

      expect(res.status()).toBe(401);
    });

    test(`${mode}: invalid token is rejected`, async ({
      request,
    }) => {
      const res = await request.get(
        `${API}${pathFor(mode)}`,
        {
          headers: {
            Authorization: "Bearer bad.e2e.token",
          },
        }
      );

      expect(res.status()).toBe(401);
    });

    test(`${mode}: Customer cannot call restricted API`, async ({
      request,
    }) => {
      const token = await tokenFor(request, "Customer");

      const res = await request.get(
        `${API}${pathFor(mode)}`,
        {
          headers: headers(token),
        }
      );

      expect(res.status()).toBe(403);
    });
  }
});

