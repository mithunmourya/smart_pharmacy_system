
const request = require("supertest");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = require("../../app");
const db = require("../../config/db");

describe("Batch Integration Tests", () => {
    let adminToken;
    let pharmacistToken;
    let customerToken;

    const userIds = [];
    const manufacturerIds = new Set();
    const medicineIds = new Set();

    const runId = `${process.pid}-${Date.now()}`;
    let counter = 0;

    const uniqueName = (prefix) =>
        `${prefix}-${runId}-${++counter}`;

    // =====================================================
    // HELPERS
    // =====================================================

    const adminRequest = (method, url) =>
        request(app)[method](url).set(
            "Authorization",
            `Bearer ${adminToken}`
        );

    const pharmacistRequest = (method, url) =>
        request(app)[method](url).set(
            "Authorization",
            `Bearer ${pharmacistToken}`
        );

    const createManufacturer = async () => {
        const [result] = await db.execute(
            "INSERT INTO manufacturers (name) VALUES (?)",
            [uniqueName("Batch Test Manufacturer")]
        );

        manufacturerIds.add(result.insertId);
        return result.insertId;
    };

    const createMedicine = async (reorderLevel = 10) => {
        const manufacturerId = await createManufacturer();

        const response = await adminRequest(
            "post",
            "/medicines"
        ).send({
            manufacturer_id: manufacturerId,
            name: uniqueName("Batch Test Medicine"),
            category: "Tablet",
            reorder_level: reorderLevel
        });

        expect(response.status).toBe(201);

        const medicineId = response.body.data.medicineId;
        medicineIds.add(medicineId);

        return medicineId;
    };

    const validBatch = (medicineId, overrides = {}) => ({
        medicine_id: medicineId,
        batch_number: uniqueName("BT"),
        purchase_price: 50,
        selling_price: 60,
        stock_quantity: 100,
        expiry_date: "2099-12-31",
        ...overrides
    });

    const getBatchFromDb = async (batchId) => {
        const [rows] = await db.execute(
            `SELECT *
             FROM medicine_batches
             WHERE batch_id = ?`,
            [batchId]
        );

        return rows[0];
    };

    const createBatch = async (
        medicineId,
        overrides = {}
    ) => {
        const data = validBatch(medicineId, overrides);

        const response = await adminRequest(
            "post",
            "/batches"
        ).send(data);

        expect(response.status).toBe(201);
        expect(response.body.message).toBe(
            "Batch created successfully."
        );

        const [rows] = await db.execute(
            `SELECT batch_id
             FROM medicine_batches
             WHERE medicine_id = ?
               AND batch_number = ?`,
            [data.medicine_id, data.batch_number]
        );

        expect(rows).toHaveLength(1);

        return {
            batch_id: rows[0].batch_id,
            ...data
        };
    };

    const setBatchActive = async (batchId, active) => {
        await db.execute(
            `UPDATE medicine_batches
             SET is_active = ?
             WHERE batch_id = ?`,
            [active, batchId]
        );
    };

    // =====================================================
    // SETUP - REAL TEST DB AND VALID JWT
    // =====================================================

    beforeAll(async () => {
        // Verify the actual database connection.
        const [databaseRows] = await db.execute(
            "SELECT DATABASE() AS db_name"
        );

        const connectedDatabase = databaseRows[0]?.db_name;

        if (connectedDatabase !== "smart_pharmacy_test") {
            throw new Error(
                `Unsafe integration database: ${connectedDatabase}. ` +
                "Expected smart_pharmacy_test."
            );
        }

        const passwordHash = await bcrypt.hash(
            "Test@123",
            10
        );

        const tokens = {};

        for (const role of [
            "Admin",
            "Pharmacist",
            "Customer"
        ]) {
            const email =
                `batch-${role.toLowerCase()}-${runId}@test.com`;

            const [result] = await db.execute(
                `INSERT INTO users
                 (name, email, password_hash, role)
                 VALUES (?, ?, ?, ?)`,
                [
                    `Batch Test ${role}`,
                    email,
                    passwordHash,
                    role
                ]
            );

            userIds.push(result.insertId);

            // Read the real account from MySQL.
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

            const user = accountRows[0];
            const version = Number(user?.token_version);

            if (
                !user ||
                Number(user.is_active) !== 1 ||
                user.token_version == null ||
                !Number.isSafeInteger(version) ||
                version < 0
            ) {
                throw new Error(
                    `Invalid ${role} test user configuration.`
                );
            }

            // Correct JWT format required by auth middleware.
            tokens[role] = jwt.sign(
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
            );
        }

        adminToken = tokens.Admin;
        pharmacistToken = tokens.Pharmacist;
        customerToken = tokens.Customer;
    });

    // =====================================================
    // CLEANUP
    // =====================================================

    const cleanupFixtures = async () => {
        // Delete child records before parent records.
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

        for (const manufacturerId of manufacturerIds) {
            await db.execute(
                `DELETE FROM manufacturers
                 WHERE manufacturer_id = ?`,
                [manufacturerId]
            );
        }

        manufacturerIds.clear();
    };

    afterEach(async () => {
        await cleanupFixtures();
    });

    afterAll(async () => {
        try {
            await cleanupFixtures();

            for (const userId of userIds) {
                await db.execute(
                    "DELETE FROM users WHERE user_id = ?",
                    [userId]
                );
            }
        } finally {
            await db.end();
        }
    });

    // =====================================================
    // POST /batches
    // =====================================================

    describe("POST /batches", () => {
        test("Admin should create batch successfully", async () => {
            const medicineId = await createMedicine();
            const data = validBatch(medicineId);

            const response = await adminRequest(
                "post",
                "/batches"
            ).send(data);

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe(
                "Batch created successfully."
            );

            const [rows] = await db.execute(
                `SELECT * FROM medicine_batches
                 WHERE medicine_id = ?
                   AND batch_number = ?`,
                [medicineId, data.batch_number]
            );

            expect(rows).toHaveLength(1);
            expect(Number(rows[0].stock_quantity)).toBe(100);
            expect(rows[0].is_active).toBe(1);
        });

        test("should return 400 when required fields are missing", async () => {
            const response = await adminRequest(
                "post",
                "/batches"
            ).send({});

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Creation failed. Missing required fields: medicine_id, batch_number, purchase_price, selling_price, stock_quantity, expiry_date"
            );
        });

        test("should return 404 when medicine does not exist", async () => {
            const response = await adminRequest(
                "post",
                "/batches"
            ).send(validBatch(999999999));

            expect(response.status).toBe(404);
            expect(response.body.message).toBe(
                "Medicine not found."
            );
        });

        test("should reject batch for inactive medicine", async () => {
            const medicineId = await createMedicine();

            await db.execute(
                `UPDATE medicines
                 SET is_active = 0
                 WHERE medicine_id = ?`,
                [medicineId]
            );

            const response = await adminRequest(
                "post",
                "/batches"
            ).send(validBatch(medicineId));

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Cannot create batch for an inactive medicine."
            );
        });

        test("should reject selling price below purchase price", async () => {
            const medicineId = await createMedicine();

            const response = await adminRequest(
                "post",
                "/batches"
            ).send(validBatch(medicineId, {
                purchase_price: 100,
                selling_price: 50
            }));

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Selling price cannot be less than purchase price."
            );
        });

        test("should reject expired batch", async () => {
            const medicineId = await createMedicine();

            const response = await adminRequest(
                "post",
                "/batches"
            ).send(validBatch(medicineId, {
                expiry_date: "2020-01-01"
            }));

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Expiry date must be a future date."
            );
        });

        test("should reject duplicate batch number for same medicine", async () => {
            const medicineId = await createMedicine();
            const batch = await createBatch(medicineId);

            const response = await adminRequest(
                "post",
                "/batches"
            ).send(validBatch(medicineId, {
                batch_number: batch.batch_number
            }));

            expect(response.status).toBe(409);
            expect(response.body.message).toBe(
                "Batch already exists."
            );
        });
    });

    // =====================================================
    // GET /batches/inventory
    // =====================================================

    describe("GET /batches/inventory", () => {
        test("Admin should retrieve actual inventory", async () => {
            const medicineId = await createMedicine();

            await createBatch(medicineId, {
                stock_quantity: 50
            });

            await createBatch(medicineId, {
                stock_quantity: 30
            });

            const response = await adminRequest(
                "get",
                "/batches/inventory"
            );

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "Inventory retrieved successfully."
            );

            const item = response.body.data.find(
                (row) => row.medicine_id === medicineId
            );

            expect(item).toBeDefined();
            expect(item.available_stock).toBe(80);
            expect(item.batches).toHaveLength(2);
        });

        test("Pharmacist should retrieve inventory", async () => {
            const medicineId = await createMedicine();
            await createBatch(medicineId);

            const response = await pharmacistRequest(
                "get",
                "/batches/inventory"
            );

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });
    });

    // =====================================================
    // GET /batches/:batchId
    // =====================================================

    describe("GET /batches/:batchId", () => {
        test("Admin should retrieve batch by ID", async () => {
            const medicineId = await createMedicine();
            const batch = await createBatch(medicineId);

            const response = await adminRequest(
                "get",
                `/batches/${batch.batch_id}`
            );

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "Batch retrieved successfully."
            );
            expect(response.body.data.batch_id).toBe(
                batch.batch_id
            );
        });

        test("Pharmacist should retrieve batch by ID", async () => {
            const medicineId = await createMedicine();
            const batch = await createBatch(medicineId);

            const response = await pharmacistRequest(
                "get",
                `/batches/${batch.batch_id}`
            );

            expect(response.status).toBe(200);
        });

        test("should return 404 for nonexistent batch", async () => {
            const response = await adminRequest(
                "get",
                "/batches/999999999"
            );

            expect(response.status).toBe(404);
            expect(response.body.message).toBe(
                "Batch not found."
            );
        });
    });

    // =====================================================
    // GET /batches/medicine/:medicineId
    // =====================================================

    describe("GET /batches/medicine/:medicineId", () => {
        test("should retrieve batches for medicine", async () => {
            const medicineId = await createMedicine();
            const batch = await createBatch(medicineId);

            const response = await adminRequest(
                "get",
                `/batches/medicine/${medicineId}`
            );

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "Batches retrieved successfully."
            );
            expect(response.body.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        batch_id: batch.batch_id
                    })
                ])
            );
        });

        test("should return 404 when medicine does not exist", async () => {
            const response = await adminRequest(
                "get",
                "/batches/medicine/999999999"
            );

            expect(response.status).toBe(404);
            expect(response.body.message).toBe(
                "Medicine not found."
            );
        });

        test("should return 404 when medicine has no batches", async () => {
            const medicineId = await createMedicine();

            const response = await adminRequest(
                "get",
                `/batches/medicine/${medicineId}`
            );

            expect(response.status).toBe(404);
            expect(response.body.message).toBe(
                "No batches found for this medicine."
            );
        });
    });

    // =====================================================
    // GET /batches/search
    // =====================================================

    describe("GET /batches/search", () => {
        test("should search inventory successfully", async () => {
            const medicineId = await createMedicine();
            const batch = await createBatch(medicineId);

            const response = await adminRequest(
                "get",
                "/batches/search"
            ).query({
                search: batch.batch_number
            });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "Inventory retrieved successfully."
            );
            expect(response.body.data.length)
                .toBeGreaterThan(0);
        });

        test("should return 400 when search is missing", async () => {
            const response = await adminRequest(
                "get",
                "/batches/search"
            );

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Search failed. The 'search' query parameter is required."
            );
        });

        test("should return 404 when no inventory matches", async () => {
            const response = await adminRequest(
                "get",
                "/batches/search"
            ).query({
                search: `NO-MATCH-${runId}`
            });

            expect(response.status).toBe(404);
            expect(response.body.message).toBe(
                "No inventory found matching the search."
            );
        });
    });

    // =====================================================
    // GET /batches/low-stock
    // =====================================================

    describe("GET /batches/low-stock", () => {
        test("should identify low stock medicine", async () => {
            const medicineId = await createMedicine(100);

            await createBatch(medicineId, {
                stock_quantity: 5
            });

            const response = await adminRequest(
                "get",
                "/batches/low-stock"
            );

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "Low stock medicines retrieved successfully."
            );

            const medicine = response.body.data.find(
                (row) => row.medicine_id === medicineId
            );

            expect(medicine).toBeDefined();
            expect(Number(medicine.available_stock)).toBe(5);
            expect(medicine.severity).toBe("Warning");
        });

        test("Pharmacist should access low stock medicines", async () => {
            const medicineId = await createMedicine(100);

            await createBatch(medicineId, {
                stock_quantity: 5
            });

            const response = await pharmacistRequest(
                "get",
                "/batches/low-stock"
            );

            expect(response.status).toBe(200);
        });
    });

    // =====================================================
    // PUT /batches/:batchId
    // =====================================================

    describe("PUT /batches/:batchId", () => {
        test("Admin should update batch successfully", async () => {
            const medicineId = await createMedicine();
            const batch = await createBatch(medicineId);

            const updated = {
                batch_number: uniqueName("UPDATED-BT"),
                purchase_price: 70,
                selling_price: 90,
                expiry_date: "2099-12-31"
            };

            const response = await adminRequest(
                "put",
                `/batches/${batch.batch_id}`
            ).send(updated);

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "Batch updated successfully."
            );

            const stored = await getBatchFromDb(
                batch.batch_id
            );

            expect(stored.batch_number).toBe(
                updated.batch_number
            );
            expect(Number(stored.purchase_price)).toBe(70);
            expect(Number(stored.selling_price)).toBe(90);

            // PUT must not change stock quantity.
            expect(Number(stored.stock_quantity)).toBe(100);
        });

        test("should return 400 for missing fields", async () => {
            const response = await adminRequest(
                "put",
                "/batches/1"
            ).send({});

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Update failed. Missing required fields: batch_number, purchase_price, selling_price, expiry_date"
            );
        });

        test("should return 404 for nonexistent batch", async () => {
            const medicineId = await createMedicine();

            const response = await adminRequest(
                "put",
                "/batches/999999999"
            ).send(validBatch(medicineId));

            expect(response.status).toBe(404);
            expect(response.body.message).toBe(
                "Batch not found."
            );
        });

        test("should reject updating inactive batch", async () => {
            const medicineId = await createMedicine();
            const batch = await createBatch(medicineId);

            await setBatchActive(batch.batch_id, 0);

            const response = await adminRequest(
                "put",
                `/batches/${batch.batch_id}`
            ).send(validBatch(medicineId));

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Cannot update an inactive batch."
            );
        });

        test("should reject selling price below purchase price", async () => {
            const medicineId = await createMedicine();
            const batch = await createBatch(medicineId);

            const response = await adminRequest(
                "put",
                `/batches/${batch.batch_id}`
            ).send(validBatch(medicineId, {
                purchase_price: 100,
                selling_price: 50
            }));

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Selling price cannot be less than purchase price."
            );
        });
    });

    // =====================================================
    // PATCH /batches/:batchId/stock
    // =====================================================

    describe("PATCH /batches/:batchId/stock", () => {
        test("Admin should increase stock", async () => {
            const medicineId = await createMedicine();
            const batch = await createBatch(medicineId, {
                stock_quantity: 20
            });

            const response = await adminRequest(
                "patch",
                `/batches/${batch.batch_id}/stock`
            ).send({ quantity: 10 });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "Batch stock updated successfully."
            );

            const stored = await getBatchFromDb(
                batch.batch_id
            );
            expect(Number(stored.stock_quantity)).toBe(30);
        });

        test("Admin should decrease stock", async () => {
            const medicineId = await createMedicine();
            const batch = await createBatch(medicineId, {
                stock_quantity: 20
            });

            const response = await adminRequest(
                "patch",
                `/batches/${batch.batch_id}/stock`
            ).send({ quantity: -5 });

            expect(response.status).toBe(200);

            const stored = await getBatchFromDb(
                batch.batch_id
            );
            expect(Number(stored.stock_quantity)).toBe(15);
        });

        test("should reject insufficient stock", async () => {
            const medicineId = await createMedicine();
            const batch = await createBatch(medicineId, {
                stock_quantity: 5
            });

            const response = await adminRequest(
                "patch",
                `/batches/${batch.batch_id}/stock`
            ).send({ quantity: -10 });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Insufficient stock."
            );

            const stored = await getBatchFromDb(
                batch.batch_id
            );
            expect(Number(stored.stock_quantity)).toBe(5);
        });

        test("should return 400 when quantity is missing", async () => {
            const response = await adminRequest(
                "patch",
                "/batches/1/stock"
            ).send({});

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Quantity is required."
            );
        });

        test("should return 404 for nonexistent batch", async () => {
            const response = await adminRequest(
                "patch",
                "/batches/999999999/stock"
            ).send({ quantity: 10 });

            expect(response.status).toBe(404);
            expect(response.body.message).toBe(
                "Batch not found."
            );
        });

        test("should reject stock update for inactive batch", async () => {
            const medicineId = await createMedicine();
            const batch = await createBatch(medicineId);

            await setBatchActive(batch.batch_id, 0);

            const response = await adminRequest(
                "patch",
                `/batches/${batch.batch_id}/stock`
            ).send({ quantity: 10 });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Cannot update an inactive batch."
            );
        });
    });

    // =====================================================
    // PATCH /batches/:batchId/deactivate
    // =====================================================

    describe("PATCH /batches/:batchId/deactivate", () => {
        test("Admin should deactivate batch", async () => {
            const medicineId = await createMedicine();
            const batch = await createBatch(medicineId);

            const response = await adminRequest(
                "patch",
                `/batches/${batch.batch_id}/deactivate`
            );

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "Batch deactivated successfully."
            );

            const stored = await getBatchFromDb(
                batch.batch_id
            );
            expect(stored.is_active).toBe(0);
        });

        test("should reject already inactive batch", async () => {
            const medicineId = await createMedicine();
            const batch = await createBatch(medicineId);

            await setBatchActive(batch.batch_id, 0);

            const response = await adminRequest(
                "patch",
                `/batches/${batch.batch_id}/deactivate`
            );

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Batch is already inactive."
            );
        });

        test("should return 404 for nonexistent batch", async () => {
            const response = await adminRequest(
                "patch",
                "/batches/999999999/deactivate"
            );

            expect(response.status).toBe(404);
            expect(response.body.message).toBe(
                "Batch not found."
            );
        });
    });

    // =====================================================
    // PATCH /batches/:batchId/restore
    // =====================================================

    describe("PATCH /batches/:batchId/restore", () => {
        test("Admin should restore inactive batch", async () => {
            const medicineId = await createMedicine();
            const batch = await createBatch(medicineId);

            await setBatchActive(batch.batch_id, 0);

            const response = await adminRequest(
                "patch",
                `/batches/${batch.batch_id}/restore`
            );

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "Batch restored successfully."
            );

            const stored = await getBatchFromDb(
                batch.batch_id
            );
            expect(stored.is_active).toBe(1);
        });

        test("should reject already active batch", async () => {
            const medicineId = await createMedicine();
            const batch = await createBatch(medicineId);

            const response = await adminRequest(
                "patch",
                `/batches/${batch.batch_id}/restore`
            );

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Batch is already active."
            );
        });

        test("should return 404 for nonexistent batch", async () => {
            const response = await adminRequest(
                "patch",
                "/batches/999999999/restore"
            );

            expect(response.status).toBe(404);
            expect(response.body.message).toBe(
                "Batch not found."
            );
        });
    });

    // =====================================================
    // AUTHENTICATION AND AUTHORIZATION
    // =====================================================

    describe("Batch route security", () => {
        const endpoints = [
            ["post", "/batches", "Pharmacist"],
            ["get", "/batches/inventory", "Customer"],
            ["get", "/batches/low-stock", "Customer"],
            ["get", "/batches/search?search=test", "Customer"],
            ["get", "/batches/medicine/1", "Customer"],
            ["get", "/batches/1", "Customer"],
            ["put", "/batches/1", "Pharmacist"],
            ["patch", "/batches/1/stock", "Pharmacist"],
            ["patch", "/batches/1/deactivate", "Pharmacist"],
            ["patch", "/batches/1/restore", "Pharmacist"]
        ];

        test.each(endpoints)(
            "%s %s should return 401 without token",
            async (method, path) => {
                const response = await request(app)[method](
                    path
                );

                expect(response.status).toBe(401);
                expect(response.body.message).toBe(
                    "Access token is required."
                );
            }
        );

        test.each(endpoints)(
            "%s %s should return 403 for %s",
            async (method, path, role) => {
                const token =
                    role === "Pharmacist"
                        ? pharmacistToken
                        : customerToken;

                const response = await request(app)[method](
                    path
                ).set(
                    "Authorization",
                    `Bearer ${token}`
                );

                expect(response.status).toBe(403);
                expect(response.body.message).toBe(
                    "You are not authorized to access this resource."
                );
            }
        );

        test("should reject invalid JWT", async () => {
            const response = await request(app)
                .get("/batches/inventory")
                .set(
                    "Authorization",
                    "Bearer invalid-token"
                );

            expect(response.status).toBe(401);
            expect(response.body.message).toBe(
                "Invalid or expired token."
            );
        });
    });
});
