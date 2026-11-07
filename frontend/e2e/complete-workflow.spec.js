
import { test, expect } from "@playwright/test";

// MODULE 11 â€” COMPLETE SMART PHARMACY WORKFLOW
// Run only against the isolated smart_pharmacy_e2e database.

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

const unique = (prefix) =>
  `${prefix}-${process.pid}-${Date.now().toString(36)}-${++serial}`;

const bearer = (token) => ({
  Authorization: `Bearer ${token}`,
});

const btn = (scope, name) =>
  scope.getByRole("button", {
    name,
    exact: true,
  });

const isAPI = (res, path, method = "GET") =>
  new URL(res.url()).pathname === path &&
  res.request().method() === method;

function expiryIn(days = 120) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);

  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

// ============================================
// REAL BACKEND DATA HELPERS
// ============================================

async function tokenFor(request, role = "Admin") {
  const user = USERS[role];

  expect(
    user.email && user.password,
    `Missing ${role} E2E login`
  ).toBeTruthy();

  const res = await request.post(
    `${API}/users/login`,
    { data: user }
  );

  expect(
    res.status(),
    await res.text()
  ).toBe(200);

  const token = (await res.json()).data?.token;

  expect(token).toBeTruthy();

  return token;
}

async function findNamed(
  request,
  path,
  token,
  field,
  name
) {
  const res = await request.get(
    `${API}${path}`,
    {
      headers: bearer(token),
    }
  );

  expect(
    res.status(),
    await res.text()
  ).toBe(200);

  const result = (await res.json()).data;

  expect(Array.isArray(result)).toBe(true);

  const match = result.find(
    (record) => record[field] === name
  );

  expect(
    match,
    `Missing ${name} in ${path}`
  ).toBeTruthy();

  return match;
}

async function createStock(
  request,
  {
    stock = 12,
    price = 19.75,
    reorder = 8,
    category = "Tablet",
    days = 120,
  } = {}
) {
  const adminToken = await tokenFor(
    request,
    "Admin"
  );

  const headers = bearer(adminToken);

  const manufacturerName = unique("E2E-WF-MF");
  const medicineName = unique("E2E-WF-MED");
  const batchNumber = unique("E2E-WF-B");

  // Create manufacturer

  const manufacturerResponse = await request.post(
    `${API}/manufacturers`,
    {
      headers,
      data: {
        name: manufacturerName,
      },
    }
  );

  expect([200, 201]).toContain(
    manufacturerResponse.status()
  );

  const manufacturer = await findNamed(
    request,
    "/manufacturers",
    adminToken,
    "name",
    manufacturerName
  );

  // Create medicine

  const medicineResponse = await request.post(
    `${API}/medicines`,
    {
      headers,
      data: {
        name: medicineName,
        manufacturer_id:
          manufacturer.manufacturer_id,
        category,
        reorder_level: reorder,
      },
    }
  );

  expect([200, 201]).toContain(
    medicineResponse.status()
  );

  const medicine = await findNamed(
    request,
    "/medicines",
    adminToken,
    "name",
    medicineName
  );

  // Create medicine batch

  const batchResponse = await request.post(
    `${API}/batches`,
    {
      headers,
      data: {
        medicine_id: medicine.medicine_id,
        batch_number: batchNumber,
        purchase_price: 10,
        selling_price: price,
        stock_quantity: stock,
        expiry_date: expiryIn(days),
      },
    }
  );

  expect([200, 201]).toContain(
    batchResponse.status()
  );

  const batch = await findNamed(
    request,
    `/batches/medicine/${medicine.medicine_id}`,
    adminToken,
    "batch_number",
    batchNumber
  );

  return {
    adminToken,

    manufacturer: {
      id: Number(manufacturer.manufacturer_id),
      name: manufacturerName,
    },

    medicine: {
      id: Number(medicine.medicine_id),
      name: medicineName,
      category,
      reorder,
    },

    batch: {
      id: Number(batch.batch_id),
      number: batchNumber,
      stock,
      price,
    },
  };
}

async function addBatch(
  request,
  item,
  {
    stock = 8,
    price = 12.5,
    days = 50,
  } = {}
) {
  const number = unique("E2E-WF-B");

  const res = await request.post(
    `${API}/batches`,
    {
      headers: bearer(item.adminToken),
      data: {
        medicine_id: item.medicine.id,
        batch_number: number,
        purchase_price: 8,
        selling_price: price,
        stock_quantity: stock,
        expiry_date: expiryIn(days),
      },
    }
  );

  expect([200, 201]).toContain(res.status());

  const record = await findNamed(
    request,
    `/batches/medicine/${item.medicine.id}`,
    item.adminToken,
    "batch_number",
    number
  );

  return {
    id: Number(record.batch_id),
    number,
    stock,
    price,
  };
}

