
import { test, expect } from "@playwright/test";

// ============================================
// MODULE 8 — SALES E2E TESTING
// 77 TEST CASES
// ============================================

const API = (
  process.env.E2E_API_BASE_URL ||
  "http://127.0.0.1:5000"
).replace(/\/+$/, "");

const USERS = {
  Admin: [
    process.env.E2E_ADMIN_EMAIL,
    process.env.E2E_ADMIN_PASSWORD,
  ],
  Pharmacist: [
    process.env.E2E_PHARMACIST_EMAIL,
    process.env.E2E_PHARMACIST_PASSWORD,
  ],
  Customer: [
    process.env.E2E_CUSTOMER_EMAIL,
    process.env.E2E_CUSTOMER_PASSWORD,
  ],
};

let serial = 0;

const unique = (prefix) =>
  `${prefix}-${process.pid}-${Date.now().toString(36)}-${++serial}`;

const auth = (token) => ({
  Authorization: `Bearer ${token}`,
});

const matchAPI = (res, path, method = "GET") =>
  new URL(res.url()).pathname === path &&
  res.request().method() === method;

const clickButton = (area, name) =>
  area.getByRole("button", {
    name,
    exact: true,
  });

const futureDate = (days = 90) => {
  const d = new Date();

  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);

  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`
  );
};

// ============================================
// REUSABLE API HELPERS
// ============================================

async function tokenFor(request, role = "Admin") {
  const [email, password] = USERS[role];

  expect(
    email && password,
    `${role} credentials are missing`
  ).toBeTruthy();

  const res = await request.post(`${API}/users/login`, {
    data: { email, password },
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

  const mfName = unique("E2E-SALES-MF");

  const createdMF = await request.post(
    `${API}/manufacturers`,
    {
      headers: auth(token),
      data: { name: mfName },
    }
  );

  expect(
    [200, 201],
    await createdMF.text()
  ).toContain(createdMF.status());

  const mfs = await request.get(
    `${API}/manufacturers`,
    {
      headers: auth(token),
    }
  );

  expect(mfs.status()).toBe(200);

  const mf = (await mfs.json()).data.find(
    (x) => x.name === mfName
  );

  expect(mf?.manufacturer_id).toBeTruthy();

  const name = unique("E2E-SALES-MED");

  const createdMED = await request.post(
    `${API}/medicines`,
    {
      headers: auth(token),
      data: {
        name,
        manufacturer_id: mf.manufacturer_id,
        category,
        reorder_level: reorder,
      },
    }
  );

  expect(
    [200, 201],
    await createdMED.text()
  ).toContain(createdMED.status());

  const meds = await request.get(
    `${API}/medicines`,
    {
      headers: auth(token),
    }
  );

  expect(meds.status()).toBe(200);

  const med = (await meds.json()).data.find(
    (x) => x.name === name
  );

  expect(med?.medicine_id).toBeTruthy();

  return {
    id: Number(med.medicine_id),
    name,
    category,
    mfName,
    token,
  };
}

async function addBatch(
  request,
  med,
  { stock = 10, price = 15.75, days = 90 } = {}
) {
  const number = unique("E2E-SALES-B");

  const res = await request.post(`${API}/batches`, {
    headers: auth(med.token),
    data: {
      medicine_id: med.id,
      batch_number: number,
      purchase_price: 10,
      selling_price: price,
      stock_quantity: stock,
      expiry_date: futureDate(days),
    },
  });

  expect(
    [200, 201],
    await res.text()
  ).toContain(res.status());

  const list = await request.get(
    `${API}/batches/medicine/${med.id}`,
    {
      headers: auth(med.token),
    }
  );

  expect(list.status()).toBe(200);

  const batch = (await list.json()).data.find(
    (x) => x.batch_number === number
  );

  expect(batch?.batch_id).toBeTruthy();

  return {
    id: Number(batch.batch_id),
    number,
    stock,
    price,
    med,
  };
}

async function seedStock(request, opts = {}) {
  const med = await seedMedicine(request, opts);
  const batch = await addBatch(request, med, opts);

  return {
    ...med,
    batch,
  };
}

async function stockOf(request, med, batch) {
  const res = await request.get(
    `${API}/batches/medicine/${med.id}`,
    {
      headers: auth(med.token),
    }
  );

  expect(res.status()).toBe(200);

  const record = (await res.json()).data.find(
    (x) => Number(x.batch_id) === batch.id
  );

  expect(record).toBeTruthy();

  return Number(record.stock_quantity);
}

async function seedSale(
  request,
  {
    mode = "Cash",
    quantity = 2,
    customerId = null,
  } = {}
) {
  const med = await seedStock(request);
  const token = await tokenFor(request, "Pharmacist");

  const response = await request.post(`${API}/sales`, {
    headers: auth(token),
    data: {
      customer_id: customerId,
      payment_mode: mode,
      items: [
        {
          batch_id: med.batch.id,
          quantity,
        },
      ],
    },
  });

  expect(
    [200, 201],
    await response.text()
  ).toContain(response.status());

  const data = (await response.json()).data;

  expect(
    Number(data?.sale_id)
  ).toBeGreaterThan(0);

  return {
    saleId: Number(data.sale_id),
    total: Number(data.total_amount),
    med,
    mode,
    quantity,
  };
}

// ============================================
// LOGIN AND NAVIGATION
// ============================================

async function loginAndVisit(
  page,
  role,
  linkName,
  path
) {
  const [email, password] = USERS[role];

  expect(email && password).toBeTruthy();

  await page.goto("/login");

  await page
    .getByLabel("Email address")
    .fill(email);

  await page
    .getByLabel("Password", { exact: true })
    .fill(password);

  const [login] = await Promise.all([
    page.waitForResponse((r) =>
      matchAPI(r, "/users/login", "POST")
    ),
    clickButton(page, "Sign In").click(),
  ]);

  expect(login.status()).toBe(200);

  await expect(page).toHaveURL(/\/dashboard$/);

  // Authentication is stored in React memory.
  // Navigate with sidebar links, not page.goto().

  const sidebar = page.getByRole("complementary", {
    name: "Sidebar",
  });

  const [loaded] = await Promise.all([
    page.waitForResponse((r) =>
      matchAPI(
        r,
        path === "/sales/new"
          ? "/batches/inventory"
          : "/sales"
      )
    ),
    sidebar
      .getByRole("link", {
        name: linkName,
        exact: true,
      })
      .click(),
  ]);

  await expect(page).toHaveURL(
    new RegExp(`${path.replaceAll("/", "\\/")}$`)
  );

  await expect(
    page.getByRole("heading", {
      name: linkName,
      level: 1,
    })
  ).toBeVisible();

  return loaded;
}

const openNewSale = (page) =>
  loginAndVisit(
    page,
    "Pharmacist",
    "New Sale",
    "/sales/new"
  );

const openHistory = (page) =>
  loginAndVisit(
    page,
    "Admin",
    "Sales History",
    "/sales"
  );

const availableRow = (page, batch) =>
  page
    .locator(
      '[aria-label="Available batches table"] tbody tr'
    )
    .filter({
      hasText: batch.number,
    });

const saleForm = (page) =>
  page.locator("form").filter({
    has: page.getByRole("heading", {
      name: "Current sale",
    }),
  });

const quantityInput = (page, batch) =>
  page.locator(`#quantity-${batch.id}`);

