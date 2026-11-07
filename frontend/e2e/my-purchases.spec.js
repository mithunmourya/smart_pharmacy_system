
import { test, expect } from "@playwright/test";

// Module 9 — Customer Purchases E2E
// Run only against the isolated smart_pharmacy_e2e database.

const API = (
  process.env.E2E_API_BASE_URL ||
  "http://127.0.0.1:5000"
).replace(/\/+$/, "");

const ACCOUNTS = {
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

const LIST = "/sales/my-purchases";

let counter = 0;

const unique = (prefix) =>
  `${prefix}-${process.pid}-${Date.now().toString(36)}-${++counter}`;

const auth = (token) => ({
  Authorization: `Bearer ${token}`,
});

const isAPI = (res, path, method = "GET") =>
  new URL(res.url()).pathname === path &&
  res.request().method() === method;

const btn = (scope, name) =>
  scope.getByRole("button", {
    name,
    exact: true,
  });

const history = (page) =>
  page.locator(
    '[role="region"][aria-label="Purchase history"]'
  );

const rowFor = (page, id) =>
  history(page).locator("tbody tr").filter({
    has: page.getByRole("cell", {
      name: `#${id}`,
      exact: true,
    }),
  });

const search = (page) =>
  page.getByLabel("Search purchases");

const payment = (page) =>
  page.getByLabel("Payment mode", {
    exact: true,
  });

const summary = (page) =>
  page.getByRole("group", {
    name: "Summary before filtering",
  });

const detail = (page) =>
  page.getByRole("dialog", {
    name: "Purchased medicines",
  });

const detailItems = (page, id) =>
  detail(page).getByRole("region", {
    name: `Medicines for sale ${id}`,
  });

// ============================================
// API HELPERS
// ============================================

async function tokenFor(request, role = "Customer") {
  const [email, password] = ACCOUNTS[role];

  expect(
    email && password,
    `${role} E2E credentials missing`
  ).toBeTruthy();

  const res = await request.post(
    `${API}/users/login`,
    {
      data: { email, password },
    }
  );

  expect(res.status()).toBe(200);

  const token = (await res.json()).data?.token;

  expect(token).toBeTruthy();

  return token;
}

async function customerId(request) {
  const adminToken = await tokenFor(
    request,
    "Admin"
  );

  const res = await request.get(
    `${API}/users`,
    {
      headers: auth(adminToken),
    }
  );

  expect(res.status()).toBe(200);

  const users = (await res.json()).data;

  const customer = users.find(
    (user) =>
      user.email.toLowerCase() ===
      ACCOUNTS.Customer[0].toLowerCase()
  );

  expect(
    customer?.user_id,
    "E2E Customer was not found in /users"
  ).toBeTruthy();

  return Number(customer.user_id);
}

function futureDate(days = 120) {
  const date = new Date();

  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

async function seedStock(request) {
  const adminToken = await tokenFor(
    request,
    "Admin"
  );

  const headers = auth(adminToken);

  // Create a manufacturer

  const manufacturerName = unique(
    "E2E-PUR-MF"
  );

  const m = await request.post(
    `${API}/manufacturers`,
    {
      headers,
      data: {
        name: manufacturerName,
      },
    }
  );

  expect([200, 201]).toContain(m.status());

  const mfList = await request.get(
    `${API}/manufacturers`,
    { headers }
  );

  expect(mfList.status()).toBe(200);

  const manufacturer = (
    await mfList.json()
  ).data.find(
    (x) => x.name === manufacturerName
  );

  expect(
    manufacturer?.manufacturer_id
  ).toBeTruthy();

  // Create a medicine

  const medicineName = unique(
    "E2E-PUR-MED"
  );

  const medRes = await request.post(
    `${API}/medicines`,
    {
      headers,
      data: {
        name: medicineName,
        manufacturer_id:
          manufacturer.manufacturer_id,
        category: "Tablet",
        reorder_level: 10,
      },
    }
  );

  expect([200, 201]).toContain(
    medRes.status()
  );

  const medList = await request.get(
    `${API}/medicines`,
    { headers }
  );

  expect(medList.status()).toBe(200);

  const med = (await medList.json()).data.find(
    (x) => x.name === medicineName
  );

  expect(med?.medicine_id).toBeTruthy();

  // Create a batch

  const batchNumber = unique(
    "E2E-PUR-B"
  );

  const batchRes = await request.post(
    `${API}/batches`,
    {
      headers,
      data: {
        medicine_id: med.medicine_id,
        batch_number: batchNumber,
        purchase_price: 10,
        selling_price: 15.75,
        stock_quantity: 20,
        expiry_date: futureDate(),
      },
    }
  );

  expect([200, 201]).toContain(
    batchRes.status()
  );

  const batches = await request.get(
    `${API}/batches/medicine/${med.medicine_id}`,
    { headers }
  );

  expect(batches.status()).toBe(200);

  const batch = (
    await batches.json()
  ).data.find(
    (x) => x.batch_number === batchNumber
  );

  expect(batch?.batch_id).toBeTruthy();

  return {
    medicineName,
    manufacturerName,
    batchNumber,
    batchId: Number(batch.batch_id),
  };
}

// Create a REAL sale linked to the test customer.

async function seedSale(
  request,
  {
    mode = "Cash",
    quantity = 2,
    customer = "own",
    multiItem = false,
  } = {}
) {
  const stock = await seedStock(request);

  const items = [
    {
      batch_id: stock.batchId,
      quantity,
    },
  ];

  let second = null;

  if (multiItem) {
    second = await seedStock(request);

    items.push({
      batch_id: second.batchId,
      quantity: 1,
    });
  }

  const id =
    customer === "own"
      ? await customerId(request)
      : customer;

  const pharmacistToken = await tokenFor(
    request,
    "Pharmacist"
  );

  const res = await request.post(
    `${API}/sales`,
    {
      headers: auth(pharmacistToken),
      data: {
        customer_id: id,
        payment_mode: mode,
        items,
      },
    }
  );

  expect(
    [200, 201],
    await res.text()
  ).toContain(res.status());

  const result = (await res.json()).data;

  expect(
    Number(result?.sale_id)
  ).toBeGreaterThan(0);

  return {
    id: Number(result.sale_id),
    total: Number(result.total_amount),
    mode,
    quantity,
    ...stock,
    second,
  };
}

async function createOtherCustomer(request) {
  const email =
    `${unique("e2e-purchases")}@example.invalid`;

  const password = "TestPurchase456!";

  const created = await request.post(
    `${API}/users/register`,
    {
      data: {
        name: "E2E Other Customer",
        email,
        password,
        role: "Customer",
      },
    }
  );

  expect(
    [200, 201],
    await created.text()
  ).toContain(created.status());

  const token = await tokenFor(
    request,
    "Admin"
  );

  const list = await request.get(
    `${API}/users`,
    {
      headers: auth(token),
    }
  );

  expect(list.status()).toBe(200);

  const user = (await list.json()).data.find(
    (x) => x.email === email
  );

  expect(user?.user_id).toBeTruthy();

  return {
    id: Number(user.user_id),
    email,
    password,
  };
}

// ============================================
// LOGIN AND PAGE NAVIGATION
// ============================================

async function loginCustomer(page) {
  const [email, password] =
    ACCOUNTS.Customer;

  expect(email && password).toBeTruthy();

  await page.goto("/login");

  await page
    .getByLabel("Email address")
    .fill(email);

  await page
    .getByLabel("Password", {
      exact: true,
    })
    .fill(password);

  const [res] = await Promise.all([
    page.waitForResponse(
      (r) =>
        isAPI(r, "/users/login", "POST")
    ),

    btn(page, "Sign In").click(),
  ]);

  expect(res.status()).toBe(200);

  await expect(page).toHaveURL(
    /\/dashboard$/
  );
}

async function openPurchases(page) {
  await loginCustomer(page);

  // Authentication is stored in React memory.
  // Do not use page.goto("/my-purchases").

  const [res] = await Promise.all([
    page.waitForResponse(
      (r) => isAPI(r, LIST)
    ),

    page
      .getByRole("navigation", {
        name: "Main navigation",
      })
      .getByRole("link", {
        name: "My Purchases",
        exact: true,
      })
      .click(),
  ]);

  expect(res.status()).toBe(200);

  await expect(page).toHaveURL(
    /\/my-purchases$/
  );

  await expect(
    page.getByRole("heading", {
      name: "My Purchases",
      level: 1,
    })
  ).toBeVisible();

  return res;
}

async function reload(page) {
  const [res] = await Promise.all([
    page.waitForResponse(
      (r) => isAPI(r, LIST)
    ),

    btn(page, "Reload purchases").click(),
  ]);

  return res;
}

async function showDetails(page, id) {
  const [res] = await Promise.all([
    page.waitForResponse(
      (r) => isAPI(r, `${LIST}/${id}`)
    ),

    btn(
      rowFor(page, id),
      `View medicines for purchase ${id}`
    ).click(),
  ]);

  expect(res.status()).toBe(200);

  await expect(
    detail(page)
  ).toBeVisible();

  await expect(
    detail(page).getByRole("heading", {
      name: `Purchase #${id}`,
    })
  ).toBeVisible();

  return res;
}

// ============================================
// MOCK HELPERS FOR FILTERING AND ERROR TESTS
// ============================================

// These fixtures do not create database records.

function fixture(
  id,
  mode = "Cash",
  total = 31.5,
  daysAgo = 0
) {
  return {
    sale_id: id,
    payment_mode: mode,
    total_amount: total,
    pharmacist_name: "E2E Pharmacist",
    created_at: new Date(
      Date.now() - daysAgo * 86400000
    ).toISOString(),
  };
}

const sample = () => [
  fixture(970101, "Cash", 31.5, 3),
  fixture(970102, "Card", 47.25, 2),
  fixture(970103, "UPI", 63, 1),
];

async function mockList(page, purchases) {
  await page.route(
    `${API}${LIST}`,
    (route) => {
      if (
        route.request().method() !== "GET"
      ) {
        return route.continue();
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: purchases,
        }),
      });
    }
  );
}

