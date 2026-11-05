
const request = require("supertest");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = require("../../app");
const db = require("../../config/db");

describe("Medicine Integration Tests", () => {
    let adminToken;
    let pharmacistToken;
    let customerToken;

    const userIds = [];
    const manufacturerIds = new Set();
    const medicineIds = new Set();
    const runId = `${process.pid}-${Date.now()}`;
    let counter = 0;

    const uniqueName = (prefix = "Test Medicine") =>
        `${prefix} ${runId}-${++counter}`;

    const adminRequest = (method, url) =>
        request(app)[method](url)
            .set("Authorization", `Bearer ${adminToken}`);

    const authRequest = (method, url, token) =>
        request(app)[method](url)
            .set("Authorization", `Bearer ${token}`);

    const createManufacturer = async () => {
        const name = uniqueName("Test Manufacturer");

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

    const validMedicine = (
        manufacturerId,
        name = uniqueName()
    ) => ({
        manufacturer_id: manufacturerId,
        name,
        category: "Tablet",
        reorder_level: 10
    });

    const createMedicine = async (manufacturerId) => {
        const data = validMedicine(manufacturerId);

        const response = await adminRequest(
            "post",
            "/medicines"
        ).send(data);

        expect(response.status).toBe(201);

        const medicineId = response.body.data.medicineId;
        medicineIds.add(medicineId);

        return {
            medicine_id: medicineId,
            ...data
        };
    };

    const getMedicineFromDb = async (medicineId) => {
        const [rows] = await db.execute(
            "SELECT * FROM medicines WHERE medicine_id = ?",
            [medicineId]
        );

        return rows[0];
    };

    const setMedicineActive = async (
        medicineId,
        active
    ) => {
        await db.execute(
            "UPDATE medicines SET is_active = ? WHERE medicine_id = ?",
            [active, medicineId]
        );
    };

    const setManufacturerActive = async (
        manufacturerId,
        active
    ) => {
        await db.execute(
            "UPDATE manufacturers SET is_active = ? WHERE manufacturer_id = ?",
            [active, manufacturerId]
        );
    };

    // =====================================================
    // SETUP
    // =====================================================

    beforeAll(async () => {
        // Check the actual connected database.
        // Never run destructive integration tests on main DB.
        const [databaseRows] = await db.execute(
            "SELECT DATABASE() AS db_name"
        );

        if (
            databaseRows[0]?.db_name !==
            "smart_pharmacy_test"
        ) {
            throw new Error(
                `Unsafe integration database: ${databaseRows[0]?.db_name}. ` +
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
                `medicine-${role.toLowerCase()}-${runId}@test.com`;

            const [result] = await db.execute(
                `INSERT INTO users
                 (name, email, password_hash, role)
                 VALUES (?, ?, ?, ?)`,
                [
                    `Medicine Test ${role}`,
                    email,
                    passwordHash,
                    role
                ]
            );

            userIds.push(result.insertId);

            // Read the real database account.
            // Authentication checks this account on each request.
            const [rows] = await db.execute(
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

            const user = rows[0];

            if (
                !user ||
                Number(user.is_active) !== 1
            ) {
                throw new Error(
                    `Could not create active ${role} test user.`
                );
            }

            const version = Number(
                user.token_version
            );

            if (
                user.token_version == null ||
                !Number.isSafeInteger(version) ||
                version < 0
            ) {
                throw new Error(
                    `Invalid token_version for ${role} test user.`
                );
            }

            // IMPORTANT:
            // token_version must match the current DB value.
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

    afterEach(async () => {
        // Delete medicines before manufacturers.

        for (const id of medicineIds) {
            await db.execute(
                "DELETE FROM medicines WHERE medicine_id = ?",
                [id]
            );
        }

        medicineIds.clear();

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
            for (const id of medicineIds) {
                await db.execute(
                    "DELETE FROM medicines WHERE medicine_id = ?",
                    [id]
                );
            }

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
    // POST /medicines
    // =====================================================

    describe("POST /medicines", () => {
        test(
            "Admin should create medicine successfully",
            async () => {
                const manufacturer =
                    await createManufacturer();

                const data = validMedicine(
                    manufacturer.manufacturer_id
                );

                const response = await adminRequest(
                    "post",
                    "/medicines"
                ).send(data);

                if (response.body.data?.medicineId) {
                    medicineIds.add(
                        response.body.data.medicineId
                    );
                }

                expect(response.status).toBe(201);
                expect(response.body.success).toBe(true);
                expect(response.body.message).toBe(
                    "Medicine added successfully."
                );

                const medicine =
                    await getMedicineFromDb(
                        response.body.data.medicineId
                    );

                expect(medicine.name).toBe(data.name);
                expect(medicine.manufacturer_id).toBe(
                    manufacturer.manufacturer_id
                );
                expect(medicine.is_active).toBe(1);
            }
        );

        test(
            "should trim medicine name and category",
            async () => {
                const manufacturer =
                    await createManufacturer();

                const data = validMedicine(
                    manufacturer.manufacturer_id,
                    uniqueName("Paracetamol")
                );

                data.name = `  ${data.name}  `;
                data.category = "  Tablet  ";

                const response = await adminRequest(
                    "post",
                    "/medicines"
                ).send(data);

                if (response.body.data?.medicineId) {
                    medicineIds.add(
                        response.body.data.medicineId
                    );
                }

                expect(response.status).toBe(201);

                const medicine =
                    await getMedicineFromDb(
                        response.body.data.medicineId
                    );

                expect(medicine.name).toBe(
                    data.name.trim()
                );
                expect(medicine.category).toBe("Tablet");
            }
        );

        test(
            "should return 400 when required fields are missing",
            async () => {
                const response = await adminRequest(
                    "post",
                    "/medicines"
                ).send({});

                expect(response.status).toBe(400);
                expect(response.body.message).toBe(
                    "Creation failed. Missing required fields: manufacturer_id, name, category, reorder_level"
                );
            }
        );

        test("should return 400 when name is empty", async () => {
            const manufacturer =
                await createManufacturer();

            const response = await adminRequest(
                "post",
                "/medicines"
            ).send({
                ...validMedicine(
                    manufacturer.manufacturer_id
                ),
                name: "   "
            });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Creation failed. Missing required fields: name"
            );
        });

        test(
            "should return 404 when manufacturer does not exist",
            async () => {
                const response = await adminRequest(
                    "post",
                    "/medicines"
                ).send(validMedicine(999999999));

                expect(response.status).toBe(404);
                expect(response.body.message).toBe(
                    "Manufacturer not found."
                );
            }
        );

        test(
            "should return 409 when manufacturer is inactive",
            async () => {
                const manufacturer =
                    await createManufacturer();

                await setManufacturerActive(
                    manufacturer.manufacturer_id,
                    0
                );

                const response = await adminRequest(
                    "post",
                    "/medicines"
                ).send(
                    validMedicine(
                        manufacturer.manufacturer_id
                    )
                );

                expect(response.status).toBe(409);
                expect(response.body.message).toBe(
                    "Manufacturer is inactive. Restore it before adding medicines."
                );
            }
        );

        test(
            "should return 409 when medicine already exists",
            async () => {
                const manufacturer =
                    await createManufacturer();

                const medicine = await createMedicine(
                    manufacturer.manufacturer_id
                );

                const response = await adminRequest(
                    "post",
                    "/medicines"
                ).send(
                    validMedicine(
                        manufacturer.manufacturer_id,
                        medicine.name
                    )
                );

                expect(response.status).toBe(409);
                expect(response.body.message).toBe(
                    "Medicine already exists."
                );
            }
        );

        test(
            "should return 409 with restore confirmation for inactive duplicate",
            async () => {
                const manufacturer =
                    await createManufacturer();

                const medicine = await createMedicine(
                    manufacturer.manufacturer_id
                );

                await setMedicineActive(
                    medicine.medicine_id,
                    0
                );

                const response = await adminRequest(
                    "post",
                    "/medicines"
                ).send(
                    validMedicine(
                        manufacturer.manufacturer_id,
                        medicine.name
                    )
                );

                expect(response.status).toBe(409);
                expect(response.body.message).toBe(
                    "Medicine is inactive. Do you want to restore it?"
                );

                expect(response.body.data).toEqual({
                    requiresConfirmation: true,
                    medicineId: medicine.medicine_id
                });
            }
        );

        test("should return 401 without token", async () => {
            const response = await request(app)
                .post("/medicines")
                .send({});

            expect(response.status).toBe(401);
            expect(response.body.message).toBe(
                "Access token is required."
            );
        });

        test("should return 403 for Pharmacist", async () => {
            const response = await authRequest(
                "post",
                "/medicines",
                pharmacistToken
            ).send({});

            expect(response.status).toBe(403);
        });

        test("should return 403 for Customer", async () => {
            const response = await authRequest(
                "post",
                "/medicines",
                customerToken
            ).send({});

            expect(response.status).toBe(403);
        });
    });

    // =====================================================
    // GET /medicines
    // =====================================================

    describe("GET /medicines", () => {
        test("Admin should get medicines", async () => {
            const manufacturer =
                await createManufacturer();

            const medicine = await createMedicine(
                manufacturer.manufacturer_id
            );

            const response = await adminRequest(
                "get",
                "/medicines"
            );

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "Medicines retrieved successfully."
            );

            expect(response.body.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        medicine_id: medicine.medicine_id,
                        name: medicine.name
                    })
                ])
            );
        });

        test("Pharmacist should get medicines", async () => {
            const manufacturer =
                await createManufacturer();

            await createMedicine(
                manufacturer.manufacturer_id
            );

            const response = await authRequest(
                "get",
                "/medicines",
                pharmacistToken
            );

            expect(response.status).toBe(200);
            expect(
                Array.isArray(response.body.data)
            ).toBe(true);
        });

        test("Customer should receive 403", async () => {
            const response = await authRequest(
                "get",
                "/medicines",
                customerToken
            );

            expect(response.status).toBe(403);
        });

        test("should return 401 without token", async () => {
            const response = await request(app)
                .get("/medicines");

            expect(response.status).toBe(401);
        });

        test("should return 401 for invalid token", async () => {
            const response = await authRequest(
                "get",
                "/medicines",
                "invalid-token"
            );

            expect(response.status).toBe(401);
            expect(response.body.message).toBe(
                "Invalid or expired token."
            );
        });
    });

    // =====================================================
    // GET /medicines/:medicineId
    // =====================================================

    describe("GET /medicines/:medicineId", () => {
        test("should retrieve medicine by ID", async () => {
            const manufacturer =
                await createManufacturer();

            const medicine = await createMedicine(
                manufacturer.manufacturer_id
            );

            const response = await adminRequest(
                "get",
                `/medicines/${medicine.medicine_id}`
            );

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "Medicine retrieved successfully."
            );
            expect(
                response.body.data.medicine_id
            ).toBe(medicine.medicine_id);
        });

        test("should return 400 for invalid ID", async () => {
            const response = await adminRequest(
                "get",
                "/medicines/abc"
            );

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Invalid medicine ID."
            );
        });

        test(
            "should return 404 for nonexistent medicine",
            async () => {
                const response = await adminRequest(
                    "get",
                    "/medicines/999999999"
                );

                expect(response.status).toBe(404);
                expect(response.body.message).toBe(
                    "Medicine not found."
                );
            }
        );

        test(
            "Pharmacist should retrieve medicine by ID",
            async () => {
                const manufacturer =
                    await createManufacturer();

                const medicine = await createMedicine(
                    manufacturer.manufacturer_id
                );

                const response = await authRequest(
                    "get",
                    `/medicines/${medicine.medicine_id}`,
                    pharmacistToken
                );

                expect(response.status).toBe(200);
            }
        );

        test("Customer should receive 403", async () => {
            const response = await authRequest(
                "get",
                "/medicines/1",
                customerToken
            );

            expect(response.status).toBe(403);
        });
    });

    // =====================================================
    // GET /medicines/search/name
    // =====================================================

    describe("GET /medicines/search/name", () => {
        test("should search medicines by name", async () => {
            const manufacturer =
                await createManufacturer();

            const medicine = await createMedicine(
                manufacturer.manufacturer_id
            );

            const response = await adminRequest(
                "get",
                "/medicines/search/name"
            ).query({
                name: medicine.name
            });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "Medicines retrieved successfully."
            );

            expect(response.body.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        medicine_id: medicine.medicine_id
                    })
                ])
            );
        });

        test(
            "should return 400 when name query is missing",
            async () => {
                const response = await adminRequest(
                    "get",
                    "/medicines/search/name"
                );

                expect(response.status).toBe(400);
                expect(response.body.message).toBe(
                    "Search failed. The 'name' query parameter is missing or empty (e.g., ?name=paracetamol)."
                );
            }
        );

        test(
            "should return 404 when no name matches",
            async () => {
                const response = await adminRequest(
                    "get",
                    "/medicines/search/name"
                ).query({
                    name: `NoMatch-${runId}`
                });

                expect(response.status).toBe(404);
                expect(response.body.message).toBe(
                    "No medicines found."
                );
            }
        );

        test("Pharmacist should search medicines", async () => {
            const manufacturer =
                await createManufacturer();

            const medicine = await createMedicine(
                manufacturer.manufacturer_id
            );

            const response = await authRequest(
                "get",
                "/medicines/search/name",
                pharmacistToken
            ).query({
                name: medicine.name
            });

            expect(response.status).toBe(200);
        });
    });

    // =====================================================
    // GET /medicines/search/manufacturer
    // =====================================================

    describe("GET /medicines/search/manufacturer", () => {
        test(
            "should search by manufacturer name",
            async () => {
                const manufacturer =
                    await createManufacturer();

                const medicine = await createMedicine(
                    manufacturer.manufacturer_id
                );

                const response = await adminRequest(
                    "get",
                    "/medicines/search/manufacturer"
                ).query({
                    manufacturer: manufacturer.name
                });

                expect(response.status).toBe(200);
                expect(response.body.message).toBe(
                    "Medicines retrieved successfully."
                );

                expect(response.body.data).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            medicine_id: medicine.medicine_id
                        })
                    ])
                );
            }
        );

        test(
            "should return 400 when manufacturer query is missing",
            async () => {
                const response = await adminRequest(
                    "get",
                    "/medicines/search/manufacturer"
                );

                expect(response.status).toBe(400);
                expect(response.body.message).toBe(
                    "Search failed. The 'manufacturer' query parameter is missing or empty (e.g., ?manufacturer=Micro Labs)."
                );
            }
        );

        test(
            "should return 404 when no manufacturer matches",
            async () => {
                const response = await adminRequest(
                    "get",
                    "/medicines/search/manufacturer"
                ).query({
                    manufacturer: `NoMatch-${runId}`
                });

                expect(response.status).toBe(404);
                expect(response.body.message).toBe(
                    "No medicines found."
                );
            }
        );
    });

    // =====================================================
    // PUT /medicines/:medicineId
    // =====================================================

    describe("PUT /medicines/:medicineId", () => {
        test(
            "Admin should update medicine successfully",
            async () => {
                const manufacturer =
                    await createManufacturer();

                const medicine = await createMedicine(
                    manufacturer.manufacturer_id
                );

                const updatedName =
                    uniqueName("Updated Medicine");

                const response = await adminRequest(
                    "put",
                    `/medicines/${medicine.medicine_id}`
                ).send({
                    manufacturer_id:
                        manufacturer.manufacturer_id,
                    name: updatedName,
                    category: "Capsule",
                    reorder_level: 20
                });

                expect(response.status).toBe(200);
                expect(response.body.message).toBe(
                    "Medicine updated successfully."
                );

                const updated = await getMedicineFromDb(
                    medicine.medicine_id
                );

                expect(updated.name).toBe(updatedName);
                expect(updated.category).toBe("Capsule");
                expect(updated.reorder_level).toBe(20);
            }
        );

        test(
            "should return 400 when fields are missing",
            async () => {
                const manufacturer =
                    await createManufacturer();

                const medicine = await createMedicine(
                    manufacturer.manufacturer_id
                );

                const response = await adminRequest(
                    "put",
                    `/medicines/${medicine.medicine_id}`
                ).send({});

                expect(response.status).toBe(400);
                expect(response.body.message).toBe(
                    "Update failed. Missing required fields: manufacturer_id, name, category, reorder_level"
                );
            }
        );

        test(
            "should return 404 for nonexistent medicine",
            async () => {
                const manufacturer =
                    await createManufacturer();

                const response = await adminRequest(
                    "put",
                    "/medicines/999999999"
                ).send(
                    validMedicine(
                        manufacturer.manufacturer_id
                    )
                );

                expect(response.status).toBe(404);
                expect(response.body.message).toBe(
                    "Medicine not found."
                );
            }
        );

        test(
            "should return 409 when medicine is inactive",
            async () => {
                const manufacturer =
                    await createManufacturer();

                const medicine = await createMedicine(
                    manufacturer.manufacturer_id
                );

                await setMedicineActive(
                    medicine.medicine_id,
                    0
                );

                const response = await adminRequest(
                    "put",
                    `/medicines/${medicine.medicine_id}`
                ).send(
                    validMedicine(
                        manufacturer.manufacturer_id
                    )
                );

                expect(response.status).toBe(409);
                expect(response.body.message).toBe(
                    "Medicine is inactive. Restore it before updating."
                );
            }
        );

        test(
            "should return 409 when updating to duplicate medicine name",
            async () => {
                const manufacturer =
                    await createManufacturer();

                const medicine1 = await createMedicine(
                    manufacturer.manufacturer_id
                );

                const medicine2 = await createMedicine(
                    manufacturer.manufacturer_id
                );

                const response = await adminRequest(
                    "put",
                    `/medicines/${medicine1.medicine_id}`
                ).send(
                    validMedicine(
                        manufacturer.manufacturer_id,
                        medicine2.name
                    )
                );

                expect(response.status).toBe(409);
                expect(response.body.message).toBe(
                    "Medicine already exists."
                );
            }
        );

        test(
            "should return 404 for invalid manufacturer on update",
            async () => {
                const manufacturer =
                    await createManufacturer();

                const medicine = await createMedicine(
                    manufacturer.manufacturer_id
                );

                const response = await adminRequest(
                    "put",
                    `/medicines/${medicine.medicine_id}`
                ).send(validMedicine(999999999));

                expect(response.status).toBe(404);
                expect(response.body.message).toBe(
                    "Manufacturer not found."
                );
            }
        );

        test(
            "Pharmacist should receive 403 when updating medicine",
            async () => {
                const response = await authRequest(
                    "put",
                    "/medicines/1",
                    pharmacistToken
                ).send({});

                expect(response.status).toBe(403);
            }
        );
    });

    // =====================================================
    // PATCH /medicines/:medicineId/deactivate
    // =====================================================

    describe(
        "PATCH /medicines/:medicineId/deactivate",
        () => {
            test(
                "Admin should deactivate medicine",
                async () => {
                    const manufacturer =
                        await createManufacturer();

                    const medicine = await createMedicine(
                        manufacturer.manufacturer_id
                    );

                    const response = await adminRequest(
                        "patch",
                        `/medicines/${medicine.medicine_id}/deactivate`
                    );

                    expect(response.status).toBe(200);
                    expect(response.body.message).toBe(
                        "Medicine deactivated successfully."
                    );

                    const updated =
                        await getMedicineFromDb(
                            medicine.medicine_id
                        );

                    expect(updated.is_active).toBe(0);
                }
            );

            test(
                "should return 400 when medicine is already inactive",
                async () => {
                    const manufacturer =
                        await createManufacturer();

                    const medicine = await createMedicine(
                        manufacturer.manufacturer_id
                    );

                    await setMedicineActive(
                        medicine.medicine_id,
                        0
                    );

                    const response = await adminRequest(
                        "patch",
                        `/medicines/${medicine.medicine_id}/deactivate`
                    );

                    expect(response.status).toBe(400);
                    expect(response.body.message).toBe(
                        "Medicine is already inactive."
                    );
                }
            );

            test(
                "should return 404 for nonexistent medicine",
                async () => {
                    const response = await adminRequest(
                        "patch",
                        "/medicines/999999999/deactivate"
                    );

                    expect(response.status).toBe(404);
                    expect(response.body.message).toBe(
                        "Medicine not found."
                    );
                }
            );

            test(
                "Pharmacist should not deactivate medicine",
                async () => {
                    const response = await authRequest(
                        "patch",
                        "/medicines/1/deactivate",
                        pharmacistToken
                    );

                    expect(response.status).toBe(403);
                }
            );
        }
    );

    // =====================================================
    // PATCH /medicines/:medicineId/restore
    // =====================================================

    describe(
        "PATCH /medicines/:medicineId/restore",
        () => {
            test(
                "Admin should restore medicine successfully",
                async () => {
                    const manufacturer =
                        await createManufacturer();

                    const medicine = await createMedicine(
                        manufacturer.manufacturer_id
                    );

                    await setMedicineActive(
                        medicine.medicine_id,
                        0
                    );

                    const response = await adminRequest(
                        "patch",
                        `/medicines/${medicine.medicine_id}/restore`
                    );

                    expect(response.status).toBe(200);
                    expect(response.body.message).toBe(
                        "Medicine restored successfully."
                    );

                    const updated =
                        await getMedicineFromDb(
                            medicine.medicine_id
                        );

                    expect(updated.is_active).toBe(1);
                }
            );

            test(
                "should return 400 when medicine is already active",
                async () => {
                    const manufacturer =
                        await createManufacturer();

                    const medicine = await createMedicine(
                        manufacturer.manufacturer_id
                    );

                    const response = await adminRequest(
                        "patch",
                        `/medicines/${medicine.medicine_id}/restore`
                    );

                    expect(response.status).toBe(400);
                    expect(response.body.message).toBe(
                        "Medicine is already active."
                    );
                }
            );

            test(
                "should return 409 when manufacturer is inactive",
                async () => {
                    const manufacturer =
                        await createManufacturer();

                    const medicine = await createMedicine(
                        manufacturer.manufacturer_id
                    );

                    await setMedicineActive(
                        medicine.medicine_id,
                        0
                    );

                    await setManufacturerActive(
                        manufacturer.manufacturer_id,
                        0
                    );

                    const response = await adminRequest(
                        "patch",
                        `/medicines/${medicine.medicine_id}/restore`
                    );

                    expect(response.status).toBe(409);
                    expect(response.body.message).toBe(
                        "Manufacturer is inactive. Restore the manufacturer first."
                    );
                }
            );

            test(
                "should return 404 for nonexistent medicine",
                async () => {
                    const response = await adminRequest(
                        "patch",
                        "/medicines/999999999/restore"
                    );

                    expect(response.status).toBe(404);
                    expect(response.body.message).toBe(
                        "Medicine not found."
                    );
                }
            );

            test(
                "Customer should not restore medicine",
                async () => {
                    const response = await authRequest(
                        "patch",
                        "/medicines/1/restore",
                        customerToken
                    );

                    expect(response.status).toBe(403);
                }
            );
        }
    );


    
