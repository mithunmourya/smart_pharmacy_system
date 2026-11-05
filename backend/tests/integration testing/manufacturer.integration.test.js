
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const request = require("supertest");

const db = require("../../config/db");
const app = require("../../app");

describe("Manufacturer Integration Tests", () => {
    let adminToken;
    let pharmacistToken;
    let customerToken;

    const manufacturerIds = new Set();
    const userIds = [];
    const runId = `${process.pid}-${Date.now()}`;
    let counter = 0;

    const uniqueName = (prefix = "Test Manufacturer") =>
        `${prefix} ${runId}-${++counter}`;

    const users = [
        { name: "Manufacturer Test Admin", role: "Admin" },
        { name: "Manufacturer Test Pharmacist", role: "Pharmacist" },
        { name: "Manufacturer Test Customer", role: "Customer" }
    ];

    const api = (method, url, token = adminToken) =>
        request(app)[method](url)
            .set("Authorization", `Bearer ${token}`);

    const createTestManufacturer = async (name = uniqueName()) => {
        const [result] = await db.execute(
            "INSERT INTO manufacturers (name) VALUES (?)",
            [name]
        );

        manufacturerIds.add(result.insertId);

        return {
            manufacturer_id: result.insertId,
            name
        };
    };

    const getManufacturerFromDb = async (id) => {
        const [rows] = await db.execute(
            `SELECT manufacturer_id, name, is_active
             FROM manufacturers WHERE manufacturer_id = ?`,
            [id]
        );
        return rows[0];
    };

    const setActive = async (id, active) => {
        await db.execute(
            `UPDATE manufacturers
             SET is_active = ?
             WHERE manufacturer_id = ?`,
            [active, id]
        );
    };

    // =====================================================
    // SETUP
    // =====================================================

    beforeAll(async () => {
        // Verify the ACTUAL connected database.
        const [rows] = await db.execute(
            "SELECT DATABASE() AS db_name"
        );

        const connectedDatabase = rows[0]?.db_name;

        if (connectedDatabase !== "smart_pharmacy_test") {
            throw new Error(
                `Unsafe database: ${connectedDatabase}. ` +
                "Expected smart_pharmacy_test."
            );
        }

        const passwordHash = await bcrypt.hash("Test@123", 10);
        const tokens = {};

        for (const user of users) {
            const email =
                `manufacturer-${user.role.toLowerCase()}-${runId}@test.com`;

            const [result] = await db.execute(
                `INSERT INTO users
                 (name, email, password_hash, role)
                 VALUES (?, ?, ?, ?)`,
                [user.name, email, passwordHash, user.role]
            );

            userIds.push(result.insertId);

            // Fetch the real account and token version.
            const [accountRows] = await db.execute(
                `SELECT user_id, email, role,
                        is_active, token_version
                 FROM users
                 WHERE user_id = ?`,
                [result.insertId]
            );

            const account = accountRows[0];
            const version = Number(account?.token_version);

            if (
                !account ||
                Number(account.is_active) !== 1 ||
                account.token_version == null ||
                !Number.isSafeInteger(version) ||
                version < 0
            ) {
                throw new Error(
                    `Invalid test account for ${user.role}.`
                );
            }

            // JWT must contain the current DB token_version.
            tokens[user.role] = jwt.sign(
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

        adminToken = tokens.Admin;
        pharmacistToken = tokens.Pharmacist;
        customerToken = tokens.Customer;
    });

    // =====================================================
    // CLEANUP
    // =====================================================

    afterEach(async () => {
        for (const id of manufacturerIds) {
            await db.execute(
                "DELETE FROM manufacturers WHERE manufacturer_id = ?",
                [id]
            );
        }

        manufacturerIds.clear();
    });

    afterAll(async () => {
        try {
            for (const id of manufacturerIds) {
                await db.execute(
                    "DELETE FROM manufacturers WHERE manufacturer_id = ?",
                    [id]
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

    // =====================================================
    // POST /manufacturers
    // =====================================================

    describe("POST /manufacturers", () => {
        test("Admin should create manufacturer successfully", async () => {
            const name = uniqueName();

            const response = await api(
                "post",
                "/manufacturers"
            ).send({ name });

            const id = response.body.data?.manufacturerId;

            if (id) {
                manufacturerIds.add(id);
            }

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe(
                "Manufacturer added successfully."
            );
            expect(id).toEqual(expect.any(Number));

            const manufacturer =
                await getManufacturerFromDb(id);

            expect(manufacturer.name).toBe(name);
            expect(manufacturer.is_active).toBe(1);
        });

        test("should return 400 when manufacturer name is missing", async () => {
            const response = await api(
                "post",
                "/manufacturers"
            ).send({});

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Manufacturer name is required."
            );
        });

        test("should return 400 when name contains only spaces", async () => {
            const response = await api(
                "post",
                "/manufacturers"
            ).send({ name: "   " });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Manufacturer name is required."
            );
        });

        test("should return 409 when manufacturer already exists", async () => {
            const manufacturer =
                await createTestManufacturer();

            const response = await api(
                "post",
                "/manufacturers"
            ).send({ name: manufacturer.name });

            expect(response.status).toBe(409);
            expect(response.body.message).toBe(
                "Manufacturer already exists."
            );
        });

        test("should return 409 when manufacturer exists but is inactive", async () => {
            const manufacturer =
                await createTestManufacturer();

            await setActive(
                manufacturer.manufacturer_id,
                0
            );

            const response = await api(
                "post",
                "/manufacturers"
            ).send({ name: manufacturer.name });

            expect(response.status).toBe(409);
            expect(response.body.message).toBe(
                "Manufacturer is inactive. Do you want to restore it?"
            );
            expect(response.body.data).toEqual({
                requiresConfirmation: true,
                manufacturerId: manufacturer.manufacturer_id
            });
        });

        test("should return 401 when token is missing", async () => {
            const response = await request(app)
                .post("/manufacturers")
                .send({ name: uniqueName() });

            expect(response.status).toBe(401);
            expect(response.body.message).toBe(
                "Access token is required."
            );
        });

        test("should return 403 when Pharmacist creates manufacturer", async () => {
            const response = await api(
                "post",
                "/manufacturers",
                pharmacistToken
            ).send({ name: uniqueName() });

            expect(response.status).toBe(403);
            expect(response.body.message).toBe(
                "You are not authorized to access this resource."
            );
        });

        test("should return 403 when Customer creates manufacturer", async () => {
            const response = await api(
                "post",
                "/manufacturers",
                customerToken
            ).send({ name: uniqueName() });

            expect(response.status).toBe(403);
        });
    });

    // =====================================================
    // GET /manufacturers
    // =====================================================

    describe("GET /manufacturers", () => {
        test("Admin should get manufacturers successfully", async () => {
            const manufacturer =
                await createTestManufacturer();

            const response = await api(
                "get",
                "/manufacturers"
            );

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe(
                "Manufacturers retrieved successfully."
            );

            expect(response.body.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        manufacturer_id:
                            manufacturer.manufacturer_id,
                        name: manufacturer.name,
                        is_active: 1
                    })
                ])
            );
        });

        test("Pharmacist should get manufacturers successfully", async () => {
            await createTestManufacturer();

            const response = await api(
                "get",
                "/manufacturers",
                pharmacistToken
            );

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data))
                .toBe(true);
        });

        test("should return 403 for Customer", async () => {
            const response = await api(
                "get",
                "/manufacturers",
                customerToken
            );

            expect(response.status).toBe(403);
        });

        test("should return 401 when token is missing", async () => {
            const response = await request(app)
                .get("/manufacturers");

            expect(response.status).toBe(401);
        });

        test("should return 401 when token is invalid", async () => {
            const response = await api(
                "get",
                "/manufacturers",
                "invalid-token"
            );

            expect(response.status).toBe(401);
            expect(response.body.message).toBe(
                "Invalid or expired token."
            );
        });
    });

    // =====================================================
    // GET /manufacturers/:manufacturerId
    // =====================================================

    describe("GET /manufacturers/:manufacturerId", () => {
        test("Admin should get manufacturer by ID", async () => {
            const manufacturer =
                await createTestManufacturer();

            const response = await api(
                "get",
                `/manufacturers/${manufacturer.manufacturer_id}`
            );

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe(
                "Manufacturer retrieved successfully."
            );

            expect(response.body.data).toEqual(
                expect.objectContaining({
                    manufacturer_id:
                        manufacturer.manufacturer_id,
                    name: manufacturer.name,
                    is_active: 1
                })
            );
        });

        test("Pharmacist should get manufacturer by ID", async () => {
            const manufacturer =
                await createTestManufacturer();

            const response = await api(
                "get",
                `/manufacturers/${manufacturer.manufacturer_id}`,
                pharmacistToken
            );

            expect(response.status).toBe(200);
            expect(response.body.data.manufacturer_id)
                .toBe(manufacturer.manufacturer_id);
        });

        test("should return 400 for invalid manufacturer ID", async () => {
            const response = await api(
                "get",
                "/manufacturers/abc"
            );

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Invalid manufacturer ID."
            );
        });

        test("should return 404 when manufacturer does not exist", async () => {
            const [rows] = await db.execute(
                `SELECT COALESCE(MAX(manufacturer_id), 0) + 1000
                        AS missing_id
                 FROM manufacturers`
            );

            const response = await api(
                "get",
                `/manufacturers/${rows[0].missing_id}`
            );

            expect(response.status).toBe(404);
            expect(response.body.message).toBe(
                "Manufacturer not found."
            );
        });

        test("should return 403 when Customer accesses manufacturer", async () => {
            const manufacturer =
                await createTestManufacturer();

            const response = await api(
                "get",
                `/manufacturers/${manufacturer.manufacturer_id}`,
                customerToken
            );

            expect(response.status).toBe(403);
        });
    });

    // =====================================================
    // PUT /manufacturers/:manufacturerId
    // =====================================================

    describe("PUT /manufacturers/:manufacturerId", () => {
        test("Admin should update manufacturer successfully", async () => {
            const manufacturer =
                await createTestManufacturer();

            const updatedName =
                uniqueName("Updated Manufacturer");

            const response = await api(
                "put",
                `/manufacturers/${manufacturer.manufacturer_id}`
            ).send({ name: updatedName });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "Manufacturer updated successfully."
            );

            const updated = await getManufacturerFromDb(
                manufacturer.manufacturer_id
            );

            expect(updated.name).toBe(updatedName);
        });

        test("should return 400 when name is missing", async () => {
            const manufacturer =
                await createTestManufacturer();

            const response = await api(
                "put",
                `/manufacturers/${manufacturer.manufacturer_id}`
            ).send({});

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Manufacturer name is required."
            );
        });

        test("should return 409 when updating to another manufacturer's name", async () => {
            const first = await createTestManufacturer();
            const second = await createTestManufacturer();

            const response = await api(
                "put",
                `/manufacturers/${first.manufacturer_id}`
            ).send({ name: second.name });

            expect(response.status).toBe(409);
            expect(response.body.message).toBe(
                "Manufacturer already exists."
            );
        });

        test("should return 409 when manufacturer is inactive", async () => {
            const manufacturer =
                await createTestManufacturer();

            await setActive(
                manufacturer.manufacturer_id,
                0
            );

            const response = await api(
                "put",
                `/manufacturers/${manufacturer.manufacturer_id}`
            ).send({ name: uniqueName() });

            expect(response.status).toBe(409);
            expect(response.body.message).toBe(
                "Manufacturer is inactive. Restore it before updating."
            );
        });

        test("should return 404 when manufacturer does not exist", async () => {
            const response = await api(
                "put",
                "/manufacturers/999999999"
            ).send({ name: uniqueName() });

            expect(response.status).toBe(404);
            expect(response.body.message).toBe(
                "Manufacturer not found."
            );
        });

        test("should return 403 when Pharmacist updates manufacturer", async () => {
            const manufacturer =
                await createTestManufacturer();

            const response = await api(
                "put",
                `/manufacturers/${manufacturer.manufacturer_id}`,
                pharmacistToken
            ).send({ name: uniqueName() });

            expect(response.status).toBe(403);
        });
    });

    // =====================================================
    // PATCH /manufacturers/:manufacturerId/deactivate
    // =====================================================

    describe("PATCH /manufacturers/:manufacturerId/deactivate", () => {
        test("Admin should deactivate manufacturer successfully", async () => {
            const manufacturer =
                await createTestManufacturer();

            const response = await api(
                "patch",
                `/manufacturers/${manufacturer.manufacturer_id}/deactivate`
            );

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "Manufacturer deactivated successfully."
            );

            const updated = await getManufacturerFromDb(
                manufacturer.manufacturer_id
            );

            expect(updated.is_active).toBe(0);
        });

        test("should return 400 when manufacturer is already inactive", async () => {
            const manufacturer =
                await createTestManufacturer();

            await setActive(
                manufacturer.manufacturer_id,
                0
            );

            const response = await api(
                "patch",
                `/manufacturers/${manufacturer.manufacturer_id}/deactivate`
            );

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Manufacturer is already inactive."
            );
        });

        test("should return 404 when manufacturer does not exist", async () => {
            const response = await api(
                "patch",
                "/manufacturers/999999999/deactivate"
            );

            expect(response.status).toBe(404);
            expect(response.body.message).toBe(
                "Manufacturer not found."
            );
        });

        test("should return 403 when Pharmacist deactivates manufacturer", async () => {
            const manufacturer =
                await createTestManufacturer();

            const response = await api(
                "patch",
                `/manufacturers/${manufacturer.manufacturer_id}/deactivate`,
                pharmacistToken
            );

            expect(response.status).toBe(403);
        });
    });

    // =====================================================
    // PATCH /manufacturers/:manufacturerId/restore
    // =====================================================

    describe("PATCH /manufacturers/:manufacturerId/restore", () => {
        test("Admin should restore manufacturer successfully", async () => {
            const manufacturer =
                await createTestManufacturer();

            await setActive(
                manufacturer.manufacturer_id,
                0
            );

            const response = await api(
                "patch",
                `/manufacturers/${manufacturer.manufacturer_id}/restore`
            );

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "Manufacturer restored successfully."
            );

            const updated = await getManufacturerFromDb(
                manufacturer.manufacturer_id
            );

            expect(updated.is_active).toBe(1);
        });

        test("should return 400 when manufacturer is already active", async () => {
            const manufacturer =
                await createTestManufacturer();

            const response = await api(
                "patch",
                `/manufacturers/${manufacturer.manufacturer_id}/restore`
            );

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Manufacturer is already active."
            );
        });

        test("should return 404 when manufacturer does not exist", async () => {
            const response = await api(
                "patch",
                "/manufacturers/999999999/restore"
            );

            expect(response.status).toBe(404);
            expect(response.body.message).toBe(
                "Manufacturer not found."
            );
        });

        test("should return 403 when Customer restores manufacturer", async () => {
            const manufacturer =
                await createTestManufacturer();

            const response = await api(
                "patch",
                `/manufacturers/${manufacturer.manufacturer_id}/restore`,
                customerToken
            );

            expect(response.status).toBe(403);
        });
    });
});