async function stockOf(
  request,
  item,
  batch = item.batch
) {
  const record = await findNamed(
    request,
    `/batches/medicine/${item.medicine.id}`,
    item.adminToken,
    "batch_number",
    batch.number
  );

  return Number(record.stock_quantity);
}

async function getAdminSale(request, id) {
  const token = await tokenFor(
    request,
    "Admin"
  );

  const res = await request.get(
    `${API}/sales/${id}`,
    {
      headers: bearer(token),
    }
  );

  expect(
    res.status(),
    await res.text()
  ).toBe(200);

  return (await res.json()).data;
}

async function getCustomerSale(request, id) {
  const token = await tokenFor(
    request,
    "Customer"
  );

  const res = await request.get(
    `${API}/sales/my-purchases/${id}`,
    {
      headers: bearer(token),
    }
  );

  expect(
    res.status(),
    await res.text()
  ).toBe(200);

  return (await res.json()).data;
}

async function adjustStock(
  request,
  item,
  amount,
  batch = item.batch
) {
  const res = await request.patch(
    `${API}/batches/${batch.id}/stock`,
    {
      headers: bearer(item.adminToken),
      data: {
        quantity: amount,
      },
    }
  );

  expect(
    res.status(),
    await res.text()
  ).toBe(200);
}

// ============================================
// LOGIN AND NAVIGATION
// ============================================

const destination = {
  Manufacturers: [
    "/manufacturers",
    "/manufacturers",
  ],
  Medicines: [
    "/medicines",
    "/medicines",
  ],
  Batches: [
    "/batches",
    "/medicines",
  ],
  "Available Inventory": [
    "/inventory",
    "/batches/inventory",
  ],
  "Low Stock": [
    "/low-stock",
    "/batches/low-stock",
  ],
  "New Sale": [
    "/sales/new",
    "/batches/inventory",
  ],
  "Sales History": [
    "/sales",
    "/sales",
  ],
  "My Purchases": [
    "/my-purchases",
    "/sales/my-purchases",
  ],
};

async function loginAs(page, role) {
  // JWT is stored in React memory.
  // Sign out before switching roles.

  const signOut = btn(page, "Sign Out");

  if (await signOut.count()) {
    await signOut.click();

    await expect(page).toHaveURL(
      /\/login$/
    );
  } else {
    await page.goto("/login");
  }

  const user = USERS[role];

  expect(
    user.email && user.password,
    `${role} login missing`
  ).toBeTruthy();

  await page
    .getByLabel("Email address")
    .fill(user.email);

  await page
    .getByLabel("Password", {
      exact: true,
    })
    .fill(user.password);

  const [res] = await Promise.all([
    page.waitForResponse((r) =>
      isAPI(r, "/users/login", "POST")
    ),

    btn(page, "Sign In").click(),
  ]);

  expect(
    res.status(),
    await res.text()
  ).toBe(200);

  await expect(page).toHaveURL(
    /\/dashboard$/
  );
}

async function visit(page, role, name) {
  const [url, apiPath] = destination[name];

  const sidebar = page.getByRole(
    "complementary",
    {
      name: "Sidebar",
    }
  );

  const inventoryPages = [
    "Manufacturers",
    "Medicines",
    "Batches",
    "Available Inventory",
    "Low Stock",
  ];

  if (
    role === "Admin" &&
    inventoryPages.includes(name)
  ) {
    const toggle = btn(sidebar, "Inventory");

    const expanded = await toggle.getAttribute(
      "aria-expanded"
    );

    if (expanded !== "true") {
      await toggle.click();
    }
  }

  const [res] = await Promise.all([
    page.waitForResponse((r) =>
      isAPI(r, apiPath)
    ),

    sidebar.getByRole("link", {
      name,
      exact: true,
    }).click(),
  ]);

  expect(
    res.status(),
    `Opening ${name}`
  ).toBe(200);

  await expect(page).toHaveURL(
    new RegExp(
      `${url.replace(/\//g, "\\/")}$`
    )
  );

  await expect(
    page.getByRole("heading", {
      name,
      level: 1,
    })
  ).toBeVisible();
}

// ============================================
// REUSABLE TABLE LOCATORS
// ============================================

const inventoryRow = (
  page,
  name,
  mode = "Available Inventory"
) =>
  page
    .getByRole("region", {
      name: mode,
      exact: true,
    })
    .locator("tbody tr")
    .filter({
      has: page.getByRole("cell", {
        name,
        exact: true,
      }),
    });

const adminSaleRow = (page, id) =>
  page
    .locator(
      '[role="region"][aria-label="Recorded sales"] tbody tr'
    )
    .filter({
      has: page.getByRole("cell", {
        name: `#${id}`,
        exact: true,
      }),
    });

