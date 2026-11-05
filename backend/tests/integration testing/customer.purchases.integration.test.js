
const request = require("supertest");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = require("../../app");
const db = require("../../config/db");

describe("Customer Purchase History Integration Tests", () => {
    const runId = `${process.pid}-${Date.now()}`;
    const users = {};
    const userIds = [];

    let safeDatabase = false;
    let manufacturerId;
    let medicineId;
    let batchId;

    // ==========================================
    // HELPERS
    // ==========================================

    const api = (method, path, account = "CustomerA") =>
        request(app)[method](path).set(
            "Authorization",
            `Bearer ${users[account].token}`
        );

    const createUser = async (key, role, passwordHash) => {
        const email =
            `purchases-${key.toLowerCase()}-${runId}@test.com`;

        const [result] = await db.execute(
            `INSERT INTO users
             (name, email, password_hash, role)
             VALUES (?, ?, ?, ?)`,
            [
                `Purchase Test ${key}`,
                email,
                passwordHash,
                role
            ]
        );

        userIds.push(result.insertId);

        const [rows] = await db.execute(
            `SELECT user_id, email, role,
                    is_active, token_version
             FROM users
             WHERE user_id = ?`,
            [result.insertId]
        );

        const user = rows[0];
        const version = Number(user?.token_version);

        if (
            !user ||
            Number(user.is_active) !== 1 ||
            user.token_version == null ||
            !Number.isSafeInteger(version) ||
            version < 0
        ) {
            throw new Error(
                `Invalid ${key} test account.`
            );
        }

        users[key] = {
            id: Number(user.user_id),
            token: jwt.sign(
                {
                    userId: Number(user.user_id),
                    email: user.email,
                    role: user.role,
                    token_version: version
                },
                process.env.JWT_SECRET,
                {
                    algorithm: "HS256",
                    expiresIn: "1h"
                }
            )
        };
    };

    const createSale = async ({
        customerId = users.CustomerA.id,
        quantity = 2,
        paymentMode = "Cash"
    } = {}) => {
        const response = await api(
            "post",
            "/sales",
            "Pharmacist"
        ).send({
            customer_id: customerId,
            payment_mode: paymentMode,
            items: [
                {
                    batch_id: batchId,
                    quantity
                }
            ]
        });

        expect(response.status).toBe(201);
        expect(response.body.message).toBe(
            "Sale completed successfully."
        );
        expect(response.body.data.sale_id).toEqual(
            expect.any(Number)
        );

        return response.body.data.sale_id;
    };

    // ==========================================
    // CLEANUP HELPERS
    // ==========================================

    const cleanupSales = async () => {
        if (!users.Pharmacist?.id) return;

        // Delete only sales created by this test
        // suite's unique pharmacist account.
        await db.execute(
            `DELETE si
             FROM sale_items si
             INNER JOIN sales s
                 ON s.sale_id = si.sale_id
             WHERE s.pharmacist_id = ?`,
            [users.Pharmacist.id]
        );

        await db.execute(
            `DELETE FROM sales
             WHERE pharmacist_id = ?`,
            [users.Pharmacist.id]
        );

        if (batchId) {
            await db.execute(
                `UPDATE medicine_batches
                 SET stock_quantity = 500
                 WHERE batch_id = ?`,
                [batchId]
            );
        }
    };

    // ==========================================
    // SETUP
    // ==========================================

    beforeAll(async () => {
        // Check actual MySQL connection before
        // inserting or modifying records.
        const [rows] = await db.execute(
            "SELECT DATABASE() AS db_name"
        );

        if (
            rows[0]?.db_name !==
            "smart_pharmacy_test"
        ) {
            throw new Error(
                `Unsafe integration database: ${rows[0]?.db_name}. ` +
                "Expected smart_pharmacy_test."
            );
        }

        safeDatabase = true;

        const passwordHash = await bcrypt.hash(
            "Test@123",
            10
        );

        await createUser(
            "Admin",
            "Admin",
            passwordHash
        );

        await createUser(
            "Pharmacist",
            "Pharmacist",
            passwordHash
        );

        await createUser(
            "CustomerA",
            "Customer",
            passwordHash
        );

        await createUser(
            "CustomerB",
            "Customer",
            passwordHash
        );

        await createUser(
            "NoPurchases",
            "Customer",
            passwordHash
        );

        // Seed real inventory in the test database.
        // Sales will be created using the real API.

        const [manufacturer] = await db.execute(
            `INSERT INTO manufacturers (name)
             VALUES (?)`,
            [`Purchase Manufacturer ${runId}`]
        );

        manufacturerId = manufacturer.insertId;

        const [medicine] = await db.execute(
            `INSERT INTO medicines
             (manufacturer_id, name, category, reorder_level)
             VALUES (?, ?, ?, ?)`,
            [
                manufacturerId,
                `Purchase Medicine ${runId}`,
                "Tablet",
                10
            ]
        );

        medicineId = medicine.insertId;

        const [batch] = await db.execute(
            `INSERT INTO medicine_batches
             (medicine_id, batch_number, purchase_price,
              selling_price, stock_quantity, expiry_date)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                medicineId,
                `PURCHASE-BT-${runId}`,
                40,
                60,
                500,
                "2099-12-31"
            ]
        );

        batchId = batch.insertId;
    });

    // ==========================================
    // CLEANUP
    // ==========================================

    afterEach(async () => {
        if (safeDatabase) {
            await cleanupSales();
        }
    });

    afterAll(async () => {
        try {
            if (!safeDatabase) return;

            await cleanupSales();

            // Delete in foreign-key dependency order.
            if (batchId) {
                await db.execute(
                    `DELETE FROM medicine_batches
                     WHERE batch_id = ?`,
                    [batchId]
                );
            }

            if (medicineId) {
                await db.execute(
                    `DELETE FROM medicines
                     WHERE medicine_id = ?`,
                    [medicineId]
                );
            }

            if (manufacturerId) {
                await db.execute(
                    `DELETE FROM manufacturers
                     WHERE manufacturer_id = ?`,
                    [manufacturerId]
                );
            }

            for (const id of userIds) {
                await db.execute(
                    "DELETE FROM users WHERE user_id = ?",
                    [id]
                );
            }
        } finally {
            await db.end();
        }
    });

    // ==========================================
    // GET /sales/my-purchases
    // ==========================================

    describe("GET /sales/my-purchases", () => {

        test(
            "returns 200 and an empty list for a new customer",
            async () => {
                const response = await api(
                    "get",
                    "/sales/my-purchases",
                    "NoPurchases"
                );

                expect(response.status).toBe(200);
                expect(response.body.message).toBe(
                    "Purchases retrieved successfully."
                );
                expect(response.body.data).toEqual([]);
            }
        );

        test(
            "returns purchases belonging to the logged-in customer",
            async () => {
                const saleId = await createSale();

                const response = await api(
                    "get",
                    "/sales/my-purchases"
                );

                expect(response.status).toBe(200);

                expect(response.body.data).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            sale_id: saleId
                        })
                    ])
                );
            }
        );

        test(
            "returns multiple purchases for the same customer",
            async () => {
                const firstSaleId = await createSale({
                    quantity: 1
                });

                const secondSaleId = await createSale({
                    quantity: 3
                });

                const response = await api(
                    "get",
                    "/sales/my-purchases"
                );

                expect(response.status).toBe(200);

                const ids = response.body.data.map(
                    (sale) => sale.sale_id
                );

                expect(ids).toEqual(
                    expect.arrayContaining([
                        firstSaleId,
                        secondSaleId
                    ])
                );
            }
        );

        test(
            "excludes other customers' and walk-in purchases",
            async () => {
                const mine = await createSale({
                    customerId: users.CustomerA.id
                });

                const theirs = await createSale({
                    customerId: users.CustomerB.id
                });

                const walkIn = await createSale({
                    customerId: null
                });

                const response = await api(
                    "get",
                    "/sales/my-purchases"
                );

                expect(response.status).toBe(200);

                const ids = response.body.data.map(
                    (sale) => sale.sale_id
                );

                expect(ids).toContain(mine);
                expect(ids).not.toContain(theirs);
                expect(ids).not.toContain(walkIn);
            }
        );
    });

    // ==========================================
    // GET /sales/my-purchases/:saleId
    // ==========================================

    describe("GET /sales/my-purchases/:saleId", () => {

        test(
            "returns the customer's own purchase and medicine items",
            async () => {
                const saleId = await createSale({
                    quantity: 2
                });

                const response = await api(
                    "get",
                    `/sales/my-purchases/${saleId}`
                );

                expect(response.status).toBe(200);
                expect(response.body.message).toBe(
                    "Purchase retrieved successfully."
                );

                expect(
                    response.body.data.sale_id
                ).toBe(saleId);

                // Verify actual ownership in the test database.
const [saleRows] = await db.execute(
    `SELECT customer_id
     FROM sales
     WHERE sale_id = ?`,
    [saleId]
);

expect(saleRows).toHaveLength(1);

expect(saleRows[0].customer_id).toBe(
    users.CustomerA.id
);

                expect(response.body.data.items).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            batch_id: batchId,
                            quantity: 2
                        })
                    ])
                );
            }
        );

        test(
            "returns 404 instead of exposing another customer's sale",
            async () => {
                const saleId = await createSale({
                    customerId: users.CustomerB.id
                });

                const response = await api(
                    "get",
                    `/sales/my-purchases/${saleId}`
                );

                expect(response.status).toBe(404);
                expect(response.body.message).toBe(
                    "Purchase not found."
                );

                expect(response.body.data).toBeNull();
            }
        );

        test(
            "returns 404 for a nonexistent sale",
            async () => {
                const response = await api(
                    "get",
                    "/sales/my-purchases/999999999"
                );

                expect(response.status).toBe(404);
                expect(response.body.message).toBe(
                    "Purchase not found."
                );
            }
        );

        test("returns 404 for a walk-in sale", async () => {
            const saleId = await createSale({
                customerId: null
            });

            const response = await api(
                "get",
                `/sales/my-purchases/${saleId}`
            );

            expect(response.status).toBe(404);
            expect(response.body.message).toBe(
                "Purchase not found."
            );
        });

        test.each([
            "abc",
            "0",
            "-1",
            "1.5",
            "9007199254740992"
        ])(
            "rejects invalid sale ID %s",
            async (id) => {
                const response = await api(
                    "get",
                    `/sales/my-purchases/${id}`
                );

                expect(response.status).toBe(400);
                expect(response.body.message).toBe(
                    "Invalid sale ID."
                );
            }
        );
    });

    // ==========================================
    // AUTHENTICATION AND AUTHORIZATION
    // ==========================================

    describe("Customer purchase route security", () => {

        const paths = [
            "/sales/my-purchases",
            "/sales/my-purchases/1"
        ];

        test.each(paths)(
            "requires JWT for GET %s",
            async (path) => {
                const response = await request(app)
                    .get(path);

                expect(response.status).toBe(401);
                expect(response.body.message).toBe(
                    "Access token is required."
                );
            }
        );

        test.each(paths)(
            "rejects invalid JWT for GET %s",
            async (path) => {
                const response = await request(app)
                    .get(path)
                    .set(
                        "Authorization",
                        "Bearer invalid-token"
                    );

                expect(response.status).toBe(401);
                expect(response.body.message).toBe(
                    "Invalid or expired token."
                );
            }
        );

        test.each([
            ["Admin", paths[0]],
            ["Pharmacist", paths[0]],
            ["Admin", paths[1]],
            ["Pharmacist", paths[1]]
        ])(
            "rejects %s on %s",
            async (role, path) => {
                const response = await api(
                    "get",
                    path,
                    role
                );

                expect(response.status).toBe(403);
                expect(response.body.message).toBe(
                    "You are not authorized to access this resource."
                );
            }
        );

        test("rejects an expired customer token", async () => {
            const token = jwt.sign(
                {
                    userId: users.CustomerA.id,
                    token_version:
                        jwt.decode(
                            users.CustomerA.token
                        ).token_version
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "-1s",
                    algorithm: "HS256"
                }
            );

            const response = await request(app)
                .get("/sales/my-purchases")
                .set(
                    "Authorization",
                    `Bearer ${token}`
                );

            expect(response.status).toBe(401);
            expect(response.body.message).toBe(
                "Invalid or expired token."
            );
        });

        test(
            "rejects a token with missing token_version",
            async () => {
                const token = jwt.sign(
                    {
                        userId: users.CustomerA.id,
                        role: "Customer"
                    },
                    process.env.JWT_SECRET,
                    {
                        expiresIn: "1h",
                        algorithm: "HS256"
                    }
                );

                const response = await request(app)
                    .get("/sales/my-purchases")
                    .set(
                        "Authorization",
                        `Bearer ${token}`
                    );

                expect(response.status).toBe(401);
                expect(response.body.message).toBe(
                    "Your session is no longer valid. Please sign in again."
                );
            }
        );

        test("rejects a revoked customer token", async () => {
            const user = users.CustomerA;

            const version = jwt.decode(
                user.token
            ).token_version;

            try {
                await db.execute(
                    `UPDATE users
                     SET token_version = token_version + 1
                     WHERE user_id = ?`,
                    [user.id]
                );

                const response = await api(
                    "get",
                    "/sales/my-purchases"
                );

                expect(response.status).toBe(401);
                expect(response.body.message).toBe(
                    "Your session has been revoked. Please sign in again."
                );
            } finally {
                await db.execute(
                    `UPDATE users
                     SET token_version = ?
                     WHERE user_id = ?`,
                    [version, user.id]
                );
            }
        });

        test("rejects a deactivated customer", async () => {
            const user = users.CustomerA;

            try {
                await db.execute(
                    `UPDATE users
                     SET is_active = 0
                     WHERE user_id = ?`,
                    [user.id]
                );

                const response = await api(
                    "get",
                    "/sales/my-purchases"
                );

                expect(response.status).toBe(401);
                expect(response.body.message).toBe(
                    "Your account has been deactivated. Please contact the administrator."
                );
            } finally {
                await db.execute(
                    `UPDATE users
                     SET is_active = 1
                     WHERE user_id = ?`,
                    [user.id]
                );
            }
        });

        test(
            "rejects a JWT referencing a missing account",
            async () => {
                const token = jwt.sign(
                    {
                        userId: 999999999,
                        role: "Customer",
                        token_version: 0
                    },
                    process.env.JWT_SECRET,
                    {
                        expiresIn: "1h",
                        algorithm: "HS256"
                    }
                );

                const response = await request(app)
                    .get("/sales/my-purchases")
                    .set(
                        "Authorization",
                        `Bearer ${token}`
                    );

                expect(response.status).toBe(401);
                expect(response.body.message).toBe(
                    "Your account is no longer available."
                );
            }
        );
    });
});
