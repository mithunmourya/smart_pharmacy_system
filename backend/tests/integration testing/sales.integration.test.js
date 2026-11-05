
const request = require("supertest");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = require("../../app");
const db = require("../../config/db");
const saleItemModel = require("../../models/sale_items.model");

describe("Sales Integration Tests", () => {

    const tokens = {};
    const userIds = {};
    const manufacturerIds = new Set();
    const medicineIds = new Set();

    const runId = `${process.pid}-${Date.now()}`;
    let counter = 0;

    const unique = (prefix) =>
        `${prefix}-${runId}-${++counter}`;

    // ==========================================
    // HELPERS
    // ==========================================

    const auth = (method, path, role = "Pharmacist") =>
        request(app)[method](path).set(
            "Authorization",
            `Bearer ${tokens[role]}`
        );

    const createMedicine = async () => {
        const [manufacturer] = await db.execute(
            "INSERT INTO manufacturers (name) VALUES (?)",
            [unique("Sales Manufacturer")]
        );

        manufacturerIds.add(manufacturer.insertId);

        const response = await auth(
            "post",
            "/medicines",
            "Admin"
        ).send({
            manufacturer_id: manufacturer.insertId,
            name: unique("Sales Medicine"),
            category: "Tablet",
            reorder_level: 10
        });

        expect(response.status).toBe(201);

        const medicineId = response.body.data.medicineId;
        medicineIds.add(medicineId);

        return {
            medicineId,
            manufacturerId: manufacturer.insertId
        };
    };

    const createBatch = async (
        stock = 100,
        sellingPrice = 60
    ) => {
        const { medicineId, manufacturerId } =
            await createMedicine();

        const batchNumber = unique("SALE-BT");

        const response = await auth(
            "post",
            "/batches",
            "Admin"
        ).send({
            medicine_id: medicineId,
            batch_number: batchNumber,
            purchase_price: 40,
            selling_price: sellingPrice,
            stock_quantity: stock,
            expiry_date: "2099-12-31"
        });

        expect(response.status).toBe(201);

        const [rows] = await db.execute(
            `SELECT batch_id
             FROM medicine_batches
             WHERE medicine_id = ?
               AND batch_number = ?`,
            [medicineId, batchNumber]
        );

        expect(rows).toHaveLength(1);

        return {
            batchId: rows[0].batch_id,
            medicineId,
            manufacturerId
        };
    };

    const saleData = (items, overrides = {}) => ({
        customer_id: userIds.Customer,
        payment_mode: "Cash",
        items,
        ...overrides
    });

    const stockOf = async (batchId) => {
        const [rows] = await db.execute(
            `SELECT stock_quantity
             FROM medicine_batches
             WHERE batch_id = ?`,
            [batchId]
        );

        return Number(rows[0].stock_quantity);
    };

    const salesCount = async () => {
        const [rows] = await db.execute(
            `SELECT COUNT(*) AS count
             FROM sales
             WHERE pharmacist_id = ?`,
            [userIds.Pharmacist]
        );

        return Number(rows[0].count);
    };

    const getSaleItems = async (saleId) => {
        const [rows] = await db.execute(
            `SELECT *
             FROM sale_items
             WHERE sale_id = ?`,
            [saleId]
        );

        return rows;
    };

    const expectError = (response, status, message) => {
        expect(response.status).toBe(status);

        expect(response.body).toEqual({
            status,
            success: false,
            message,
            data: null
        });
    };

    // ==========================================
    // DATABASE SETUP + VALID JWT TOKENS
    // ==========================================

    beforeAll(async () => {

        // Important:
        // Verify the actual connected database,
        // not just the environment variable.
        const [databaseRows] = await db.execute(
            "SELECT DATABASE() AS db_name"
        );

        if (
            databaseRows[0]?.db_name !==
            "smart_pharmacy_test"
        ) {
            throw new Error(
                `Unsafe database: ${databaseRows[0]?.db_name}. ` +
                "Expected smart_pharmacy_test."
            );
        }

        const passwordHash = await bcrypt.hash(
            "Test@123",
            10
        );

        for (const role of [
            "Admin",
            "Pharmacist",
            "Customer"
        ]) {
            const email =
                `${unique(role.toLowerCase())}@test.com`;

            const [result] = await db.execute(
                `INSERT INTO users
                 (name, email, password_hash, role)
                 VALUES (?, ?, ?, ?)`,
                [
                    `Sales Test ${role}`,
                    email,
                    passwordHash,
                    role
                ]
            );

            userIds[role] = result.insertId;

            // Read the real user account.
            // Our auth middleware checks token_version
            // against the current database value.
            const [accountRows] = await db.execute(
                `SELECT
                    user_id,
                    email,
                    role,
                    is_active,
                    token_version
                 FROM users
                 WHERE user_id = ?`,
                [result.insertId]
            );

            const account = accountRows[0];
            const version = Number(
                account?.token_version
            );

            if (
                !account ||
                Number(account.is_active) !== 1 ||
                account.token_version == null ||
                !Number.isSafeInteger(version) ||
                version < 0
            ) {
                throw new Error(
                    `Invalid ${role} test account.`
                );
            }

            // JWT matches the production middleware.
            tokens[role] = jwt.sign(
                {
                    userId: Number(account.user_id),
                    email: account.email,
                    role: account.role,
                    token_version: version
                },
                process.env.JWT_SECRET,
                {
                    algorithm: "HS256",
                    expiresIn: "1h"
                }
            );
        }
    });

    // ==========================================
    // CLEANUP
    // ==========================================

    const cleanup = async () => {

        // If setup failed before user creation,
        // there may be no fixtures to clean.
        if (!Number.isSafeInteger(userIds.Pharmacist)) {
            return;
        }

        // Delete sale items before sale headers.
        await db.execute(
            `DELETE si
             FROM sale_items si
             INNER JOIN sales s
                 ON si.sale_id = s.sale_id
             WHERE s.pharmacist_id = ?`,
            [userIds.Pharmacist]
        );

        await db.execute(
            `DELETE FROM sales
             WHERE pharmacist_id = ?`,
            [userIds.Pharmacist]
        );

        // Delete batches before medicines.
        for (const medicineId of medicineIds) {
            await db.execute(
                `DELETE FROM medicine_batches
                 WHERE medicine_id = ?`,
                [medicineId]
            );

            await db.execute(
                `DELETE FROM medicines
                 WHERE medicine_id = ?`,
                [medicineId]
            );
        }

        medicineIds.clear();

        // Delete manufacturers last.
        for (const id of manufacturerIds) {
            await db.execute(
                `DELETE FROM manufacturers
                 WHERE manufacturer_id = ?`,
                [id]
            );
        }

        manufacturerIds.clear();
    };

    afterEach(async () => {
        await cleanup();

        // Restore users changed during tests.
        for (const id of Object.values(userIds)) {
            await db.execute(
                `UPDATE users
                 SET is_active = 1
                 WHERE user_id = ?`,
                [id]
            );
        }
    });

    afterAll(async () => {
        try {
            await cleanup();

            for (const id of Object.values(userIds)) {
                await db.execute(
                    `DELETE FROM users
                     WHERE user_id = ?`,
                    [id]
                );
            }
        } finally {
            await db.end();
        }
    });

    // ==========================================
    // POST /sales - SUCCESS
    // ==========================================

    describe("POST /sales - Success", () => {

        test(
            "Pharmacist creates sale and stock decreases",
            async () => {
                const batch = await createBatch(100, 60);

                const response = await auth(
                    "post",
                    "/sales"
                ).send(saleData([
                    {
                        batch_id: batch.batchId,
                        quantity: 5
                    }
                ]));

                expect(response.status).toBe(201);
                expect(response.body.message).toBe(
                    "Sale completed successfully."
                );

                expect(
                    Number(response.body.data.total_amount)
                ).toBe(300);

                const saleId = response.body.data.sale_id;

                const [sales] = await db.execute(
                    "SELECT * FROM sales WHERE sale_id = ?",
                    [saleId]
                );

                expect(sales).toHaveLength(1);
                expect(sales[0].pharmacist_id)
                    .toBe(userIds.Pharmacist);
                expect(sales[0].customer_id)
                    .toBe(userIds.Customer);

                const items = await getSaleItems(saleId);

                expect(items).toHaveLength(1);
                expect(items[0].batch_id)
                    .toBe(batch.batchId);
                expect(items[0].quantity).toBe(5);
                expect(Number(items[0].subtotal))
                    .toBe(300);

                // Verify the actual inventory change.
                expect(
                    await stockOf(batch.batchId)
                ).toBe(95);
            }
        );

        test(
            "should create sale with multiple batches",
            async () => {
                const first = await createBatch(50, 60);
                const second = await createBatch(40, 80);

                const response = await auth(
                    "post",
                    "/sales"
                ).send(saleData([
                    {
                        batch_id: first.batchId,
                        quantity: 2
                    },
                    {
                        batch_id: second.batchId,
                        quantity: 3
                    }
                ]));

                expect(response.status).toBe(201);

                // 2 * 60 + 3 * 80 = 360.
                expect(
                    Number(response.body.data.total_amount)
                ).toBe(360);

                const items = await getSaleItems(
                    response.body.data.sale_id
                );

                expect(items).toHaveLength(2);

                expect(
                    await stockOf(first.batchId)
                ).toBe(48);

                expect(
                    await stockOf(second.batchId)
                ).toBe(37);
            }
        );

        test("should allow walk-in customer", async () => {
            const batch = await createBatch();

            const response = await auth(
                "post",
                "/sales"
            ).send(saleData([
                {
                    batch_id: batch.batchId,
                    quantity: 1
                }
            ], {
                customer_id: null,
                payment_mode: "UPI"
            }));

            expect(response.status).toBe(201);

            const [rows] = await db.execute(
                `SELECT customer_id, payment_mode
                 FROM sales
                 WHERE sale_id = ?`,
                [response.body.data.sale_id]
            );

            expect(rows[0].customer_id).toBeNull();
            expect(rows[0].payment_mode).toBe("UPI");
        });

        test("should support Card payment", async () => {
            const batch = await createBatch();

            const response = await auth(
                "post",
                "/sales"
            ).send(saleData([
                {
                    batch_id: batch.batchId,
                    quantity: 1
                }
            ], {
                payment_mode: "Card"
            }));

            expect(response.status).toBe(201);
        });
    });

    // ==========================================
    // POST /sales - VALIDATION
    // ==========================================

    describe("POST /sales - Validation", () => {

        test("should reject invalid payment mode", async () => {
            const response = await auth(
                "post",
                "/sales"
            ).send({
                payment_mode: "Bitcoin",
                items: []
            });

            expectError(
                response,
                400,
                "Invalid payment mode."
            );
        });

        test("should reject missing items array", async () => {
            const response = await auth(
                "post",
                "/sales"
            ).send({
                payment_mode: "Cash"
            });

            expectError(
                response,
                400,
                "Items must be an array."
            );
        });

        test("should reject empty items array", async () => {
            const response = await auth(
                "post",
                "/sales"
            ).send({
                payment_mode: "Cash",
                items: []
            });

            expectError(
                response,
                400,
                "At least one medicine must be selected."
            );
        });

        test.each([0, -1, 1.5])(
            "should reject invalid quantity %s",
            async (quantity) => {
                const response = await auth(
                    "post",
                    "/sales"
                ).send(saleData([
                    {
                        batch_id: 1,
                        quantity
                    }
                ]));

                expectError(
                    response,
                    400,
                    "Quantity must be greater than zero."
                );
            }
        );

        test("should reject invalid batch ID", async () => {
            const response = await auth(
                "post",
                "/sales"
            ).send(saleData([
                {
                    batch_id: -1,
                    quantity: 1
                }
            ]));

            expectError(
                response,
                400,
                "Invalid batch ID."
            );
        });

        test("should reject duplicate batch selection", async () => {
            const batch = await createBatch();

            const response = await auth(
                "post",
                "/sales"
            ).send(saleData([
                {
                    batch_id: batch.batchId,
                    quantity: 2
                },
                {
                    batch_id: batch.batchId,
                    quantity: 3
                }
            ]));

            expectError(
                response,
                400,
                "Duplicate batch selected."
            );

            expect(
                await stockOf(batch.batchId)
            ).toBe(100);
        });
    });

    // ==========================================
    // POST /sales - BUSINESS RULES
    // ==========================================

    describe("POST /sales - Business Rules", () => {

        test("should reject nonexistent batch", async () => {
            const response = await auth(
                "post",
                "/sales"
            ).send(saleData([
                {
                    batch_id: 999999999,
                    quantity: 1
                }
            ]));

            expectError(
                response,
                404,
                "Batch not found."
            );
        });

        test("should reject insufficient stock", async () => {
            const batch = await createBatch(5);
            const before = await salesCount();

            const response = await auth(
                "post",
                "/sales"
            ).send(saleData([
                {
                    batch_id: batch.batchId,
                    quantity: 10
                }
            ]));

            expectError(
                response,
                400,
                "Insufficient stock."
            );

            expect(
                await stockOf(batch.batchId)
            ).toBe(5);

            expect(
                await salesCount()
            ).toBe(before);
        });

        test("should reject inactive batch", async () => {
            const batch = await createBatch();

            await db.execute(
                `UPDATE medicine_batches
                 SET is_active = 0
                 WHERE batch_id = ?`,
                [batch.batchId]
            );

            const response = await auth(
                "post",
                "/sales"
            ).send(saleData([
                {
                    batch_id: batch.batchId,
                    quantity: 1
                }
            ]));

            expectError(
                response,
                409,
                "Batch is inactive."
            );
        });

        test("should reject expired batch", async () => {
            const batch = await createBatch();

            await db.execute(
                `UPDATE medicine_batches
                 SET expiry_date = ?
                 WHERE batch_id = ?`,
                ["2020-01-01", batch.batchId]
            );

            const response = await auth(
                "post",
                "/sales"
            ).send(saleData([
                {
                    batch_id: batch.batchId,
                    quantity: 1
                }
            ]));

            expectError(
                response,
                409,
                "Batch has expired."
            );
        });

        test("should reject inactive medicine", async () => {
            const batch = await createBatch();

            await db.execute(
                `UPDATE medicines
                 SET is_active = 0
                 WHERE medicine_id = ?`,
                [batch.medicineId]
            );

            const response = await auth(
                "post",
                "/sales"
            ).send(saleData([
                {
                    batch_id: batch.batchId,
                    quantity: 1
                }
            ]));

            expectError(
                response,
                409,
                "Medicine is inactive."
            );
        });

        test("should reject inactive manufacturer", async () => {
            const batch = await createBatch();

            await db.execute(
                `UPDATE manufacturers
                 SET is_active = 0
                 WHERE manufacturer_id = ?`,
                [batch.manufacturerId]
            );

            const response = await auth(
                "post",
                "/sales"
            ).send(saleData([
                {
                    batch_id: batch.batchId,
                    quantity: 1
                }
            ]));

            expectError(
                response,
                409,
                "Manufacturer is inactive."
            );
        });

        test("should reject nonexistent customer", async () => {
            const batch = await createBatch();

            const response = await auth(
                "post",
                "/sales"
            ).send(saleData([
                {
                    batch_id: batch.batchId,
                    quantity: 1
                }
            ], {
                customer_id: 999999999
            }));

            expectError(
                response,
                404,
                "Customer not found."
            );
        });

        test("should reject inactive pharmacist", async () => {
            const batch = await createBatch();
            const before = await salesCount();

            await db.execute(
                `UPDATE users
                 SET is_active = 0
                 WHERE user_id = ?`,
                [userIds.Pharmacist]
            );

            const response = await auth(
                "post",
                "/sales"
            ).send(saleData([
                {
                    batch_id: batch.batchId,
                    quantity: 1
                }
            ]));

            // Authentication runs before the service.
            // Inactive accounts cannot make requests.
            expectError(
                response,
                401,
                "Your account has been deactivated. Please contact the administrator."
            );

            expect(
                await stockOf(batch.batchId)
            ).toBe(100);

            expect(
                await salesCount()
            ).toBe(before);
        });

        test(
            "should preserve inactive customer ID on the sale",
            async () => {
                const batch = await createBatch();

                await db.execute(
                    `UPDATE users
                     SET is_active = 0
                     WHERE user_id = ?`,
                    [userIds.Customer]
                );

                const response = await auth(
                    "post",
                    "/sales"
                ).send(saleData([
                    {
                        batch_id: batch.batchId,
                        quantity: 1
                    }
                ]));

                expect(response.status).toBe(201);

                const [rows] = await db.execute(
                    `SELECT customer_id
                     FROM sales
                     WHERE sale_id = ?`,
                    [response.body.data.sale_id]
                );

                // Preserve customer history even if
                // their account is inactive.
                expect(rows[0].customer_id).toBe(
                    userIds.Customer
                );
            }
        );
    });

    // ==========================================
    // POST /sales - TRANSACTION ROLLBACK
    // ==========================================

    describe("POST /sales - Transaction", () => {

        test(
            "should rollback sale if item insertion fails",
            async () => {
                const batch = await createBatch(20, 60);
                const before = await salesCount();

                // Inject a failure during item insertion.
                // Real MySQL transaction is still used.
                const itemSpy = jest.spyOn(
                    saleItemModel,
                    "createSaleItem"
                ).mockRejectedValueOnce(
                    new Error("Injected sale item failure")
                );

                const logSpy = jest.spyOn(
                    console,
                    "error"
                ).mockImplementation(() => {});

                try {
                    const response = await auth(
                        "post",
                        "/sales"
                    ).send(saleData([
                        {
                            batch_id: batch.batchId,
                            quantity: 5
                        }
                    ]));

                    expectError(
                        response,
                        500,
                        "An error occurred while processing the sale."
                    );

                    // No sale should be committed.
                    expect(
                        await salesCount()
                    ).toBe(before);

                    // Stock must remain unchanged.
                    expect(
                        await stockOf(batch.batchId)
                    ).toBe(20);
                } finally {
                    itemSpy.mockRestore();
                    logSpy.mockRestore();
                }
            }
        );
    });

    // ==========================================
    // GET /sales
    // ==========================================

    describe("GET /sales", () => {

        test("Admin retrieves created sale", async () => {
            const batch = await createBatch();

            const created = await auth(
                "post",
                "/sales"
            ).send(saleData([
                {
                    batch_id: batch.batchId,
                    quantity: 2
                }
            ]));

            expect(created.status).toBe(201);

            const response = await auth(
                "get",
                "/sales",
                "Admin"
            );

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "Sales retrieved successfully."
            );

            expect(response.body.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        sale_id: created.body.data.sale_id,
                        pharmacist_id: userIds.Pharmacist
                    })
                ])
            );
        });
    });

    // ==========================================
    // GET /sales/:saleId
    // ==========================================

    describe("GET /sales/:saleId", () => {

        test("Admin retrieves sale by ID", async () => {
            const batch = await createBatch();

            const created = await auth(
                "post",
                "/sales"
            ).send(saleData([
                {
                    batch_id: batch.batchId,
                    quantity: 1
                }
            ]));

            expect(created.status).toBe(201);

            const saleId = created.body.data.sale_id;

            const response = await auth(
                "get",
                `/sales/${saleId}`,
                "Admin"
            );

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "Sale retrieved successfully."
            );
            expect(response.body.data.sale_id).toBe(saleId);
        });

        test("should reject invalid sale ID", async () => {
            const response = await auth(
                "get",
                "/sales/abc",
                "Admin"
            );

            expectError(
                response,
                400,
                "Invalid sale ID."
            );
        });

        test("should return 404 for unknown sale", async () => {
            const response = await auth(
                "get",
                "/sales/999999999",
                "Admin"
            );

            expectError(
                response,
                404,
                "Sale not found."
            );
        });
    });

    // ==========================================
    // GET /sales/search
    // ==========================================

    describe("GET /sales/search", () => {

        test("Admin searches sale by ID", async () => {
            const batch = await createBatch();

            const created = await auth(
                "post",
                "/sales"
            ).send(saleData([
                {
                    batch_id: batch.batchId,
                    quantity: 1
                }
            ]));

            expect(created.status).toBe(201);

            const saleId = created.body.data.sale_id;

            const response = await auth(
                "get",
                `/sales/search?search=${saleId}`,
                "Admin"
            );

            expect(response.status).toBe(200);

            expect(response.body.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        sale_id: saleId
                    })
                ])
            );
        });

        test("should reject empty search", async () => {
            const response = await auth(
                "get",
                "/sales/search?search=%20%20",
                "Admin"
            );

            expectError(
                response,
                400,
                "Search failed. The 'search' query parameter is missing or empty."
            );
        });

        test("should return 404 for unmatched search", async () => {
            const response = await auth(
                "get",
                `/sales/search?search=${unique("NO-MATCH")}`,
                "Admin"
            );

            expectError(
                response,
                404,
                "No matching sales found."
            );
        });
    });

    // ==========================================
    // SALES ROUTE SECURITY
    // ==========================================

    describe("Sales Route Security", () => {

        const endpoints = [
            ["post", "/sales", "Admin"],
            ["get", "/sales", "Pharmacist"],
            ["get", "/sales/search?search=1", "Pharmacist"],
            ["get", "/sales/1", "Pharmacist"]
        ];

        test.each(endpoints)(
            "%s %s requires JWT",
            async (method, path) => {
                const response = await request(app)[method](
                    path
                );

                expectError(
                    response,
                    401,
                    "Access token is required."
                );
            }
        );

        test.each(endpoints)(
            "%s %s rejects unauthorized %s",
            async (method, path, role) => {
                const response = await auth(
                    method,
                    path,
                    role
                );

                expectError(
                    response,
                    403,
                    "You are not authorized to access this resource."
                );
            }
        );

        test.each(endpoints)(
            "%s %s rejects invalid JWT",
            async (method, path) => {
                const response = await request(app)[method](
                    path
                ).set(
                    "Authorization",
                    "Bearer invalid-token"
                );

                expectError(
                    response,
                    401,
                    "Invalid or expired token."
                );
            }
        );
    });
});