describe("Advanced JWT Security Tests", () => {

    test("expired JWT should return 401", async () => {
        const payload = jwt.decode(adminToken);

        const expiredToken = jwt.sign(
            {
                userId: payload.userId,
                token_version: payload.token_version
            },
            process.env.JWT_SECRET,
            { expiresIn: "-1s" }
        );

        const response = await request(app)
            .get("/medicines")
            .set(
                "Authorization",
                `Bearer ${expiredToken}`
            );

        expect(response.status).toBe(401);
        expect(response.body.message).toBe(
            "Invalid or expired token."
        );
    });

    test("revoked JWT should return 401", async () => {
        const payload = jwt.decode(adminToken);

        try {
            await db.execute(
                `UPDATE users
                 SET token_version = token_version + 1
                 WHERE user_id = ?`,
                [payload.userId]
            );

            const response = await request(app)
                .get("/medicines")
                .set(
                    "Authorization",
                    `Bearer ${adminToken}`
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
                [
                    payload.token_version,
                    payload.userId
                ]
            );
        }
    });

    test("deactivated Admin should return 401", async () => {
        const payload = jwt.decode(adminToken);

        try {
            await db.execute(
                `UPDATE users
                 SET is_active = 0
                 WHERE user_id = ?`,
                [payload.userId]
            );

            const response = await request(app)
                .get("/medicines")
                .set(
                    "Authorization",
                    `Bearer ${adminToken}`
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
                [payload.userId]
            );
        }
    });

    test("authorization should use updated database role", async () => {
        const payload = jwt.decode(adminToken);

        try {
            await db.execute(
                `UPDATE users
                 SET role = 'Customer'
                 WHERE user_id = ?`,
                [payload.userId]
            );

            const response = await request(app)
                .get("/medicines")
                .set(
                    "Authorization",
                    `Bearer ${adminToken}`
                );

            expect(response.status).toBe(403);
        } finally {
            await db.execute(
                `UPDATE users
                 SET role = 'Admin'
                 WHERE user_id = ?`,
                [payload.userId]
            );
        }
    });

});

});