const purchaseRow = (page, id) =>
  page
    .locator(
      '[role="region"][aria-label="Purchase history"] tbody tr'
    )
    .filter({
      has: page.getByRole("cell", {
        name: `#${id}`,
        exact: true,
      }),
    });

const saleForm = (page) =>
  page.locator("form").filter({
    has: page.getByRole("heading", {
      name: "Current sale",
    }),
  });

// ============================================
// COMPLETE SALES CHECKOUT HELPER
// ============================================

async function checkout(
  page,
  items,
  {
    payment = "Cash",
    linkedCustomer = true,
  } = {}
) {
  // items:
  // [{ item: stock, batch: optionalBatch, quantity: 1 }]

  await loginAs(page, "Pharmacist");

  await visit(
    page,
    "Pharmacist",
    "New Sale"
  );

  if (linkedCustomer) {
    await page.getByRole("radio", {
      name: "Existing Customer",
    }).check();

    await page
      .getByLabel("Customer email")
      .fill(USERS.Customer.email);

    await btn(
      page,
      "Search customer"
    ).click();

    await expect(btn(page, "Select customer")).toBeVisible();

    await btn(
      page,
      "Select customer"
    ).click();

    await expect(
      page.getByText("Selected customer", {
        exact: true,
      })
    ).toBeVisible();
  } else {
    await expect(
      page.getByRole("radio", {
        name: "Walk-in",
      })
    ).toBeChecked();
  }

  // Add each required batch to the cart.

  for (const entry of items) {
    const batch =
      entry.batch || entry.item.batch;

    const row = page
      .locator(
        '[aria-label="Available batches table"] tbody tr'
      )
      .filter({
        hasText: batch.number,
      });

    await expect(row).toBeVisible();

    await btn(
      row,
      `Add ${entry.item.medicine.name}, batch ${batch.number}`
    ).click();

    await page
      .locator(`#quantity-${batch.id}`)
      .fill(String(entry.quantity || 1));
  }

  await saleForm(page)
    .getByLabel("Payment mode")
    .selectOption(payment);

  const [res] = await Promise.all([
    page.waitForResponse((r) =>
      isAPI(r, "/sales", "POST")
    ),

    btn(
      saleForm(page),
      "Complete sale"
    ).click(),
  ]);

  expect(
    [200, 201],
    await res.text()
  ).toContain(res.status());

  const sale = (await res.json()).data;

  expect(
    Number(sale.sale_id)
  ).toBeGreaterThan(0);

  await expect(
    page.getByRole("heading", {
      name: "Sale completed successfully",
    })
  ).toBeVisible();

  return {
    id: Number(sale.sale_id),
    total: Number(sale.total_amount),
    payment,
  };
}

// ============================================
// SALES HISTORY HELPERS
// ============================================

async function showAdminHistory(page, id) {
  await loginAs(page, "Admin");

  await visit(
    page,
    "Admin",
    "Sales History"
  );

  await page
    .getByLabel("Search sales")
    .fill(String(id));

  const row = adminSaleRow(page, id);

  await expect(row).toBeVisible();

  return row;
}

async function showCustomerPurchases(page, id) {
  await loginAs(page, "Customer");

  await visit(
    page,
    "Customer",
    "My Purchases"
  );

  await page
    .getByLabel("Search purchases")
    .fill(String(id));

  const row = purchaseRow(page, id);

  await expect(row).toBeVisible();

  return row;
}

async function openCustomerDetails(page, id) {
  const row = purchaseRow(page, id);

  await btn(
    row,
    `View medicines for purchase ${id}`
  ).click();

  const modal = page.getByRole(
    "dialog",
    {
      name: "Purchased medicines",
    }
  );

  await expect(modal).toBeVisible();

  return modal;
}

async function openAdminDetails(page, id) {
  await btn(
    adminSaleRow(page, id),
    `View details for sale ${id}`
  ).click();

  const modal = page.getByRole(
    "dialog",
    {
      name: "Sale details",
    }
  );

  await expect(modal).toBeVisible();

  return modal;
}

// ============================================
// SECTION 1 â€” ADMIN CREATES STOCK
// TESTS 01â€“02
// ============================================

test.describe.configure({ timeout: 120000 });

