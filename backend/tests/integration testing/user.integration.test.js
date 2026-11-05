
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const request = require("supertest");

const db = require("../../config/db");
const app = require("../../app");

describe("User Integration Tests", () => {
    const password = "Test@123";
    const runId = `${process.pid}-${Date.now()}`;
    const roles = ["Admin", "Pharmacist", "Customer"];

    const users = {};
    let originalHash;
    let nextRegistration = 0;
    let databaseVerified = false;

    // =====================================================
    // HELPERS
    // =====================================================

    const auth = (role) => ({
        Authorization: `Bearer ${users[role].token}`
    });

    const readUser = async (id) => {
        const [rows] = await db.execute(
            "SELECT * FROM users WHERE user_id = ?",
            [id]
        );

        return rows[0];
    };

    const errorResponse = (status, message) => ({
        status,
        success: false,
        message,
        data: null
    });

    const registerData = (role = "Customer") => ({
        name: `Registered ${role}`,
        email:
            `jest-user-${runId}-register-${++nextRegistration}@test.com`,
        password,
        role
    });

    // =====================================================
    // SETUP
    // =====================================================

    beforeAll(async () => {
        // Verify the ACTUAL connected database before
        // inserting any test records.
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

        databaseVerified = true;

        originalHash = await bcrypt.hash(password, 10);

        for (const role of roles) {
            const name = `Integration ${role}`;
            const email =
                `jest-user-${runId}-${role.toLowerCase()}@test.com`;

            const [result] = await db.execute(
                `INSERT INTO users
                 (name, email, password_hash, role)
                 VALUES (?, ?, ?, ?)`,
                [name, email, originalHash, role]
            );

            users[role] = {
                id: result.insertId,
                name,
                email,
                role
            };

            // Use the real login endpoint to generate
            // a JWT containing the correct token_version.
            const response = await request(app)
                .post("/users/login")
                .send({ email, password });

            expect(response.status).toBe(200);
            expect(response.body.data.token)
                .toEqual(expect.any(String));

            users[role].token = response.body.data.token;
        }
    });

    // =====================================================
    // RESET TEST DATA AFTER EACH TEST
    // =====================================================

    afterEach(async () => {
        if (!databaseVerified) return;

        // Remove registered test accounts.
        await db.execute(
            "DELETE FROM users WHERE email LIKE ?",
            [`jest-user-${runId}-register-%@test.com`]
        );

        for (const user of Object.values(users)) {
            // Restore account details for the next test.
            await db.execute(
                `UPDATE users
                 SET name = ?,
                     email = ?,
                     password_hash = ?,
                     role = ?,
                     is_active = 1
                 WHERE user_id = ?`,
                [
                    user.name,
                    user.email,
                    originalHash,
                    user.role,
                    user.id
                ]
            );

            // IMPORTANT:
            // Password changes and account deactivation
            // may increase token_version in the database.
            //
            // Restoring the password alone does NOT make
            // an old JWT valid again.
            const [rows] = await db.execute(
                `SELECT token_version
                 FROM users
                 WHERE user_id = ?`,
                [user.id]
            );

            const currentVersion = Number(
                rows[0]?.token_version
            );

            if (
                rows[0]?.token_version == null ||
                !Number.isSafeInteger(currentVersion) ||
                currentVersion < 0
            ) {
                throw new Error(
                    `Invalid token_version for ${user.role} test account.`
                );
            }

            const oldClaims = jwt.decode(user.token);

            // Only re-login if the existing JWT was revoked.
            // This keeps integration testing fast.
            if (
                oldClaims?.token_version !== currentVersion
            ) {
                const login = await request(app)
                    .post("/users/login")
                    .send({
                        email: user.email,
                        password
                    });

                expect(login.status).toBe(200);

                user.token = login.body.data.token;
            }
        }
    });

    // =====================================================
    // FINAL CLEANUP
    // =====================================================

    afterAll(async () => {
        try {
            if (!databaseVerified) return;

            await db.execute(
                "DELETE FROM users WHERE email LIKE ?",
                [`jest-user-${runId}-register-%@test.com`]
            );

            for (const user of Object.values(users)) {
                await db.execute(
                    "DELETE FROM users WHERE user_id = ?",
                    [user.id]
                );
            }
        } finally {
            await db.end();
        }
    });

    // =====================================================
    // POST /users/login
    // =====================================================

    describe("POST /users/login", () => {
        test.each(roles)(
            "%s logs in successfully",
            async (role) => {
                const user = users[role];

                const response = await request(app)
                    .post("/users/login")
                    .send({
                        email: user.email,
                        password
                    });

                expect(response.status).toBe(200);
                expect(response.body.message).toBe(
                    "Login successful."
                );

                expect(response.body.data.token)
                    .toEqual(expect.any(String));

                expect(response.body.data.user).toEqual({
                    user_id: user.id,
                    name: user.name,
                    email: user.email,
                    role
                });
            }
        );

        test("rejects unknown email", async () => {
            const response = await request(app)
                .post("/users/login")
                .send({
                    email: `missing-${runId}@test.com`,
                    password
                });

            expect(response.body).toEqual(
                errorResponse(
                    401,
                    "Email is not registered."
                )
            );
        });

        test("rejects wrong password", async () => {
            const response = await request(app)
                .post("/users/login")
                .send({
                    email: users.Admin.email,
                    password: "wrong"
                });

            expect(response.body).toEqual(
                errorResponse(
                    401,
                    "Incorrect password."
                )
            );
        });

        test("rejects inactive user", async () => {
            await db.execute(
                `UPDATE users
                 SET is_active = 0
                 WHERE user_id = ?`,
                [users.Admin.id]
            );

            const response = await request(app)
                .post("/users/login")
                .send({
                    email: users.Admin.email,
                    password
                });

            expect(response.body).toEqual(
                errorResponse(
                    409,
                    "User account is inactive. Please contact the administrator."
                )
            );
        });
    });

    // =====================================================
    // POST /users/register
    // =====================================================

    describe("POST /users/register", () => {
        test.each(roles)(
            "registers a %s",
            async (role) => {
                const data = registerData(role);

                const response = await request(app)
                    .post("/users/register")
                    .send(data);

                expect(response.status).toBe(201);
                expect(response.body.message).toBe(
                    "User registered successfully."
                );

                expect(response.body.data.userId)
                    .toEqual(expect.any(Number));

                const stored = await readUser(
                    response.body.data.userId
                );

                expect(stored).toEqual(
                    expect.objectContaining({
                        name: data.name,
                        email: data.email,
                        role
                    })
                );
            }
        );

        test("rejects existing active email", async () => {
            const response = await request(app)
                .post("/users/register")
                .send({
                    name: "Duplicate",
                    email: users.Admin.email,
                    password,
                    role: "Admin"
                });

            expect(response.body).toEqual(
                errorResponse(
                    409,
                    "Email is already registered."
                )
            );
        });

        test("rejects existing inactive email", async () => {
            await db.execute(
                `UPDATE users
                 SET is_active = 0
                 WHERE user_id = ?`,
                [users.Admin.id]
            );

            const response = await request(app)
                .post("/users/register")
                .send({
                    name: "Duplicate",
                    email: users.Admin.email,
                    password,
                    role: "Admin"
                });

            expect(response.body).toEqual(
                errorResponse(
                    409,
                    "User account is inactive. Please contact the administrator."
                )
            );
        });
    });

    // =====================================================
    // GET /users
    // =====================================================

    describe("GET /users", () => {
        test("Admin gets users from database", async () => {
            const response = await request(app)
                .get("/users")
                .set(auth("Admin"));

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "Users retrieved successfully."
            );

            expect(response.body.data).toEqual(
                expect.arrayContaining(
                    roles.map((role) =>
                        expect.objectContaining({
                            user_id: users[role].id,
                            role,
                            is_active: 1
                        })
                    )
                )
            );
        });

        test.each(["Pharmacist", "Customer"])(
            "%s cannot list users",
            async (role) => {
                const response = await request(app)
                    .get("/users")
                    .set(auth(role));

                expect(response.status).toBe(403);
            }
        );

        test("rejects missing and invalid tokens", async () => {
            const missing = await request(app)
                .get("/users");

            const invalid = await request(app)
                .get("/users")
                .set(
                    "Authorization",
                    "Bearer invalid-token"
                );

            expect(missing.body).toEqual(
                errorResponse(
                    401,
                    "Access token is required."
                )
            );

            expect(invalid.body).toEqual(
                errorResponse(
                    401,
                    "Invalid or expired token."
                )
            );
        });
    });

    // =====================================================
    // GET /users/:userId
    // =====================================================

    describe("GET /users/:userId", () => {
        test("Admin gets user by ID", async () => {
            const response = await request(app)
                .get(`/users/${users.Customer.id}`)
                .set(auth("Admin"));

            expect(response.status).toBe(200);

            expect(response.body.data).toEqual(
                expect.objectContaining({
                    user_id: users.Customer.id,
                    email: users.Customer.email
                })
            );
        });

        test("rejects invalid ID", async () => {
            const response = await request(app)
                .get("/users/abc")
                .set(auth("Admin"));

            expect(response.body).toEqual(
                errorResponse(
                    400,
                    "Invalid user ID."
                )
            );
        });

        test("returns 404 for unknown ID", async () => {
            const response = await request(app)
                .get("/users/999999999")
                .set(auth("Admin"));

            expect(response.body).toEqual(
                errorResponse(
                    404,
                    "User not found."
                )
            );
        });
    });

    // =====================================================
    // PUT /users/:userId
    // =====================================================

    describe("PUT /users/:userId", () => {
        test("Admin updates user and database", async () => {
            const response = await request(app)
                .put(`/users/${users.Customer.id}`)
                .set(auth("Admin"))
                .send({
                    name: "Updated Customer",
                    email: `updated-${runId}@test.com`
                });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "User updated successfully."
            );

            const stored = await readUser(
                users.Customer.id
            );

            expect(stored).toEqual(
                expect.objectContaining({
                    name: "Updated Customer",
                    email: `updated-${runId}@test.com`
                })
            );
        });

        test("returns 409 for duplicate email", async () => {
            const response = await request(app)
                .put(`/users/${users.Customer.id}`)
                .set(auth("Admin"))
                .send({
                    name: "Customer",
                    email: users.Admin.email
                });

            expect(response.body).toEqual(
                errorResponse(
                    409,
                    "Email is already registered."
                )
            );
        });

        test("returns 409 when user is inactive", async () => {
            await db.execute(
                `UPDATE users
                 SET is_active = 0
                 WHERE user_id = ?`,
                [users.Customer.id]
            );

            const response = await request(app)
                .put(`/users/${users.Customer.id}`)
                .set(auth("Admin"))
                .send({
                    name: "Customer",
                    email: users.Customer.email
                });

            expect(response.body).toEqual(
                errorResponse(
                    409,
                    "User account is inactive. Restore it before updating."
                )
            );
        });
    });

    // =====================================================
    // PATCH /users/change-password
    // =====================================================

    describe("PATCH /users/change-password", () => {
        const endpoint = "/users/change-password";

        test("changes password and allows new login", async () => {
            const response = await request(app)
                .patch(endpoint)
                .set(auth("Customer"))
                .send({
                    currentPassword: password,
                    newPassword: "NewTest@123"
                });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "Password changed successfully."
            );

            const login = await request(app)
                .post("/users/login")
                .send({
                    email: users.Customer.email,
                    password: "NewTest@123"
                });

            expect(login.status).toBe(200);
        });

        test("rejects incorrect current password", async () => {
            const response = await request(app)
                .patch(endpoint)
                .set(auth("Customer"))
                .send({
                    currentPassword: "wrong",
                    newPassword: "NewTest@123"
                });

            expect(response.body).toEqual(
                errorResponse(
                    401,
                    "Current password is incorrect."
                )
            );
        });

        test("rejects same new password", async () => {
            const response = await request(app)
                .patch(endpoint)
                .set(auth("Customer"))
                .send({
                    currentPassword: password,
                    newPassword: password
                });

            expect(response.body).toEqual(
                errorResponse(
                    400,
                    "New password cannot be the same as the current password."
                )
            );
        });

        test("rejects inactive user", async () => {
            await db.execute(
                `UPDATE users
                 SET is_active = 0
                 WHERE user_id = ?`,
                [users.Customer.id]
            );

            const response = await request(app)
                .patch(endpoint)
                .set(auth("Customer"))
                .send({
                    currentPassword: password,
                    newPassword: "NewTest@123"
                });

            // Authentication rejects inactive accounts
            // before the service runs.
            expect(response.body).toEqual(
                errorResponse(
                    401,
                    "Your account has been deactivated. Please contact the administrator."
                )
            );
        });

        test("returns 401 when JWT refers to missing user", async () => {
            // Copy valid JWT claims from a real test account.
            // Change only userId to a nonexistent account.
            const existingClaims = jwt.decode(
                users.Customer.token
            );

            const token = jwt.sign(
                {
                    userId: 999999999,
                    email: users.Customer.email,
                    role: "Customer",
                    token_version:
                        existingClaims.token_version
                },
                process.env.JWT_SECRET,
                {
                    algorithm: "HS256",
                    expiresIn: "1h"
                }
            );

            const response = await request(app)
                .patch(endpoint)
                .set(
                    "Authorization",
                    `Bearer ${token}`
                )
                .send({
                    currentPassword: password,
                    newPassword: "NewTest@123"
                });

            // JWT is correctly signed, but the user
            // does not exist in the database.
            expect(response.body).toEqual(
                errorResponse(
                    401,
                    "Your account is no longer available."
                )
            );
        });
    });

    // =====================================================
    // PATCH /users/:userId/role
    // =====================================================

    describe("PATCH /users/:userId/role", () => {
        const url = () =>
            `/users/${users.Customer.id}/role`;

        test("Admin changes role in database", async () => {
            const response = await request(app)
                .patch(url())
                .set(auth("Admin"))
                .send({
                    role: "Pharmacist"
                });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "User role updated successfully."
            );

            const stored = await readUser(
                users.Customer.id
            );

            expect(stored.role).toBe("Pharmacist");
        });

        test("rejects invalid role", async () => {
            const response = await request(app)
                .patch(url())
                .set(auth("Admin"))
                .send({
                    role: "Manager"
                });

            expect(response.body).toEqual(
                errorResponse(
                    400,
                    "Invalid role."
                )
            );
        });

        test("rejects same role", async () => {
            const response = await request(app)
                .patch(url())
                .set(auth("Admin"))
                .send({
                    role: "Customer"
                });

            expect(response.body).toEqual(
                errorResponse(
                    400,
                    "The user is already assigned to the 'Customer' role."
                )
            );
        });
    });

    // =====================================================
    // PATCH /users/:userId/deactivate
    // =====================================================

    describe("PATCH /users/:userId/deactivate", () => {
        const url = () =>
            `/users/${users.Customer.id}/deactivate`;

        test("Admin deactivates user in database", async () => {
            const response = await request(app)
                .patch(url())
                .set(auth("Admin"));

            expect(response.status).toBe(200);

            const stored = await readUser(
                users.Customer.id
            );

            expect(stored.is_active).toBe(0);
        });

        test("rejects already inactive user", async () => {
            await db.execute(
                `UPDATE users
                 SET is_active = 0
                 WHERE user_id = ?`,
                [users.Customer.id]
            );

            const response = await request(app)
                .patch(url())
                .set(auth("Admin"));

            expect(response.body).toEqual(
                errorResponse(
                    400,
                    "User is already inactive."
                )
            );
        });
    });

    // =====================================================
    // PATCH /users/:userId/restore
    // =====================================================

    describe("PATCH /users/:userId/restore", () => {
        const url = () =>
            `/users/${users.Customer.id}/restore`;

        test("Admin restores inactive user in database", async () => {
            await db.execute(
                `UPDATE users
                 SET is_active = 0
                 WHERE user_id = ?`,
                [users.Customer.id]
            );

            const response = await request(app)
                .patch(url())
                .set(auth("Admin"));

            expect(response.status).toBe(200);

            const stored = await readUser(
                users.Customer.id
            );

            expect(stored.is_active).toBe(1);
        });

        test("rejects already active user", async () => {
            const response = await request(app)
                .patch(url())
                .set(auth("Admin"));

            expect(response.body).toEqual(
                errorResponse(
                    400,
                    "User is already active."
                )
            );
        });
    });

    // =====================================================
    // PROTECTED ROUTE AUTHORIZATION
    // =====================================================

    describe("Protected route authorization", () => {
        const adminOnly = [
            ["get", "/users"],
            ["get", "/users/1"],
            ["put", "/users/1"],
            ["patch", "/users/1/role"],
            ["patch", "/users/1/deactivate"],
            ["patch", "/users/1/restore"]
        ];

        test.each(adminOnly)(
            "%s %s rejects Customer",
            async (method, path) => {
                const response = await request(app)[method](
                    path
                ).set(auth("Customer"));

                expect(response.status).toBe(403);
            }
        );
    });
});