const completeButton = (page) =>
  clickButton(saleForm(page), "Complete sale");

const saleRow = (page, saleId) =>
  page
    .locator(
      '[role="region"][aria-label="Recorded sales"] tbody tr'
    )
    .filter({
      has: page.getByRole("cell", {
        name: `#${saleId}`,
        exact: true,
      }),
    });

async function addToCart(
  page,
  batch,
  times = 1
) {
  for (let i = 0; i < times; i++) {
    await clickButton(
      availableRow(page, batch),
      `Add ${batch.med.name}, batch ${batch.number}`
    ).click();
  }

  await expect(
    quantityInput(page, batch)
  ).toHaveValue(String(times));
}

async function completeSaleUI(
  page,
  { mode = "Cash" } = {}
) {
  await saleForm(page)
    .getByLabel("Payment mode")
    .selectOption(mode);

  const [res] = await Promise.all([
    page.waitForResponse((r) =>
      matchAPI(r, "/sales", "POST")
    ),
    completeButton(page).click(),
  ]);

  expect(
    [200, 201],
    await res.text()
  ).toContain(res.status());

  const saved = (await res.json()).data;

  await expect(
    page.getByRole("heading", {
      name: "Sale completed successfully",
    })
  ).toBeVisible();

  return {
    id: Number(saved.sale_id),
    total: Number(saved.total_amount),
  };
}

async function reloadStock(page) {
  const [res] = await Promise.all([
    page.waitForResponse((r) =>
      matchAPI(r, "/batches/inventory")
    ),
    clickButton(
      page,
      "Reload available stock"
    ).click(),
  ]);

  return res;
}

// =========================================================
// SECTION 1 — PHARMACIST: NEW SALE AND CART
// TESTS 01–26
// =========================================================