test.describe(
  "Complete Workflow â€” Admin creates stock",
  () => {

    test("01 Full UI journey: Admin creates stock, Pharmacist sells, Customer sees purchase", async ({
      page,
      request,
    }) => {
      const mfName = unique("E2E-WF-MF");
      const medName = unique("E2E-WF-MED");
      const batchNumber = unique("E2E-WF-B");

      const token = await tokenFor(
        request,
        "Admin"
      );

      // Step 1: Admin logs in.

      await loginAs(page, "Admin");

      // Step 2: Admin creates manufacturer.

      await visit(
        page,
        "Admin",
        "Manufacturers"
      );

      await btn(
        page,
        "Add Manufacturer"
      ).click();

      let modal = page.getByRole(
        "dialog",
        {
          name: "Add manufacturer",
        }
      );

      await modal
        .getByLabel("Manufacturer name")
        .fill(mfName);

      await btn(
        modal,
        "Add Manufacturer"
      ).click();

      await expect(modal).toHaveCount(0);

      const mf = await findNamed(
        request,
        "/manufacturers",
        token,
        "name",
        mfName
      );

      // Step 3: Admin creates medicine.

      await visit(
        page,
        "Admin",
        "Medicines"
      );

      await btn(
        page,
        "Add Medicine"
      ).click();

      modal = page.getByRole(
        "dialog",
        {
          name: "Add medicine",
        }
      );

      await modal
        .getByLabel("Medicine name")
        .fill(medName);

      await modal
        .getByLabel("Manufacturer", {
          exact: true,
        })
        .selectOption(
          String(mf.manufacturer_id)
        );

      await modal
        .getByLabel("Category", {
          exact: true,
        })
        .selectOption("Tablet");

      await modal
        .getByLabel("Reorder level")
        .fill("8");

      await btn(
        modal,
        "Add Medicine"
      ).click();

      await expect(modal).toHaveCount(0);

      const med = await findNamed(
        request,
        "/medicines",
        token,
        "name",
        medName
      );

      // Step 4: Admin adds a batch.

      await visit(
        page,
        "Admin",
        "Batches"
      );

      await page
        .getByLabel("Medicine", {
          exact: true,
        })
        .selectOption(
          String(med.medicine_id)
        );

      await btn(
        page,
        "Add Batch"
      ).click();

      modal = page.getByRole(
        "dialog",
        {
          name: "Add batch",
        }
      );

      await modal
        .getByLabel("Batch number")
        .fill(batchNumber);

      await modal
        .getByLabel("Purchase price")
        .fill("10");

      await modal
        .getByLabel("Selling price")
        .fill("19.75");

      await modal
        .getByLabel("Initial stock quantity")
        .fill("12");

      await modal
        .getByLabel("Expiry date")
        .fill(expiryIn(120));

      await btn(
        modal,
        "Add Batch"
      ).click();

      await expect(modal).toHaveCount(0);

      await expect(
        page.locator("tbody tr").filter({
          hasText: batchNumber,
        })
      ).toBeVisible();

      // Step 5: Admin checks inventory.

      await visit(
        page,
        "Admin",
        "Available Inventory"
      );

      await page
        .getByRole("searchbox", {
          name: "Search",
        })
        .fill(medName);

      const row = inventoryRow(page, medName);

      await expect(row).toBeVisible();

      await expect(row).toContainText(mfName);

      await expect(
        row.locator("td").nth(3)
      ).toHaveText("12");

      // Step 6: Find the saved batch ID.

      const savedBatch = await findNamed(
        request,
        `/batches/medicine/${med.medicine_id}`,
        token,
        "batch_number",
        batchNumber
      );

      const item = {
        adminToken: token,

        manufacturer: {
          id: Number(mf.manufacturer_id),
          name: mfName,
        },

        medicine: {
          id: Number(med.medicine_id),
          name: medName,
        },

        batch: {
          id: Number(savedBatch.batch_id),
          number: batchNumber,
          stock: 12,
          price: 19.75,
        },
      };

      // Step 7: Pharmacist sells two units.

      const sale = await checkout(
        page,
        [
          {
            item,
            quantity: 2,
          },
        ],
        {
          payment: "Cash",
        }
      );

      expect(sale.total).toBe(39.5);

      // Step 8: Stock decreases from 12 to 10.

      expect(
        await stockOf(request, item)
      ).toBe(10);

      // Step 9: Customer opens purchase history.

      const purchase =
        await showCustomerPurchases(
          page,
          sale.id
        );

      await expect(
        purchase
      ).toContainText("39.50");

      // Step 10: Customer verifies receipt.

      const receipt =
        await openCustomerDetails(
          page,
          sale.id
        );

      await expect(receipt).toContainText(
        batchNumber
      );

      await expect(receipt).toContainText(
        medName
      );
    });

    test("02 Admin adjusts batch stock in UI and Inventory reflects the change", async ({
      page,
      request,
    }) => {
      const item = await createStock(
        request,
        {
          stock: 8,
        }
      );

      await loginAs(page, "Admin");

      await visit(
        page,
        "Admin",
        "Batches"
      );

      await page
        .getByLabel("Medicine", {
          exact: true,
        })
        .selectOption(
          String(item.medicine.id)
        );

      const row = page
        .locator("tbody tr")
        .filter({
          hasText: item.batch.number,
        });

      await btn(
        row,
        `Adjust stock for batch ${item.batch.number}`
      ).click();

      const modal = page.getByRole(
        "dialog",
        {
          name: "Adjust stock",
        }
      );

      await expect(
        modal
      ).toContainText("Current stock:");

      await modal
        .getByLabel("Quantity to add")
        .fill("7");

      await btn(
        modal,
        "Confirm Adjustment"
      ).click();

      await expect(modal).toHaveCount(0);

      expect(
        await stockOf(request, item)
      ).toBe(15);

      await visit(
        page,
        "Admin",
        "Available Inventory"
      );

      await page
        .getByRole("searchbox", {
          name: "Search",
        })
        .fill(item.medicine.name);

      await expect(
        inventoryRow(
          page,
          item.medicine.name
        )
          .locator("td")
          .nth(3)
      ).toHaveText("15");
    });
  }
);