// ============================================
// SECTION 1 — REAL CUSTOMER PURCHASE HISTORY
// TESTS 01–15
// ============================================

test.describe(
  "Customer Purchases — Real History",
  () => {

    test("01 Customer sees a sale linked to their account", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(request);

      await openPurchases(page);

      await expect(
        rowFor(page, sale.id)
      ).toBeVisible();

      await expect(
        rowFor(page, sale.id)
      ).toContainText("Cash");

      await expect(
        rowFor(page, sale.id)
      ).toContainText("31.50");
    });

    for (const [number, mode] of [
      [2, "Card"],
      [3, "UPI"],
    ]) {
      test(`${number} Linked ${mode} sale appears in purchase history`, async ({
        page,
        request,
      }) => {
        const sale = await seedSale(
          request,
          { mode }
        );

        await openPurchases(page);

        await expect(
          rowFor(page, sale.id)
        ).toContainText(mode);
      });
    }

    test("04 Search by complete purchase ID", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(request);

      await openPurchases(page);

      await search(page).fill(
        String(sale.id)
      );

      await expect(
        rowFor(page, sale.id)
      ).toBeVisible();
    });

    test("05 Search accepts a leading #", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(request);

      await openPurchases(page);

      await search(page).fill(
        `#${sale.id}`
      );

      await expect(
        rowFor(page, sale.id)
      ).toBeVisible();
    });

    test("06 Search ignores surrounding whitespace", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(request);

      await openPurchases(page);

      await search(page).fill(
        `   ${sale.id}   `
      );

      await expect(
        rowFor(page, sale.id)
      ).toBeVisible();
    });

    test("07 Unknown purchase ID shows no matches", async ({
      page,
      request,
    }) => {
      await seedSale(request);

      await openPurchases(page);

      await search(page).fill(
        "no-such-purchase-e2e-xyz"
      );

      await expect(
        page.getByRole("heading", {
          name: "No matching purchases",
        })
      ).toBeVisible();
    });

    test("08 Clear filters restores the purchase list", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(request);

      await openPurchases(page);

      await search(page).fill(
        "no-such-purchase-e2e-xyz"
      );

      await btn(
        page,
        "Clear filters"
      ).last().click();

      await expect(
        search(page)
      ).toHaveValue("");

      await expect(
        rowFor(page, sale.id)
      ).toBeVisible();
    });

    test("09 Reload fetches fresh purchase history", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(request);

      await openPurchases(page);

      const res = await reload(page);

      expect(res.status()).toBe(200);

      await expect(
        rowFor(page, sale.id)
      ).toBeVisible();
    });

    test("10 Newly completed purchase appears after Reload", async ({
      page,
      request,
    }) => {
      await seedSale(request);

      await openPurchases(page);

      const sale = await seedSale(
        request,
        { mode: "UPI" }
      );

      await reload(page);

      await expect(
        rowFor(page, sale.id)
      ).toContainText("UPI");
    });

    test("11 Walk-in sale is absent from customer history", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(
        request,
        { customer: null }
      );

      await openPurchases(page);

      await expect(
        page.getByText(
          `#${sale.id}`,
          { exact: true }
        )
      ).toHaveCount(0);
    });

    test("12 Another customer's purchase is not visible", async ({
      page,
      request,
    }) => {
      const other =
        await createOtherCustomer(request);

      const sale = await seedSale(
        request,
        { customer: other.id }
      );

      await openPurchases(page);

      await expect(
        page.getByText(
          `#${sale.id}`,
          { exact: true }
        )
      ).toHaveCount(0);
    });

    test("13 Purchase totals show the actual recorded amount", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(
        request,
        { quantity: 3 }
      );

      await openPurchases(page);

      await expect(
        rowFor(page, sale.id)
      ).toContainText("47.25");
    });

    test("14 Purchase history shows the View medicines action", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(request);

      await openPurchases(page);

      await expect(
        btn(
          rowFor(page, sale.id),
          `View medicines for purchase ${sale.id}`
        )
      ).toBeVisible();
    });

    test("15 Search does not issue a new history API request", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(request);

      await openPurchases(page);

      let calls = 0;

      page.on("request", (req) => {
        if (
          new URL(req.url()).pathname === LIST
        ) {
          calls++;
        }
      });

      await search(page).fill(
        String(sale.id)
      );

      await expect(
        rowFor(page, sale.id)
      ).toBeVisible();

      expect(calls).toBe(0);
    });
  }
);