test.describe("Sales - New Sale and Cart", () => {

  test("01 Pharmacist opens New Sale with walk-in, Cash and empty cart", async ({
    page,
  }) => {
    const res = await openNewSale(page);

    expect(res.status()).toBe(200);

    await expect(
      page.getByRole("radio", {
        name: "Walk-in",
      })
    ).toBeChecked();

    await expect(
      saleForm(page).getByLabel("Payment mode")
    ).toHaveValue("Cash");

    await expect(
      completeButton(page)
    ).toBeDisabled();

    await expect(
      page.getByText(
        "Add a medicine batch to start this sale."
      )
    ).toBeVisible();
  });

  test("02 Available batch displays medicine, manufacturer, stock and price", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      stock: 12,
      price: 25.25,
    });

    await openNewSale(page);

    const row = availableRow(page, med.batch);

    await expect(row).toContainText(med.name);
    await expect(row).toContainText(med.mfName);
    await expect(row).toContainText("12");
    await expect(row).toContainText("25.25");
  });

  for (const [num, field] of [
    [3, "medicine"],
    [4, "manufacturer"],
    [5, "batch"],
    [6, "category"],
  ]) {
    test(`${String(num).padStart(2, "0")} Search available stock by ${field}`, async ({
      page,
      request,
    }) => {
      const med = await seedStock(request, {
        category: "Capsule",
      });

      await openNewSale(page);

      const term =
        field === "medicine"
          ? med.name
          : field === "manufacturer"
            ? med.mfName
            : field === "batch"
              ? med.batch.number
              : med.category;

      await page
        .getByLabel("Search available stock")
        .fill(term);

      await expect(
        availableRow(page, med.batch)
      ).toBeVisible();
    });
  }

  test("07 Search is case insensitive and trims whitespace", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await openNewSale(page);

    await page
      .getByLabel("Search available stock")
      .fill(`  ${med.name.toUpperCase()}  `);

    await expect(
      availableRow(page, med.batch)
    ).toBeVisible();
  });

  test("08 Unknown search shows no matching batches", async ({
    page,
  }) => {
    await openNewSale(page);

    await page
      .getByLabel("Search available stock")
      .fill("no-such-e2e-sale-batch-xyz");

    await expect(
      page.getByText(
        "No batches match your search."
      )
    ).toBeVisible();
  });

  test("09 Reload available stock fetches updated inventory", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await openNewSale(page);

    const res = await reloadStock(page);

    expect(res.status()).toBe(200);

    await expect(
      availableRow(page, med.batch)
    ).toBeVisible();
  });

  test("10 Empty inventory disables adding stock", async ({
    page,
  }) => {
    await page.route(
      `${API}/batches/inventory`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: [],
          }),
        })
    );

    await openNewSale(page);

    await expect(
      page.getByText(
        "No stock is currently available for sale."
      )
    ).toBeVisible();

    await expect(
      completeButton(page)
    ).toBeDisabled();
  });

  test("11 Adding a batch creates one cart item with quantity 1", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await openNewSale(page);

    await addToCart(page, med.batch);

    await expect(
      completeButton(page)
    ).toBeEnabled();

    await expect(
      saleForm(page)
    ).toContainText(med.batch.number);
  });

  test("12 Clicking Add twice increases quantity, not number of cart rows", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await openNewSale(page);

    await addToCart(page, med.batch, 2);

    await expect(
      saleForm(page).getByRole("button", {
        name: /Remove .*batch/,
      })
    ).toHaveCount(1);
  });

  test("13 Add is disabled when stock limit is reached", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      stock: 1,
    });

    await openNewSale(page);

    await addToCart(page, med.batch);

    await expect(
      clickButton(
        availableRow(page, med.batch),
        `Add ${med.name}, batch ${med.batch.number}`
      )
    ).toBeDisabled();
  });

  test("14 Remove deletes cart item and disables checkout", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await openNewSale(page);

    await addToCart(page, med.batch);

    await clickButton(
      saleForm(page),
      `Remove ${med.name}, batch ${med.batch.number}`
    ).click();

    await expect(
      quantityInput(page, med.batch)
    ).toHaveCount(0);

    await expect(
      completeButton(page)
    ).toBeDisabled();
  });

  test("15 Clear cart removes all selected batches", async ({
    page,
    request,
  }) => {
    const a = await seedStock(request);

    const b = await addBatch(request, a, {
      price: 20,
    });

    await openNewSale(page);

    await addToCart(page, a.batch);
    await addToCart(page, b);

    await clickButton(
      saleForm(page),
      "Clear cart"
    ).click();

    await expect(
      quantityInput(page, a.batch)
    ).toHaveCount(0);

    await expect(
      quantityInput(page, b)
    ).toHaveCount(0);

    await expect(
      completeButton(page)
    ).toBeDisabled();
  });

  test("16 Quantity changes total units and estimated total", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      price: 15.75,
    });

    await openNewSale(page);

    await addToCart(page, med.batch);

    await quantityInput(page, med.batch).fill("3");

    await expect(
      saleForm(page)
        .getByText("Total units")
        .locator("..")
    ).toContainText("3");

    await expect(
      saleForm(page)
        .getByText("Estimated total")
        .locator("..")
    ).toContainText("47.25");
  });

  test("17 Cart sums different batch prices without floating-point drift", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      price: 15.75,
    });

    const second = await addBatch(request, med, {
      price: 20.5,
    });

    await openNewSale(page);

    await addToCart(page, med.batch);
    await addToCart(page, second);

    await quantityInput(page, med.batch).fill("2");

    await expect(
      saleForm(page)
        .getByText("Estimated total")
        .locator("..")
    ).toContainText("52.00");

    await expect(
      saleForm(page)
        .getByText("Total units")
        .locator("..")
    ).toContainText("3");
  });

  for (const [num, value, message] of [
    [18, "", "Enter a whole number greater than zero."],
    [19, "0", "Enter a whole number greater than zero."],
    [20, "-1", "Enter a whole number greater than zero."],
    [21, "1.5", "Enter a whole number greater than zero."],
    [22, "11", "Only 10 units are available."],
  ]) {
    test(`${num} Invalid cart quantity ${JSON.stringify(value)} prevents checkout`, async ({
      page,
      request,
    }) => {
      const med = await seedStock(request, {
        stock: 10,
      });

      await openNewSale(page);

      await addToCart(page, med.batch);

      await quantityInput(page, med.batch).fill(value);

      await expect(
        saleForm(page).getByText(message)
      ).toBeVisible();

      await expect(
        completeButton(page)
      ).toBeDisabled();
    });
  }

  test("23 Correcting quantity re-enables checkout", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await openNewSale(page);

    await addToCart(page, med.batch);

    await quantityInput(page, med.batch).fill("0");

    await expect(
      completeButton(page)
    ).toBeDisabled();

    await quantityInput(page, med.batch).fill("2");

    await expect(
      completeButton(page)
    ).toBeEnabled();
  });

  test("24 Reload reflects reduced stock and invalidates oversized cart", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      stock: 10,
    });

    await openNewSale(page);

    await addToCart(page, med.batch);

    await quantityInput(page, med.batch).fill("7");

    const changed = await request.patch(
      `${API}/batches/${med.batch.id}/stock`,
      {
        headers: auth(med.token),
        data: {
          quantity: -5,
        },
      }
    );

    expect(changed.status()).toBe(200);

    await reloadStock(page);

    await expect(
      saleForm(page).getByText(
        "Only 5 units are available."
      )
    ).toBeVisible();

    await expect(
      completeButton(page)
    ).toBeDisabled();
  });

  test("25 Reload marks a deactivated cart batch unavailable", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await openNewSale(page);

    await addToCart(page, med.batch);

    const changed = await request.patch(
      `${API}/batches/${med.batch.id}/deactivate`,
      {
        headers: auth(med.token),
      }
    );

    expect(changed.status()).toBe(200);

    await reloadStock(page);

    await expect(
      saleForm(page).getByText(
        "This batch is no longer available. Remove it."
      )
    ).toBeVisible();

    await expect(
      completeButton(page)
    ).toBeDisabled();
  });

  test("26 Payment dropdown offers Cash, Card and UPI", async ({
    page,
  }) => {
    await openNewSale(page);

    const control =
      saleForm(page).getByLabel("Payment mode");

    for (const name of ["Cash", "Card", "UPI"]) {
      await expect(
        control.getByRole("option", {
          name,
          exact: true,
        })
      ).toHaveCount(1);

      await control.selectOption(name);

      await expect(control).toHaveValue(name);
    }

    await expect(
      page.getByText(
        /does not collect card or UPI payments/i
      )
    ).toBeVisible();
  });
});