// ============================================
// SECTION 2 â€” CHECKOUT AND PURCHASE HISTORY
// TESTS 03â€“11
// ============================================

test.describe(
  "Complete Workflow â€” Checkout and purchase history",
  () => {

    test("03 Cash walk-in sale appears in Admin History and reduces stock", async ({
      page,
      request,
    }) => {
      const item = await createStock(
        request,
        {
          stock: 10,
          price: 19.75,
        }
      );

      const sale = await checkout(
        page,
        [
          {
            item,
            quantity: 2,
          },
        ],
        {
          payment: "Cash",
          linkedCustomer: false,
        }
      );

      expect(sale.total).toBe(39.5);

      expect(
        await stockOf(request, item)
      ).toBe(8);

      const row = await showAdminHistory(
        page,
        sale.id
      );

      await expect(row).toContainText(
        "Cash"
      );

      await expect(row).toContainText(
        "39.50"
      );

      const modal = await openAdminDetails(
        page,
        sale.id
      );

      await expect(modal).toContainText(
        item.batch.number
      );

      await expect(modal).toContainText(
        "39.50"
      );
    });

    // TESTS 04â€“06: PAYMENT MODES

    for (const [number, mode] of [
      [4, "Cash"],
      [5, "Card"],
      [6, "UPI"],
    ]) {
      test(`${number} ${mode} purchase flows from Pharmacist to Customer history`, async ({
        page,
        request,
      }) => {
        const item = await createStock(
          request,
          {
            stock: 15,
            price: 19.75,
          }
        );

        const sale = await checkout(
          page,
          [
            {
              item,
              quantity: 2,
            },
          ],
          {
            payment: mode,
          }
        );

        expect(sale.total).toBe(39.5);

        expect(
          await stockOf(request, item)
        ).toBe(13);

        const row =
          await showCustomerPurchases(
            page,
            sale.id
          );

        await expect(row).toContainText(
          mode
        );

        await expect(row).toContainText(
          "39.50"
        );

        const modal =
          await openCustomerDetails(
            page,
            sale.id
          );

        await expect(modal).toContainText(
          item.medicine.name
        );

        await expect(modal).toContainText(
          item.batch.number
        );

        await expect(modal).toContainText(
          "39.50"
        );
      });
    }

    test("07 Selling three units calculates exact receipt amount and stock", async ({
      page,
      request,
    }) => {
      const item = await createStock(
        request,
        {
          stock: 10,
          price: 15.75,
        }
      );

      const sale = await checkout(
        page,
        [
          {
            item,
            quantity: 3,
          },
        ]
      );

      expect(sale.total).toBe(47.25);

      expect(
        await stockOf(request, item)
      ).toBe(7);

      const receipt = await getCustomerSale(
        request,
        sale.id
      );

      expect(
        Number(receipt.total_amount)
      ).toBe(47.25);

      expect(receipt.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            batch_number: item.batch.number,
            quantity: 3,
          }),
        ])
      );
    });

    test("08 Two batches of one medicine are deducted separately", async ({
      page,
      request,
    }) => {
      const item = await createStock(
        request,
        {
          stock: 10,
          price: 15.75,
        }
      );

      const other = await addBatch(
        request,
        item,
        {
          stock: 8,
          price: 20.5,
        }
      );

      const sale = await checkout(
        page,
        [
          {
            item,
            quantity: 2,
          },
          {
            item,
            batch: other,
            quantity: 3,
          },
        ],
        {
          payment: "Card",
        }
      );

      expect(sale.total).toBe(93);

      expect(
        await stockOf(request, item)
      ).toBe(8);

      expect(
        await stockOf(request, item, other)
      ).toBe(5);

      await showCustomerPurchases(
        page,
        sale.id
      );

      const modal =
        await openCustomerDetails(
          page,
          sale.id
        );

      await expect(modal).toContainText(
        item.batch.number
      );

      await expect(modal).toContainText(
        other.number
      );

      await expect(modal).toContainText(
        "93.00"
      );
    });

    test("09 Two medicines share one checkout and one customer receipt", async ({
      page,
      request,
    }) => {
      const a = await createStock(
        request,
        {
          stock: 10,
          price: 15.75,
        }
      );

      const b = await createStock(
        request,
        {
          stock: 8,
          price: 20.5,
          category: "Capsule",
        }
      );

      const sale = await checkout(
        page,
        [
          {
            item: a,
            quantity: 2,
          },
          {
            item: b,
            quantity: 1,
          },
        ],
        {
          payment: "UPI",
        }
      );

      expect(sale.total).toBe(52);

      expect(
        await stockOf(request, a)
      ).toBe(8);

      expect(
        await stockOf(request, b)
      ).toBe(7);

      await showCustomerPurchases(
        page,
        sale.id
      );

      const modal =
        await openCustomerDetails(
          page,
          sale.id
        );

      await expect(modal).toContainText(
        a.medicine.name
      );

      await expect(modal).toContainText(
        b.medicine.name
      );

      await expect(modal).toContainText(
        "52.00"
      );
    });

    test("10 Admin Sales History and Customer Purchase Details show same total", async ({
      page,
      request,
    }) => {
      const item = await createStock(
        request,
        {
          stock: 9,
          price: 12.5,
        }
      );

      const sale = await checkout(
        page,
        [
          {
            item,
            quantity: 4,
          },
        ],
        {
          payment: "UPI",
        }
      );

      expect(sale.total).toBe(50);

      const fromAdmin = await getAdminSale(
        request,
        sale.id
      );

      const fromCustomer =
        await getCustomerSale(
          request,
          sale.id
        );

      expect(
        Number(fromAdmin.sale_id)
      ).toBe(sale.id);

      expect(
        Number(fromCustomer.sale_id)
      ).toBe(sale.id);

      expect(
        Number(fromAdmin.total_amount)
      ).toBe(50);

      expect(
        Number(fromCustomer.total_amount)
      ).toBe(50);

      expect(fromAdmin.payment_mode).toBe(
        "UPI"
      );

      expect(fromCustomer.payment_mode).toBe(
        "UPI"
      );

      const adminRow = await showAdminHistory(
        page,
        sale.id
      );

      await expect(
        adminRow
      ).toContainText("50.00");

      const adminModal =
        await openAdminDetails(
          page,
          sale.id
        );

      await expect(
        adminModal
      ).toContainText(item.batch.number);

      await btn(
        adminModal,
        "Close"
      ).click();

      const customerRow =
        await showCustomerPurchases(
          page,
          sale.id
        );

      await expect(
        customerRow
      ).toContainText("50.00");

      const customerModal =
        await openCustomerDetails(
          page,
          sale.id
        );

      await expect(
        customerModal
      ).toContainText(item.batch.number);
    });

    test("11 Customer Dashboard shows sale created by Pharmacist", async ({
      page,
      request,
    }) => {
      const item = await createStock(
        request,
        {
          stock: 6,
        }
      );

      const sale = await checkout(
        page,
        [
          {
            item,
            quantity: 1,
          },
        ]
      );

      await loginAs(page, "Customer");

      await expect(
        page.getByRole("heading", {
          name: "Recent purchases",
        })
      ).toBeVisible();

      await expect(
        page
          .locator(
            '[role="region"][aria-label="Your purchase history"]'
          )
          .getByText(`#${sale.id}`, {
            exact: true,
          })
      ).toBeVisible();
    });
  }
);