// ============================================
// SECTION 2 — FILTERS, SORTING, EMPTY STATES
// TESTS 16–33
// ============================================

test.describe(
  "Customer Purchases — Filters and Sorting",
  () => {

    test("16 Empty response displays the account-specific empty state", async ({
      page,
    }) => {
      await mockList(page, []);

      await openPurchases(page);

      await expect(
        page.getByRole("heading", {
          name: "No purchases found",
        })
      ).toBeVisible();

      await expect(
        page.getByText(
          "No purchases are linked to your account yet."
        )
      ).toBeVisible();
    });

    test("17 Empty list displays zero purchase summary", async ({
      page,
    }) => {
      await mockList(page, []);

      await openPurchases(page);

      await expect(
        summary(page)
      ).toContainText("0");

      await expect(
        summary(page)
      ).toContainText("Purchases");
    });

    for (const [number, mode] of [
      [18, "Cash"],
      [19, "Card"],
      [20, "UPI"],
    ]) {
      test(`${number} ${mode} filter shows only matching purchases`, async ({
        page,
      }) => {
        await mockList(page, sample());

        await openPurchases(page);

        await payment(page).selectOption(
          mode
        );

        await expect(
          history(page).locator("tbody tr")
        ).toHaveCount(1);

        await expect(
          history(page).locator("tbody tr")
        ).toContainText([mode]);
      });
    }

    test("21 Payment filter with no matches shows No matching purchases", async ({
      page,
    }) => {
      await mockList(page, [
        fixture(970110, "Cash"),
      ]);

      await openPurchases(page);

      await payment(page).selectOption(
        "UPI"
      );

      await expect(
        page.getByRole("heading", {
          name: "No matching purchases",
        })
      ).toBeVisible();
    });

    test("22 Search and payment filter combine correctly", async ({
      page,
    }) => {
      await mockList(page, sample());

      await openPurchases(page);

      await search(page).fill("970102");

      await payment(page).selectOption(
        "Card"
      );

      await expect(
        rowFor(page, 970102)
      ).toBeVisible();

      await expect(
        history(page).locator("tbody tr")
      ).toHaveCount(1);

      await payment(page).selectOption(
        "Cash"
      );

      await expect(
        page.getByRole("heading", {
          name: "No matching purchases",
        })
      ).toBeVisible();
    });

    test("23 Clear filters resets both search and payment", async ({
      page,
    }) => {
      await mockList(page, sample());

      await openPurchases(page);

      await search(page).fill("970102");

      await payment(page).selectOption(
        "UPI"
      );

      await btn(
        page,
        "Clear filters"
      ).last().click();

      await expect(
        search(page)
      ).toHaveValue("");

      await expect(
        payment(page)
      ).toHaveValue("");

      await expect(
        history(page).locator("tbody tr")
      ).toHaveCount(3);
    });

    test("24 Summary count updates when filters are applied", async ({
      page,
    }) => {
      await mockList(page, sample());

      await openPurchases(page);

      await expect(
        summary(page)
      ).toContainText("3");

      await payment(page).selectOption(
        "Card"
      );

      await expect(
        summary(page)
      ).toContainText("Matching purchases");

      await expect(
        summary(page)
          .locator("strong")
          .first()
      ).toHaveText("1");
    });

    test("25 Summary total updates to the filtered purchase amount", async ({
      page,
    }) => {
      await mockList(page, sample());

      await openPurchases(page);

      await payment(page).selectOption(
        "Card"
      );

      await expect(
        summary(page)
      ).toContainText("Matching total");

      await expect(
        summary(page)
          .locator("strong")
          .last()
      ).toContainText("47.25");
    });

    test("26 Clear filters restores full purchase totals", async ({
      page,
    }) => {
      await mockList(page, sample());

      await openPurchases(page);

      const fullTotal = await summary(page)
        .locator("strong")
        .last()
        .innerText();

      await payment(page).selectOption(
        "UPI"
      );

      await btn(
        page,
        "Clear filters"
      ).last().click();

      await expect(
        summary(page)
          .locator("strong")
          .last()
      ).toHaveText(fullTotal);
    });

    // SORTING TESTS

    for (const [number, label] of [
      [27, "Purchase ID"],
      [28, "Purchased on"],
      [29, "Payment"],
      [30, "Total"],
    ]) {
      test(`${number} Sort ${label} ascending and descending`, async ({
        page,
      }) => {
        await mockList(page, sample());

        await openPurchases(page);

        const sortButton = page.getByRole(
          "button",
          {
            name: new RegExp(
              `^${label}: sort (ascending|descending)$`,
              "i"
            ),
          }
        );

        const header = sortButton.locator("..");

        await sortButton.click();

        const first = await header.getAttribute(
          "aria-sort"
        );

        expect([
          "ascending",
          "descending",
        ]).toContain(first);

        await sortButton.click();

        await expect(header).toHaveAttribute(
          "aria-sort",
          first === "ascending"
            ? "descending"
            : "ascending"
        );
      });
    }

    test("31 Default order shows newest purchases first", async ({
      page,
    }) => {
      await mockList(page, sample());

      await openPurchases(page);

      await expect(
        history(page)
          .locator("tbody tr")
          .first()
      ).toContainText("#970103");
    });

    test("32 Filtering retains the current sort selection", async ({
      page,
    }) => {
      await mockList(page, sample());

      await openPurchases(page);

      const sortButton = page.getByRole(
        "button",
        {
          name: /^Purchase ID: sort (ascending|descending)$/i,
        }
      );

      await sortButton.click();

      await expect(
        sortButton.locator("..")
      ).toHaveAttribute(
        "aria-sort",
        "ascending"
      );

      await payment(page).selectOption(
        "Card"
      );

      await expect(
        sortButton.locator("..")
      ).toHaveAttribute(
        "aria-sort",
        "ascending"
      );
    });

    test("33 Filtered table announces the result count", async ({
      page,
    }) => {
      await mockList(page, sample());

      await openPurchases(page);

      await payment(page).selectOption(
        "UPI"
      );

      await expect(
        page.getByRole("status").filter({
          hasText: "1 of 3 purchases",
        })
      ).toContainText(
        "1 of 3 purchases"
      );
    });
  }
);