// =========================================================
// SECTION 2 — CUSTOMER SELECTION
// TESTS 27–36
// =========================================================

test.describe("Sales - Customer Selection", () => {

  test("27 Walk-in does not require a customer account", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await openNewSale(page);

    await addToCart(page, med.batch);

    await expect(
      page.getByRole("radio", {
        name: "Walk-in",
      })
    ).toBeChecked();

    await expect(
      completeButton(page)
    ).toBeEnabled();
  });

  test("28 Existing Customer requires explicit selection", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await openNewSale(page);

    await addToCart(page, med.batch);

    await page
      .getByRole("radio", {
        name: "Existing Customer",
      })
      .check();

    await expect(
      completeButton(page)
    ).toBeDisabled();

    await expect(
      page.getByText(
        "Select a customer above or choose Walk-in to continue."
      )
    ).toBeVisible();
  });

  for (const [num, value] of [
    [29, ""],
    [30, "not-an-email"],
  ]) {
    test(`${num} Existing customer search rejects invalid email ${JSON.stringify(value)}`, async ({
      page,
    }) => {
      await openNewSale(page);

      await page
        .getByRole("radio", {
          name: "Existing Customer",
        })
        .check();

      await page
        .getByLabel("Customer email")
        .fill(value);

      await clickButton(
        page,
        "Search customer"
      ).click();

      await expect(
        page.getByRole("alert").filter({
          hasText: "Enter a valid email address.",
        })
      ).toBeVisible();
    });
  }

  test("31 Nonexistent customer offers account creation or walk-in", async ({
    page,
  }) => {
    await openNewSale(page);

    await page
      .getByRole("radio", {
        name: "Existing Customer",
      })
      .check();

    await page
      .getByLabel("Customer email")
      .fill(
        `${unique("notfound")}@example.invalid`
      );

    await clickButton(
      page,
      "Search customer"
    ).click();

    await expect(
      page.getByText(
        "No customer account was found for this email."
      )
    ).toBeVisible();

    await expect(
      clickButton(page, "Create account")
    ).toBeVisible();

    await expect(
      clickButton(page, "Continue as walk-in")
    ).toBeVisible();
  });

  test("32 Existing customer lookup requires clicking Select customer", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await openNewSale(page);

    await addToCart(page, med.batch);

    await page
      .getByRole("radio", {
        name: "Existing Customer",
      })
      .check();

    await page
      .getByLabel("Customer email")
      .fill(USERS.Customer[0]);

    await clickButton(
      page,
      "Search customer"
    ).click();

    await expect(
      page.getByText(
        "Customer found — confirm before selecting"
      )
    ).toBeVisible();

    await expect(
      completeButton(page)
    ).toBeDisabled();

    await clickButton(
      page,
      "Select customer"
    ).click();

    await expect(
      page.getByText("Selected customer")
    ).toBeVisible();

    await expect(
      completeButton(page)
    ).toBeEnabled();
  });

  test("33 Change customer clears the previous selection", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await openNewSale(page);

    await addToCart(page, med.batch);

    await page
      .getByRole("radio", {
        name: "Existing Customer",
      })
      .check();

    await page
      .getByLabel("Customer email")
      .fill(USERS.Customer[0]);

    await clickButton(
      page,
      "Search customer"
    ).click();

    await clickButton(
      page,
      "Select customer"
    ).click();

    await clickButton(
      page,
      "Change customer"
    ).click();

    await expect(
      completeButton(page)
    ).toBeDisabled();

    await expect(
      page.getByLabel("Customer email")
    ).toHaveValue(USERS.Customer[0]);
  });

  test("34 Create Customer rejects invalid email", async ({
    page,
  }) => {
    await openNewSale(page);

    await page
      .getByRole("radio", {
        name: "Create Customer",
      })
      .check();

    await page
      .getByLabel("Customer name")
      .fill(unique("New Customer"));

    await page
      .getByLabel("Customer email")
      .fill("bad-email");

    await clickButton(
      page,
      "Create and select"
    ).click();

    await expect(
      page.getByRole("alert").filter({
        hasText: "Enter a valid email address.",
      })
    ).toBeVisible();
  });

  test("35 Create Customer rejects whitespace-only name", async ({
    page,
  }) => {
    await openNewSale(page);

    await page
      .getByRole("radio", {
        name: "Create Customer",
      })
      .check();

    await page
      .getByLabel("Customer name")
      .fill("   ");

    await page
      .getByLabel("Customer email")
      .fill(
        `${unique("customer")}@example.invalid`
      );

    await clickButton(
      page,
      "Create and select"
    ).click();

    await expect(
      page.getByRole("alert").filter({
        hasText:
          "Enter a customer name of 100 characters or fewer.",
      })
    ).toBeVisible();
  });

  test("36 Create Customer validates names and emails length limits", async ({
    page,
  }) => {
    await openNewSale(page);

    await page
      .getByRole("radio", {
        name: "Create Customer",
      })
      .check();

    await expect(
      page.getByLabel("Customer name")
    ).toHaveAttribute("maxlength", "100");

    await expect(
      page.getByLabel("Customer email")
    ).toHaveAttribute("maxlength", "100");
  });
});