// ============================================
// SECTION 3 â€” INVENTORY AFTER SALES
// TESTS 12â€“18
// ============================================

test.describe(
  "Complete Workflow â€” Stock movements after sales",
  () => {

    test("12 Sale crossing reorder level makes medicine appear in Low Stock", async ({
      page,
      request,
    }) => {
      const item = await createStock(
        request,
        {
          stock: 14,
          reorder: 10,
        }
      );

      await checkout(
        page,
        [
          {
            item,
            quantity: 6,
          },
        ]
      );

      expect(
        await stockOf(request, item)
      ).toBe(8);

      await loginAs(page, "Pharmacist");

      await visit(
        page,
        "Pharmacist",
        "Low Stock"
      );

      await page
        .getByRole("searchbox", {
          name: "Search",
        })
        .fill(item.medicine.name);

      const row = inventoryRow(
        page,
        item.medicine.name,
        "Low Stock"
      );

      await expect(row).toBeVisible();

      await expect(
        row.locator("td").nth(3)
      ).toHaveText("8");

      await expect(
        row.locator("td").nth(4)
      ).toHaveText("10");

      await expect(
        row.locator("td").nth(5)
      ).toHaveText("2");
    });

    test("13 Sale reducing stock to reorder level shows At reorder level", async ({
      page,
      request,
    }) => {
      const item = await createStock(
        request,
        {
          stock: 12,
          reorder: 10,
        }
      );

      await checkout(
        page,
        [
          {
            item,
            quantity: 2,
          },
        ]
      );

      await loginAs(page, "Pharmacist");

      await visit(
        page,
        "Pharmacist",
        "Low Stock"
      );

      await page
        .getByRole("searchbox", {
          name: "Search",
        })
        .fill(item.medicine.name);

      const row = inventoryRow(
        page,
        item.medicine.name,
        "Low Stock"
      );

      await expect(row).toContainText(
        "At reorder level"
      );

      await expect(
        row.locator("td").nth(3)
      ).toHaveText("10");
    });

    test("14 Selling last unit removes Inventory row and creates Out of stock alert", async ({
      page,
      request,
    }) => {
      const item = await createStock(
        request,
        {
          stock: 1,
          reorder: 8,
        }
      );

      await checkout(
        page,
        [
          {
            item,
            quantity: 1,
          },
        ]
      );

      expect(
        await stockOf(request, item)
      ).toBe(0);

      await loginAs(page, "Pharmacist");

      await visit(
        page,
        "Pharmacist",
        "Available Inventory"
      );

      await page
        .getByRole("searchbox", {
          name: "Search",
        })
        .fill(item.medicine.name);

      await expect(
        inventoryRow(
          page,
          item.medicine.name
        )
      ).toHaveCount(0);

      await visit(
        page,
        "Pharmacist",
        "Low Stock"
      );

      await page
        .getByRole("searchbox", {
          name: "Search",
        })
        .fill(item.medicine.name);

      const row = inventoryRow(
        page,
        item.medicine.name,
        "Low Stock"
      );

      await expect(
        row.locator("td").nth(3)
      ).toHaveText("0");

      await expect(row).toContainText(
        "Out of stock"
      );
    });

    test("15 Restocking after sale allows second sale without losing first", async ({
      page,
      request,
    }) => {
      const item = await createStock(
        request,
        {
          stock: 4,
          price: 19.75,
        }
      );

      // First sale

      const first = await checkout(
        page,
        [
          {
            item,
            quantity: 3,
          },
        ]
      );

      expect(
        await stockOf(request, item)
      ).toBe(1);

      // Add five more units

      await adjustStock(
        request,
        item,
        5
      );

      expect(
        await stockOf(request, item)
      ).toBe(6);

      // Second sale

      const second = await checkout(
        page,
        [
          {
            item,
            quantity: 2,
          },
        ]
      );

      expect(
        await stockOf(request, item)
      ).toBe(4);

      expect(second.id).not.toBe(
        first.id
      );

      // Both purchases must be retained.

      const token = await tokenFor(
        request,
        "Customer"
      );

      const res = await request.get(
        `${API}/sales/my-purchases`,
        {
          headers: bearer(token),
        }
      );

      expect(res.status()).toBe(200);

      const ids = (
        await res.json()
      ).data.map(
        (sale) => Number(sale.sale_id)
      );

      expect(ids).toContain(first.id);

      expect(ids).toContain(second.id);
    });

    test("16 Inactive batch disappears from Inventory but purchase remains", async ({
      page,
      request,
    }) => {
      const item = await createStock(
        request,
        {
          stock: 10,
        }
      );

      const sale = await checkout(
        page,
        [
          {
            item,
            quantity: 2,
          },
        ]
      );

      // Deactivate batch after completing sale.

      const changed = await request.patch(
        `${API}/batches/${item.batch.id}/deactivate`,
        {
          headers: bearer(item.adminToken),
        }
      );

      expect(changed.status()).toBe(200);

      await loginAs(page, "Pharmacist");

      await visit(
        page,
        "Pharmacist",
        "Available Inventory"
      );

      await page
        .getByRole("searchbox", {
          name: "Search",
        })
        .fill(item.medicine.name);

      await expect(
        inventoryRow(
          page,
          item.medicine.name
        )
      ).toHaveCount(0);

      // Historical purchase must still exist.

      await showCustomerPurchases(
        page,
        sale.id
      );

      const modal =
        await openCustomerDetails(
          page,
          sale.id
        );

      await expect(modal).toContainText(
        item.batch.number
      );
    });

    test("17 Inactive medicine no longer contributes to Inventory, purchase remains", async ({
      page,
      request,
    }) => {
      const item = await createStock(
        request,
        {
          stock: 8,
        }
      );

      const sale = await checkout(
        page,
        [
          {
            item,
            quantity: 1,
          },
        ]
      );

      const changed = await request.patch(
        `${API}/medicines/${item.medicine.id}/deactivate`,
        {
          headers: bearer(item.adminToken),
        }
      );

      expect(changed.status()).toBe(200);

      await loginAs(page, "Admin");

      await visit(
        page,
        "Admin",
        "Available Inventory"
      );

      await page
        .getByRole("searchbox", {
          name: "Search",
        })
        .fill(item.medicine.name);

      await expect(
        inventoryRow(
          page,
          item.medicine.name
        )
      ).toHaveCount(0);

      await showCustomerPurchases(
        page,
        sale.id
      );

      await expect(
        purchaseRow(page, sale.id)
      ).toContainText("19.75");
    });

    test("18 Inactive manufacturer excludes Inventory stock without erasing sale", async ({
      page,
      request,
    }) => {
      const item = await createStock(
        request,
        {
          stock: 8,
        }
      );

      const sale = await checkout(
        page,
        [
          {
            item,
            quantity: 1,
          },
        ]
      );

      const changed = await request.patch(
        `${API}/manufacturers/${item.manufacturer.id}/deactivate`,
        {
          headers: bearer(item.adminToken),
        }
      );

      expect(changed.status()).toBe(200);

      await loginAs(page, "Admin");

      await visit(
        page,
        "Admin",
        "Available Inventory"
      );

      await page
        .getByRole("searchbox", {
          name: "Search",
        })
        .fill(item.medicine.name);

      await expect(
        inventoryRow(
          page,
          item.medicine.name
        )
      ).toHaveCount(0);

      await showCustomerPurchases(
        page,
        sale.id
      );

      await expect(
        purchaseRow(page, sale.id)
      ).toBeVisible();
    });
  }
);