// ============================================
// SECTION 3 — PURCHASED MEDICINE DETAILS
// TESTS 34–45
// ============================================

test.describe(
  "Customer Purchases — Medicine Details",
  () => {

    test("34 Details show purchased medicine, manufacturer and batch", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(request);

      await openPurchases(page);

      await showDetails(page, sale.id);

      const items = detailItems(
        page,
        sale.id
      );

      await expect(items).toContainText(
        sale.medicineName
      );

      await expect(items).toContainText(
        sale.manufacturerName
      );

      await expect(items).toContainText(
        sale.batchNumber
      );
    });

    test("35 Details show quantity, unit price, subtotal and total", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(
        request,
        { quantity: 3 }
      );

      await openPurchases(page);

      await showDetails(page, sale.id);

      const items = detailItems(
        page,
        sale.id
      );

      await expect(items).toContainText(
        "15.75"
      );

      await expect(items).toContainText(
        "47.25"
      );

      await expect(
        items
          .locator("tbody tr")
          .first()
          .locator("td")
          .nth(2)
      ).toHaveText("3");

      await expect(
        detail(page)
          .getByText("Total amount")
          .locator("..")
      ).toContainText("47.25");
    });

    test("36 Details show the recorded payment method and pharmacist", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(
        request,
        { mode: "UPI" }
      );

      await openPurchases(page);

      await showDetails(page, sale.id);

      await expect(
        detail(page)
          .getByText("Payment mode")
          .locator("..")
      ).toContainText("UPI");

      await expect(
        detail(page)
      ).toContainText("Served by");
    });

    test("37 Details calculate the total number of purchased units", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(
        request,
        {
          quantity: 3,
          multiItem: true,
        }
      );

      await openPurchases(page);

      await showDetails(page, sale.id);

      await expect(
        detail(page)
          .getByText("Total units")
          .locator("..")
      ).toContainText("4");

      await expect(
        detailItems(page, sale.id)
          .locator("tbody tr")
      ).toHaveCount(2);
    });

    test("38 Two purchased batches both appear in the modal", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(
        request,
        { multiItem: true }
      );

      await openPurchases(page);

      await showDetails(page, sale.id);

      await expect(
        detailItems(page, sale.id)
      ).toContainText(
        sale.batchNumber
      );

      await expect(
        detailItems(page, sale.id)
      ).toContainText(
        sale.second.batchNumber
      );
    });

    test("39 Details use the customer-specific API, not the admin route", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(request);

      await openPurchases(page);

      const paths = [];

      page.on("request", (req) => {
        paths.push(
          new URL(req.url()).pathname
        );
      });

      await showDetails(page, sale.id);

      expect(paths).toContain(
        `${LIST}/${sale.id}`
      );

      expect(paths).not.toContain(
        `/sales/${sale.id}`
      );
    });

    test("40 Close button dismisses purchase details", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(request);

      await openPurchases(page);

      await showDetails(page, sale.id);

      await btn(
        detail(page),
        "Close"
      ).click();

      await expect(
        detail(page)
      ).toHaveCount(0);
    });

    test("41 Close dialog icon dismisses purchase details", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(request);

      await openPurchases(page);

      await showDetails(page, sale.id);

      await btn(
        detail(page),
        "Close dialog"
      ).click();

      await expect(
        detail(page)
      ).toHaveCount(0);
    });

    test("42 Escape key dismisses purchase details", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(request);

      await openPurchases(page);

      await showDetails(page, sale.id);

      await page.keyboard.press("Escape");

      await expect(
        detail(page)
      ).toHaveCount(0);
    });

    test("43 Details HTTP 500 shows an error and Retry recovers", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(request);

      await openPurchases(page);

      await page.route(
        `${API}${LIST}/${sale.id}`,
        (route) =>
          route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({
              success: false,
              message:
                "E2E purchase details failure",
            }),
          })
      );

      await btn(
        rowFor(page, sale.id),
        `View medicines for purchase ${sale.id}`
      ).click();

      await expect(
        detail(page).getByRole("alert")
      ).toContainText(
        "E2E purchase details failure"
      );

      await page.unroute(
        `${API}${LIST}/${sale.id}`
      );

      await btn(
        detail(page),
        "Retry"
      ).click();

      await expect(
        detailItems(page, sale.id)
      ).toContainText(
        sale.batchNumber
      );
    });

    test("44 Invalid details response shows validation error", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(request);

      await openPurchases(page);

      await page.route(
        `${API}${LIST}/${sale.id}`,
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              data: {
                sale_id: sale.id,
                items: "bad",
              },
            }),
          })
      );

      await btn(
        rowFor(page, sale.id),
        `View medicines for purchase ${sale.id}`
      ).click();

      await expect(
        detail(page).getByRole("alert")
      ).toContainText(
        "Unable to read the purchase details."
      );
    });

    test("45 Details response with no items shows informative message", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(request);

      await openPurchases(page);

      await page.route(
        `${API}${LIST}/${sale.id}`,
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              data: {
                sale_id: sale.id,
                total_amount: sale.total,
                payment_mode: sale.mode,
                pharmacist_name:
                  "E2E Pharmacist",
                created_at:
                  new Date().toISOString(),
                items: [],
              },
            }),
          })
      );

      await btn(
        rowFor(page, sale.id),
        `View medicines for purchase ${sale.id}`
      ).click();

      await expect(
        detail(page).getByText(
          "No medicine details are available for this sale."
        )
      ).toBeVisible();
    });
  }
);