// =========================================================
// SECTION 3 — CHECKOUT, PAYMENTS AND STOCK
// TESTS 37–46
// =========================================================

test.describe("Sales - Checkout and Stock", () => {

  for (const [num, mode] of [
    [37, "Cash"],
    [38, "Card"],
    [39, "UPI"],
  ]) {
    test(`${num} ${mode} checkout succeeds and reduces actual stock`, async ({
      page,
      request,
    }) => {
      const med = await seedStock(request, {
        stock: 10,
        price: 15.75,
      });

      await openNewSale(page);

      await addToCart(page, med.batch);

      await quantityInput(page, med.batch).fill("2");

      const saved = await completeSaleUI(page, {
        mode,
      });

      expect(saved.id).toBeGreaterThan(0);
      expect(saved.total).toBe(31.5);

      expect(
        await stockOf(request, med, med.batch)
      ).toBe(8);

      await expect(
        completeButton(page)
      ).toHaveCount(0);
    });
  }

  test("40 Two batches are saved in one sale with correct total and stock", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request, {
      stock: 10,
      price: 15.75,
    });

    const extra = await addBatch(request, med, {
      stock: 8,
      price: 20.5,
    });

    await openNewSale(page);

    await addToCart(page, med.batch);
    await addToCart(page, extra);

    await quantityInput(page, med.batch).fill("2");

    const saved = await completeSaleUI(page);

    expect(saved.total).toBe(52);

    expect(
      await stockOf(request, med, med.batch)
    ).toBe(8);

    expect(
      await stockOf(request, med, extra)
    ).toBe(7);
  });

  test("41 Start new sale clears cart, payment and reloads stock", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await openNewSale(page);

    await addToCart(page, med.batch);

    await completeSaleUI(page, {
      mode: "UPI",
    });

    const [res] = await Promise.all([
      page.waitForResponse((r) =>
        matchAPI(r, "/batches/inventory")
      ),
      clickButton(
        page,
        "Start new sale"
      ).click(),
    ]);

    expect(res.status()).toBe(200);

    await expect(
      page.getByRole("heading", {
        name: "Sale completed successfully",
      })
    ).toHaveCount(0);

    await expect(
      quantityInput(page, med.batch)
    ).toHaveCount(0);

    await expect(
      saleForm(page).getByLabel("Payment mode")
    ).toHaveValue("Cash");

    await expect(
      completeButton(page)
    ).toBeDisabled();
  });

  test("42 Validation failure from server keeps cart and allows retry", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await openNewSale(page);

    await addToCart(page, med.batch);

    await page.route(
      `${API}/sales`,
      async (route) => {
        if (
          route.request().method() !== "POST"
        ) {
          return route.continue();
        }

        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message:
              "E2E checkout validation failure",
          }),
        });
      }
    );

    await completeButton(page).click();

    await expect(
      page.getByRole("alert").filter({
        hasText: "E2E checkout validation failure",
      })
    ).toBeVisible();

    await expect(
      quantityInput(page, med.batch)
    ).toHaveValue("1");

    await page.unroute(`${API}/sales`);

    await expect(
      completeButton(page)
    ).toBeEnabled();

    await completeSaleUI(page);
  });

  test("43 HTTP 500 makes outcome uncertain and blocks duplicate checkout", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await openNewSale(page);

    await addToCart(page, med.batch);

    await page.route(
      `${API}/sales`,
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
            message: "E2E uncertain sale",
          }),
        });
      }
    );

    await completeButton(page).click();

    await expect(
      page.getByRole("alert")
    ).toContainText(
      "could not confirm whether this sale was saved"
    );

    await expect(
      clickButton(page, "Start a new cart")
    ).toBeDisabled();

    await expect(
      page.getByRole("checkbox", {
        name:
          "I have checked with an admin whether this sale was recorded.",
      })
    ).toBeVisible();

    await page
      .getByRole("checkbox", {
        name:
          "I have checked with an admin whether this sale was recorded.",
      })
      .check();

    await page.unroute(`${API}/sales`);

    await clickButton(
      page,
      "Start a new cart"
    ).click();

    await expect(
      completeButton(page)
    ).toBeDisabled();
  });

  test("44 Malformed success response also activates unknown-outcome protection", async ({
    page,
    request,
  }) => {
    const med = await seedStock(request);

    await openNewSale(page);

    await addToCart(page, med.batch);

    await page.route(
      `${API}/sales`,
      async (route) => {
        if (
          route.request().method() !== "POST"
        ) {
          return route.continue();
        }

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {},
          }),
        });
      }
    );

    await completeButton(page).click();

    await expect(
      page.getByRole("alert")
    ).toContainText(
      "could not confirm whether this sale was saved"
    );

    await expect(
      clickButton(page, "Start a new cart")
    ).toBeDisabled();
  });

  test("45 Server rejects overselling and does not decrease stock", async ({
    request,
  }) => {
    const med = await seedStock(request, {
      stock: 2,
    });

    const token = await tokenFor(
      request,
      "Pharmacist"
    );

    const res = await request.post(
      `${API}/sales`,
      {
        headers: auth(token),
        data: {
          customer_id: null,
          payment_mode: "Cash",
          items: [
            {
              batch_id: med.batch.id,
              quantity: 3,
            },
          ],
        },
      }
    );

    expect([400, 409, 422]).toContain(
      res.status()
    );

    expect(
      await stockOf(request, med, med.batch)
    ).toBe(2);
  });

  test("46 Server rejects an empty cart", async ({
    request,
  }) => {
    const token = await tokenFor(
      request,
      "Pharmacist"
    );

    const res = await request.post(
      `${API}/sales`,
      {
        headers: auth(token),
        data: {
          customer_id: null,
          payment_mode: "Cash",
          items: [],
        },
      }
    );

    expect(res.status()).toBe(400);
  });
});