// ============================================
// SECTION 4 â€” DATA INTEGRITY AND SECURITY
// TESTS 19â€“22
// ============================================

test.describe(
  "Complete Workflow â€” Integrity and permissions",
  () => {

    test("19 Walk-in sale is visible to Admin but not Customer", async ({
      page,
      request,
    }) => {
      const item = await createStock(
        request,
        {
          stock: 6,
        }
      );

      const sale = await checkout(
        page,
        [
          {
            item,
            quantity: 2,
          },
        ],
        {
          linkedCustomer: false,
        }
      );

      // Admin can see the walk-in sale.

      await showAdminHistory(
        page,
        sale.id
      );

      // Customer cannot see that sale.

      await loginAs(page, "Customer");

      await visit(
        page,
        "Customer",
        "My Purchases"
      );

      await page
        .getByLabel("Search purchases")
        .fill(String(sale.id));

      await expect(
        purchaseRow(page, sale.id)
      ).toHaveCount(0);
    });

    test("20 Backend refuses overselling and stock stays unchanged", async ({
      request,
    }) => {
      const item = await createStock(
        request,
        {
          stock: 2,
        }
      );

      const token = await tokenFor(
        request,
        "Pharmacist"
      );

      const res = await request.post(
        `${API}/sales`,
        {
          headers: bearer(token),

          data: {
            customer_id: null,
            payment_mode: "Cash",

            items: [
              {
                batch_id: item.batch.id,
                quantity: 3,
              },
            ],
          },
        }
      );

      expect([
        400,
        409,
        422,
      ]).toContain(res.status());

      // Invalid sale must not decrease stock.

      expect(
        await stockOf(request, item)
      ).toBe(2);
    });

    test("21 Admin and Customer cannot create sales through API", async ({
      request,
    }) => {
      const item = await createStock(request);

      for (const role of [
        "Admin",
        "Customer",
      ]) {
        const token = await tokenFor(
          request,
          role
        );

        const res = await request.post(
          `${API}/sales`,
          {
            headers: bearer(token),

            data: {
              customer_id: null,
              payment_mode: "Cash",

              items: [
                {
                  batch_id: item.batch.id,
                  quantity: 1,
                },
              ],
            },
          }
        );

        expect(
          res.status(),
          `${role} must not create a sale`
        ).toBe(403);
      }

      // Unauthorized requests must not change stock.

      expect(
        await stockOf(request, item)
      ).toBe(item.batch.stock);
    });

    test("22 Customer cannot access Admin History but can see their purchase", async ({
      page,
      request,
    }) => {
      const item = await createStock(request);

      const sale = await checkout(
        page,
        [
          {
            item,
            quantity: 1,
          },
        ]
      );

      const customerToken =
        await tokenFor(
          request,
          "Customer"
        );

      // Admin sales API is forbidden to Customer.

      const blocked = await request.get(
        `${API}/sales`,
        {
          headers: bearer(customerToken),
        }
      );

      expect(
        blocked.status()
      ).toBe(403);

      // Customer's own purchase is accessible.

      await showCustomerPurchases(
        page,
        sale.id
      );

      await expect(
        purchaseRow(page, sale.id)
      ).toBeVisible();
    });
  }
);