// ============================================
// SECTION 4 — CUSTOMER DASHBOARD
// TESTS 46–52
// ============================================

test.describe(
  "Customer Purchases — Dashboard",
  () => {

    test("46 Dashboard shows the newly recorded purchase", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(request);

      await loginCustomer(page);

      await expect(
        page.getByRole("heading", {
          name: "Recent purchases",
        })
      ).toBeVisible();

      await expect(
        page.locator(
          '[role="region"][aria-label="Your purchase history"]'
        ).getByText(
          `#${sale.id}`,
          { exact: true }
        )
      ).toBeVisible();
    });

    test("47 Dashboard View all opens My Purchases without logging out", async ({
      page,
      request,
    }) => {
      await seedSale(request);

      await loginCustomer(page);

      const [res] = await Promise.all([
        page.waitForResponse(
          (r) => isAPI(r, LIST)
        ),

        page.getByRole("link", {
          name: "View all",
        }).click(),
      ]);

      expect(res.status()).toBe(200);

      await expect(page).toHaveURL(
        /\/my-purchases$/
      );
    });

    test("48 Dashboard summary shows total purchases and amount spent", async ({
      page,
    }) => {
      await mockList(page, sample());

      await loginCustomer(page);

      const countCard = page
        .getByRole("heading", {
          name: "Total purchases",
        })
        .locator("..")
        .locator("..");

      const amountCard = page
        .getByRole("heading", {
          name: "Total amount spent",
        })
        .locator("..")
        .locator("..");

      await expect(
        countCard
      ).toContainText("3");

      await expect(
        amountCard
      ).toContainText("141.75");
    });

    test("49 Dashboard shows at most five recent purchases", async ({
      page,
    }) => {
      const list = Array.from(
        { length: 7 },
        (_, i) =>
          fixture(
            971001 + i,
            "Cash",
            15.75,
            6 - i
          )
      );

      await mockList(page, list);

      await loginCustomer(page);

      await expect(
        page.locator(
          '[role="region"][aria-label="Your purchase history"]'
        ).locator("tbody tr")
      ).toHaveCount(5);
    });

    test("50 Dashboard shows the latest purchase first", async ({
      page,
    }) => {
      await mockList(page, sample());

      await loginCustomer(page);

      await expect(
        page.locator(
          '[role="region"][aria-label="Your purchase history"]'
        )
          .locator("tbody tr")
          .first()
      ).toContainText("#970103");
    });

    test("51 Dashboard can open purchase medicine details", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(request);

      await loginCustomer(page);

      const [res] = await Promise.all([
        page.waitForResponse(
          (r) =>
            isAPI(
              r,
              `${LIST}/${sale.id}`
            )
        ),

        btn(
          page,
          `View medicines for purchase ${sale.id}`
        ).click(),
      ]);

      expect(res.status()).toBe(200);

      await expect(
        detailItems(page, sale.id)
      ).toContainText(
        sale.medicineName
      );
    });

    test("52 Dashboard Refresh fetches new purchase data", async ({
      page,
      request,
    }) => {
      await loginCustomer(page);

      const sale = await seedSale(request);

      const [res] = await Promise.all([
        page.waitForResponse(
          (r) => isAPI(r, LIST)
        ),

        btn(
          page,
          "Refresh dashboard"
        ).click(),
      ]);

      expect(res.status()).toBe(200);

      await expect(
        page.locator(
          '[role="region"][aria-label="Your purchase history"]'
        ).getByText(
          `#${sale.id}`,
          { exact: true }
        )
      ).toBeVisible();
    });
  }
);