// =========================================================
// SECTION 4 — ADMIN SALES HISTORY
// TESTS 47–69
// =========================================================

test.describe("Sales - Admin History", () => {

  test("47 Admin sees a newly recorded sale", async ({
    page,
    request,
  }) => {
    const sale = await seedSale(request);

    const res = await openHistory(page);

    expect(res.status()).toBe(200);

    const row = saleRow(page, sale.saleId);

    await expect(row).toBeVisible();
    await expect(row).toContainText("Cash");
    await expect(row).toContainText("31.50");
  });

  test("48 Walk-in sale displays Walk-in customer", async ({
    page,
    request,
  }) => {
    const sale = await seedSale(request);

    await openHistory(page);

    await expect(
      saleRow(page, sale.saleId)
    ).toContainText("Walk-in customer");
  });

  test("49 Search by exact sale ID", async ({
    page,
    request,
  }) => {
    const sale = await seedSale(request);

    await openHistory(page);

    await page
      .getByLabel("Search sales")
      .fill(String(sale.saleId));

    await expect(
      saleRow(page, sale.saleId)
    ).toBeVisible();
  });

  test("50 Search by pharmacist name", async ({
    page,
    request,
  }) => {
    const sale = await seedSale(request);

    await openHistory(page);

    const row = saleRow(page, sale.saleId);

    const pharmacist = (
      await row.locator("td").nth(2).innerText()
    ).trim();

    expect(
      pharmacist.length
    ).toBeGreaterThan(0);

    await page
      .getByLabel("Search sales")
      .fill(pharmacist);

    await expect(row).toBeVisible();
  });

  test("51 Unknown search shows No matching sales", async ({
    page,
    request,
  }) => {
    await seedSale(request);

    await openHistory(page);

    await page
      .getByLabel("Search sales")
      .fill("never-matching-e2e-sales-xyz");

    await expect(
      page.getByRole("heading", {
        name: "No matching sales",
      })
    ).toBeVisible();
  });

  test("52 Clear filters restores Sales History", async ({
    page,
    request,
  }) => {
    const sale = await seedSale(request);

    await openHistory(page);

    await page
      .getByLabel("Search sales")
      .fill("never-matching-e2e-sales-xyz");

    await clickButton(
      page,
      "Clear filters"
    ).last().click();

    await expect(
      page.getByLabel("Search sales")
    ).toHaveValue("");

    await expect(
      saleRow(page, sale.saleId)
    ).toBeVisible();
  });

  for (const [num, mode] of [
    [53, "Cash"],
    [54, "Card"],
    [55, "UPI"],
  ]) {
    test(`${num} Filter sales by ${mode} payment`, async ({
      page,
      request,
    }) => {
      const sale = await seedSale(request, {
        mode,
      });

      await openHistory(page);

      await page
        .getByLabel("Payment mode")
        .selectOption(mode);

      await page
        .getByLabel("Search sales")
        .fill(String(sale.saleId));

      await expect(
        saleRow(page, sale.saleId)
      ).toBeVisible();

      await page
        .getByLabel("Payment mode")
        .selectOption(
          mode === "Cash" ? "UPI" : "Cash"
        );

      await expect(
        saleRow(page, sale.saleId)
      ).toHaveCount(0);
    });
  }

  test("56 Reload Sales History calls backend again", async ({
    page,
    request,
  }) => {
    const sale = await seedSale(request);

    await openHistory(page);

    const [res] = await Promise.all([
      page.waitForResponse((r) =>
        matchAPI(r, "/sales")
      ),
      clickButton(page, "Reload sales").click(),
    ]);

    expect(res.status()).toBe(200);

    await expect(
      saleRow(page, sale.saleId)
    ).toBeVisible();
  });

  for (const [num, field] of [
    [57, "Sale ID"],
    [58, "Customer"],
    [59, "Pharmacist"],
    [60, "Payment"],
    [61, "Total"],
    [62, "Created"],
  ]) {
    test(`${num} Sort ${field} ascending and descending`, async ({
      page,
      request,
    }) => {
      await seedSale(request);

      await openHistory(page);

      const sortButton = page.getByRole("button", {
        name: new RegExp(
          `^${field}: sort (ascending|descending)$`,
          "i"
        ),
      });

      const header = sortButton.locator("..");

      await sortButton.click();

      await expect(header).toHaveAttribute(
        "aria-sort",
        /ascending|descending/
      );

      const first = await header.getAttribute(
        "aria-sort"
      );

      await sortButton.click();

      expect(
        await header.getAttribute("aria-sort")
      ).not.toBe(first);
    });
  }

  test("63 View details displays medicine, batch, quantity, payment and total", async ({
    page,
    request,
  }) => {
    const sale = await seedSale(request);

    await openHistory(page);

    await clickButton(
      saleRow(page, sale.saleId),
      `View details for sale ${sale.saleId}`
    ).click();

    const box = page.getByRole("dialog", {
      name: "Sale details",
    });

    await expect(box).toBeVisible();

    await expect(box).toContainText(
      sale.med.name
    );

    await expect(box).toContainText(
      sale.med.batch.number
    );

    await expect(box).toContainText("Cash");

    await expect(
      box.getByRole("region", {
        name: `Medicines for sale ${sale.saleId}`,
      })
    ).toContainText("31.50");

    await expect(
      box.getByText("Total amount")
        .locator("..")
    ).toContainText("31.50");
  });

  test("64 Sale details Close button closes modal", async ({
    page,
    request,
  }) => {
    const sale = await seedSale(request);

    await openHistory(page);

    await clickButton(
      saleRow(page, sale.saleId),
      `View details for sale ${sale.saleId}`
    ).click();

    const box = page.getByRole("dialog", {
      name: "Sale details",
    });

    await clickButton(box, "Close").click();

    await expect(box).toHaveCount(0);
  });

  test("65 Sale details Escape key closes modal", async ({
    page,
    request,
  }) => {
    const sale = await seedSale(request);

    await openHistory(page);

    await clickButton(
      saleRow(page, sale.saleId),
      `View details for sale ${sale.saleId}`
    ).click();

    const box = page.getByRole("dialog", {
      name: "Sale details",
    });

    await page.keyboard.press("Escape");

    await expect(box).toHaveCount(0);
  });

  test("66 Sale detail HTTP 500 displays error and Retry recovers", async ({
    page,
    request,
  }) => {
    const sale = await seedSale(request);

    await openHistory(page);

    await page.route(
      `${API}/sales/${sale.saleId}`,
      (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: "E2E sale details failure",
          }),
        })
    );

    await clickButton(
      saleRow(page, sale.saleId),
      `View details for sale ${sale.saleId}`
    ).click();

    const box = page.getByRole("dialog", {
      name: "Sale details",
    });

    await expect(
      box.getByRole("alert")
    ).toContainText("E2E sale details failure");

    await page.unroute(
      `${API}/sales/${sale.saleId}`
    );

    await clickButton(box, "Retry").click();

    await expect(box).toContainText(
      sale.med.batch.number
    );
  });

  test("67 Sales History HTTP 500 shows alert and Reload recovers", async ({
    page,
    request,
  }) => {
    const sale = await seedSale(request);

    await page.route(
      `${API}/sales`,
      (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: "E2E history failure",
          }),
        })
    );

    await openHistory(page);

    await expect(
      page.getByRole("alert")
    ).toContainText("E2E history failure");

    await page.unroute(`${API}/sales`);

    await clickButton(
      page,
      "Reload sales"
    ).click();

    await expect(
      saleRow(page, sale.saleId)
    ).toBeVisible();
  });

  test("68 Sales History malformed API data shows error", async ({
    page,
  }) => {
    await page.route(
      `${API}/sales`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              bad: "not an array",
            },
          }),
        })
    );

    await openHistory(page);

    await expect(
      page.getByRole("alert")
    ).toContainText(
      "Unable to read sales history."
    );
  });

  test("69 Empty Sales History displays empty state", async ({
    page,
  }) => {
    await page.route(
      `${API}/sales`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: [],
          }),
        })
    );

    await openHistory(page);

    await expect(
      page.getByText(
        "No sales have been recorded yet."
      )
    ).toBeVisible();
  });
});

