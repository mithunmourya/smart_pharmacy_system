
const request = require("supertest");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = require("../../app");
const db = require("../../config/db");

describe("Pharmacist Customer Workflow Integration Tests", () => {
    const runId = `${process.pid}-${Date.now()}`;
    const fixtureIds = [];
    const createdEmails = new Set();
    const accounts = {};

    let databaseVerified = false;
    let sequence = 0;

    const uniqueEmail = () =>
        `pharmacy-created-${runId}-${++sequence}@test.com`;

    // ==========================================
    // TEST HELPERS
    // ==========================================

    const api = (method, path, role = "Pharmacist") =>
        request(app)[method](path).set(
            "Authorization",
            `Bearer ${accounts[role].token}`
        );

    const getUserByEmail = async (email) => {
        const [rows] = await db.execute(
            "SELECT * FROM users WHERE email = ?",
            [email]
        );

        return rows[0];
    };

    const createFixtureUser = async (
        role,
        label,
        active = true
    ) => {
        const email = `pharmacy-${label}-${runId}@test.com`;
        const hash = await bcrypt.hash("Test@123", 10);

        const [result] = await db.execute(
            `INSERT INTO users
             (name, email, password_hash, role)
             VALUES (?, ?, ?, ?)`,
            [`Test ${label}`, email, hash, role]
        );

        fixtureIds.push(result.insertId);

        if (!active) {
            await db.execute(
                `UPDATE users
                 SET is_active = 0
                 WHERE user_id = ?`,
                [result.insertId]
            );
        }

        // Fetch actual token version from database.
        const [rows] = await db.execute(
            `SELECT user_id, email, role,
                    is_active, token_version
             FROM users
             WHERE user_id = ?`,
            [result.insertId]
        );

        const user = rows[0];
        const version = Number(user.token_version);

        if (
            user.token_version == null ||
            !Number.isSafeInteger(version) ||
            version < 0
        ) {
            throw new Error(
                `Invalid token_version for ${label}`
            );
        }

        return {
            id: Number(user.user_id),
            email: user.email,
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

    // ==========================================
    // DATABASE SETUP
    // ==========================================

    beforeAll(async () => {
        const [rows] = await db.execute(
            "SELECT DATABASE() AS db_name"
        );

        if (
            rows[0]?.db_name !== "smart_pharmacy_test"
        ) {
            throw new Error(
                `Unsafe integration database: ${rows[0]?.db_name}`
            );
        }

        databaseVerified = true;

        accounts.Pharmacist = await createFixtureUser(
            "Pharmacist",
            "pharmacist"
        );

        accounts.Admin = await createFixtureUser(
            "Admin",
            "admin"
        );

        accounts.Customer = await createFixtureUser(
            "Customer",
            "customer"
        );

        accounts.InactiveCustomer =
            await createFixtureUser(
                "Customer",
                "inactive-customer",
                false
            );
    });

    // ==========================================
    // CLEANUP
    // ==========================================

    afterEach(async () => {
        if (!databaseVerified) return;

        for (const email of createdEmails) {
            await db.execute(
                "DELETE FROM users WHERE email = ?",
                [email]
            );
        }

        createdEmails.clear();
    });

    afterAll(async () => {
        try {
            if (databaseVerified) {
                for (const email of createdEmails) {
                    await db.execute(
                        "DELETE FROM users WHERE email = ?",
                        [email]
                    );
                }

                for (const id of fixtureIds.reverse()) {
                    await db.execute(
                        "DELETE FROM users WHERE user_id = ?",
                        [id]
                    );
                }
            }
        } finally {
            await db.end();
        }
    });

    // ==========================================
    // GET /users/customers/lookup
    // ==========================================

    describe("GET /users/customers/lookup", () => {
        const url = "/users/customers/lookup";

        test("Pharmacist finds an active customer", async () => {
            const response = await api(
                "get",
                url
            ).query({
                email: accounts.Customer.email
            });

            expect(response.status).toBe(200);

            expect(response.body.message).toBe(
                "Customer found successfully."
            );

            expect(response.body.data).toEqual({
                user_id: accounts.Customer.id,
                name: "Test customer",
                email: accounts.Customer.email
            });

            // Never expose sensitive account details.
            expect(response.body.data)
                .not.toHaveProperty("password_hash");

            expect(response.body.data)
                .not.toHaveProperty("token_version");
        });

        test(
            "Pharmacist can look up an inactive customer",
            async () => {
                const response = await api(
                    "get",
                    url
                ).query({
                    email: accounts.InactiveCustomer.email
                });

                expect(response.status).toBe(200);

                expect(response.body.data.user_id).toBe(
                    accounts.InactiveCustomer.id
                );
            }
        );

        test("trims surrounding email whitespace", async () => {
            const response = await api(
                "get",
                url
            ).query({
                email: `  ${accounts.Customer.email}  `
            });

            expect(response.status).toBe(200);
        });

        test(
            "rejects staff accounts as customers",
            async () => {
                const response = await api(
                    "get",
                    url
                ).query({
                    email: accounts.Admin.email
                });

                expect(response.status).toBe(409);

                expect(response.body.message).toBe(
                    "This email belongs to a staff account and cannot be selected as a customer."
                );
            }
        );

        test("returns 404 for unknown email", async () => {
            const response = await api(
                "get",
                url
            ).query({
                email: uniqueEmail()
            });

            expect(response.status).toBe(404);

            expect(response.body.message).toBe(
                "No customer account found for this email."
            );
        });

        test("requires an email", async () => {
            const response = await api("get", url);

            expect(response.status).toBe(400);

            expect(response.body.message).toBe(
                "Customer email is required."
            );
        });

        test("rejects an invalid email", async () => {
            const response = await api(
                "get",
                url
            ).query({
                email: "invalid-email"
            });

            expect(response.status).toBe(400);

            expect(response.body.message).toBe(
                "Enter a valid email address."
            );
        });

        test.each(["Admin", "Customer"])(
            "%s cannot look up customers",
            async (role) => {
                const response = await api(
                    "get",
                    url,
                    role
                ).query({
                    email: accounts.Customer.email
                });

                expect(response.status).toBe(403);
            }
        );

        test(
            "rejects a request without a token",
            async () => {
                const response = await request(app)
                    .get(url);

                expect(response.status).toBe(401);
            }
        );

        test("rejects an invalid token", async () => {
            const response = await request(app)
                .get(url)
                .set(
                    "Authorization",
                    "Bearer invalid-token"
                );

            expect(response.status).toBe(401);
        });
    });

    // ==========================================
    // POST /users/customers
    // ==========================================

    describe("POST /users/customers", () => {
        const url = "/users/customers";

        test(
            "Pharmacist creates a Customer with normalized details",
            async () => {
                const email = uniqueEmail();

                // Track email before making the API call.
                createdEmails.add(email);

                const response = await api(
                    "post",
                    url
                ).send({
                    name: "  New Customer  ",
                    email: `  ${email}  `,
                    role: "Admin"
                });

                expect(response.status).toBe(201);

                expect(response.body.message).toBe(
                    "Customer account created successfully."
                );

                expect(response.body.data).toEqual({
                    user_id: expect.any(Number),
                    name: "New Customer",
                    email
                });

                // Verify actual MySQL record.
                const saved = await getUserByEmail(email);

                expect(saved.user_id).toBe(
                    response.body.data.user_id
                );

                expect(saved.name).toBe("New Customer");

                // Client cannot create an Admin here.
                expect(saved.role).toBe("Customer");

                expect(Number(saved.is_active)).toBe(1);

                expect(saved.password_hash).toEqual(
                    expect.any(String)
                );

                expect(response.body.data)
                    .not.toHaveProperty("password_hash");
            }
        );

        test("rejects an already registered email", async () => {
            const response = await api(
                "post",
                url
            ).send({
                name: "Duplicate Customer",
                email: accounts.Customer.email
            });

            expect(response.status).toBe(409);

            expect(response.body.message).toBe(
                "Email is already registered. Search for the existing customer account."
            );
        });

        test(
            "rejects an inactive customer's existing email",
            async () => {
                const response = await api(
                    "post",
                    url
                ).send({
                    name: "Duplicate Customer",
                    email: accounts.InactiveCustomer.email
                });

                expect(response.status).toBe(409);
            }
        );

        test("requires a customer name", async () => {
            const response = await api(
                "post",
                url
            ).send({
                name: "  ",
                email: uniqueEmail()
            });

            expect(response.status).toBe(400);

            expect(response.body.message).toBe(
                "Customer name is required."
            );
        });

        test(
            "rejects a name longer than 100 characters",
            async () => {
                const response = await api(
                    "post",
                    url
                ).send({
                    name: "A".repeat(101),
                    email: uniqueEmail()
                });

                expect(response.status).toBe(400);

                expect(response.body.message).toBe(
                    "Customer name must be 100 characters or fewer."
                );
            }
        );

        test("requires an email", async () => {
            const response = await api(
                "post",
                url
            ).send({
                name: "New Customer"
            });

            expect(response.status).toBe(400);

            expect(response.body.message).toBe(
                "Customer email is required."
            );
        });

        test("rejects an invalid email", async () => {
            const response = await api(
                "post",
                url
            ).send({
                name: "New Customer",
                email: "not-an-email"
            });

            expect(response.status).toBe(400);

            expect(response.body.message).toBe(
                "Enter a valid email address."
            );
        });

        test.each(["Admin", "Customer"])(
            "%s cannot create customers",
            async (role) => {
                const email = uniqueEmail();

                const response = await api(
                    "post",
                    url,
                    role
                ).send({
                    name: "Forbidden Customer",
                    email
                });

                expect(response.status).toBe(403);

                // A forbidden request must not insert a user.
                expect(
                    await getUserByEmail(email)
                ).toBeUndefined();
            }
        );

        test(
            "rejects a request without a token",
            async () => {
                const response = await request(app)
                    .post(url)
                    .send({
                        name: "Unknown",
                        email: uniqueEmail()
                    });

                expect(response.status).toBe(401);
            }
        );

        test("rejects an invalid token", async () => {
            const response = await request(app)
                .post(url)
                .set(
                    "Authorization",
                    "Bearer invalid-token"
                )
                .send({
                    name: "Unknown",
                    email: uniqueEmail()
                });

            expect(response.status).toBe(401);
        });
    });
});