// ============================================
// SECTION 5 — ERRORS AND SECURITY
// TESTS 53–64
// ============================================

test.describe(
  "Customer Purchases — Errors and Security",
  () => {

    test("53 History HTTP 500 shows error; Reload recovers", async ({
      page,
      request,
    }) => {
      const sale = await seedSale(request);

      await page.route(
        `${API}${LIST}`,
        (route) =>
          route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({
              success: false,
              message:
                "E2E history server failure",
            }),
          })
      );

      await loginCustomer(page);

      await page
        .getByRole("navigation", {
          name: "Main navigation",
        })
        .getByRole("link", {
          name: "My Purchases",
        })
        .click();

      await expect(
        page.getByRole("alert")
      ).toContainText(
        "E2E history server failure"
      );

      await page.unroute(
        `${API}${LIST}`
      );

      const res = await reload(page);

      expect(res.status()).toBe(200);

      await expect(
        rowFor(page, sale.id)
      ).toBeVisible();
    });

    test("54 Malformed purchase history shows validation error", async ({
      page,
    }) => {
      await page.route(
        `${API}${LIST}`,
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              data: {
                invalid: true,
              },
            }),
          })
      );

      await loginCustomer(page);

      await page
        .getByRole("navigation", {
          name: "Main navigation",
        })
        .getByRole("link", {
          name: "My Purchases",
        })
        .click();

      await expect(
        page.getByRole("alert")
      ).toContainText(
        "Unable to read your purchase history."
      );
    });

    test("55 Missing token cannot read purchase history", async ({
      request,
    }) => {
      const res = await request.get(
        `${API}${LIST}`
      );

      expect(res.status()).toBe(401);
    });

    test("56 Invalid token cannot read purchase history", async ({
      request,
    }) => {
      const res = await request.get(
        `${API}${LIST}`,
        {
          headers: auth(
            "bad.e2e.token"
          ),
        }
      );

      expect(res.status()).toBe(401);
    });

    for (const [number, role] of [
      [57, "Admin"],
      [58, "Pharmacist"],
    ]) {
      test(`${number} ${role} cannot read customer purchase history`, async ({
        request,
      }) => {
        const token = await tokenFor(
          request,
          role
        );

        const res = await request.get(
          `${API}${LIST}`,
          {
            headers: auth(token),
          }
        );

        expect(res.status()).toBe(403);
      });
    }

    test("59 Customer can access their own purchases API", async ({
      request,
    }) => {
      const sale = await seedSale(request);

      const token = await tokenFor(
        request
      );

      const res = await request.get(
        `${API}${LIST}`,
        {
          headers: auth(token),
        }
      );

      expect(res.status()).toBe(200);

      expect(
        (await res.json()).data.some(
          (x) =>
            Number(x.sale_id) === sale.id
        )
      ).toBe(true);
    });

    test("60 Customer can access their own purchase details API", async ({
      request,
    }) => {
      const sale = await seedSale(request);

      const token = await tokenFor(
        request
      );

      const res = await request.get(
        `${API}${LIST}/${sale.id}`,
        {
          headers: auth(token),
        }
      );

      expect(res.status()).toBe(200);

      expect(
        (await res.json()).data.items
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            batch_number: sale.batchNumber,
          }),
        ])
      );
    });

    test("61 Customer cannot view a walk-in sale through purchase details", async ({
      request,
    }) => {
      const sale = await seedSale(
        request,
        { customer: null }
      );

      const token = await tokenFor(
        request
      );

      const res = await request.get(
        `${API}${LIST}/${sale.id}`,
        {
          headers: auth(token),
        }
      );

      expect([
        403,
        404,
      ]).toContain(res.status());
    });

    test("62 Customer cannot view another customer's sale details", async ({
      request,
    }) => {
      const other =
        await createOtherCustomer(request);

      const sale = await seedSale(
        request,
        {
          customer: other.id,
        }
      );

      const token = await tokenFor(
        request
      );

      const res = await request.get(
        `${API}${LIST}/${sale.id}`,
        {
          headers: auth(token),
        }
      );

      expect([
        403,
        404,
      ]).toContain(res.status());
    });

    test("63 Details endpoint rejects a missing JWT", async ({
      request,
    }) => {
      const res = await request.get(
        `${API}${LIST}/1`
      );

      expect(res.status()).toBe(401);
    });

    test("64 Invalid purchase ID returns 400", async ({
      request,
    }) => {
      const token = await tokenFor(
        request
      );

      const res = await request.get(
        `${API}${LIST}/not-a-number`,
        {
          headers: auth(token),
        }
      );

      expect(res.status()).toBe(400);
    });
  }
);