// =========================================================
// SECTION 5 — API SECURITY
// TESTS 70–77
// =========================================================

test.describe("Sales - API Security", () => {

  test("70 Missing token cannot list sales", async ({
    request,
  }) => {
    const res = await request.get(`${API}/sales`);

    expect(res.status()).toBe(401);
  });

  test("71 Invalid token cannot list sales", async ({
    request,
  }) => {
    const res = await request.get(
      `${API}/sales`,
      {
        headers: auth("bad.e2e.token"),
      }
    );

    expect(res.status()).toBe(401);
  });

  test("72 Customer cannot access admin sales history", async ({
    request,
  }) => {
    const token = await tokenFor(
      request,
      "Customer"
    );

    const res = await request.get(
      `${API}/sales`,
      {
        headers: auth(token),
      }
    );

    expect(res.status()).toBe(403);
  });

  test("73 Pharmacist cannot access admin sales history", async ({
    request,
  }) => {
    const token = await tokenFor(
      request,
      "Pharmacist"
    );

    const res = await request.get(
      `${API}/sales`,
      {
        headers: auth(token),
      }
    );

    expect(res.status()).toBe(403);
  });

  test("74 Admin cannot create a sale", async ({
    request,
  }) => {
    const med = await seedStock(request);

    const res = await request.post(
      `${API}/sales`,
      {
        headers: auth(med.token),
        data: {
          payment_mode: "Cash",
          customer_id: null,
          items: [
            {
              batch_id: med.batch.id,
              quantity: 1,
            },
          ],
        },
      }
    );

    expect(res.status()).toBe(403);
  });

  test("75 Customer cannot create a sale", async ({
    request,
  }) => {
    const med = await seedStock(request);

    const token = await tokenFor(
      request,
      "Customer"
    );

    const res = await request.post(
      `${API}/sales`,
      {
        headers: auth(token),
        data: {
          payment_mode: "Cash",
          customer_id: null,
          items: [
            {
              batch_id: med.batch.id,
              quantity: 1,
            },
          ],
        },
      }
    );

    expect(res.status()).toBe(403);
  });

  test("76 Customer cannot view admin sale detail", async ({
    request,
  }) => {
    const sale = await seedSale(request);

    const token = await tokenFor(
      request,
      "Customer"
    );

    const res = await request.get(
      `${API}/sales/${sale.saleId}`,
      {
        headers: auth(token),
      }
    );

    expect(res.status()).toBe(403);
  });

  test("77 Admin sale-details endpoint rejects invalid ID", async ({
    request,
  }) => {
    const token = await tokenFor(request);

    const res = await request.get(
      `${API}/sales/not-a-number`,
      {
        headers: auth(token),
      }
    );

    expect(res.status()).toBe(400);
  });
});
