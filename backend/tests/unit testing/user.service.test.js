
// tests/unit testing/user.service.test.js
// Real service logic, mocked database model and bcrypt.

require("dotenv").config();

const jwt = require("jsonwebtoken");

jest.mock("../../models/user.model");
jest.mock("bcrypt");

const userModel = require("../../models/user.model");
const bcrypt = require("bcrypt");
const userService = require("../../services/user.service");

// =========================================================
// COMMON TEST DATA
// =========================================================

const activeUser = {
    user_id: 1,
    name: "Mithun",
    email: "mithun@gmail.com",
    password_hash: "storedHash",
    role: "Customer",
    created_at: "2026-01-01",
    is_active: 1,
    token_version: 0
};

const registration = {
    name: "Mithun",
    email: "mithun@gmail.com",
    password: "password123",
    role: "Customer"
};

const expectFailure = (result, status, message) => {
    expect(result).toEqual({
        status,
        success: false,
        message,
        data: null
    });
};

// Reset all mocks before each test.
beforeEach(() => {
    jest.resetAllMocks();
});

describe("User Service", () => {

    // =========================================================
    // 1. REGISTER USER
    // =========================================================

    describe("registerUser", () => {

        test("returns 409 when email is already registered", async () => {
            userModel.getUserByEmail.mockResolvedValue({
                ...activeUser
            });

            const result = await userService.registerUser(registration);

            expectFailure(
                result,
                409,
                "Email is already registered."
            );

            expect(bcrypt.hash).not.toHaveBeenCalled();
            expect(userModel.createUser).not.toHaveBeenCalled();
        });

        test("returns 409 when existing account is inactive", async () => {
            userModel.getUserByEmail.mockResolvedValue({
                ...activeUser,
                is_active: 0
            });

            const result = await userService.registerUser(registration);

            expectFailure(
                result,
                409,
                "User account is inactive. Please contact the administrator."
            );

            expect(userModel.createUser).not.toHaveBeenCalled();
        });

        test("registers a new user with a hashed password", async () => {
            // Arrange
            userModel.getUserByEmail.mockResolvedValue(null);
            bcrypt.hash.mockResolvedValue("hashedPassword");
            userModel.createUser.mockResolvedValue(10);

            // Act
            const result = await userService.registerUser(registration);

            // Assert
            expect(result).toEqual({
                status: 201,
                success: true,
                message: "User registered successfully.",
                data: {
                    userId: 10
                }
            });

            expect(userModel.getUserByEmail)
                .toHaveBeenCalledWith("mithun@gmail.com");

            expect(bcrypt.hash)
                .toHaveBeenCalledWith("password123", 10);

            expect(userModel.createUser).toHaveBeenCalledWith({
                name: "Mithun",
                email: "mithun@gmail.com",
                password_hash: "hashedPassword",
                role: "Customer"
            });
        });
    });

    // =========================================================
    // 2. LOGIN USER
    // =========================================================

    describe("loginUser", () => {

        test("returns 401 when email is not registered", async () => {
            userModel.getUserByEmail.mockResolvedValue(null);

            const result = await userService.loginUser(
                "unknown@gmail.com",
                "password123"
            );

            expectFailure(
                result,
                401,
                "Email is not registered."
            );

            expect(bcrypt.compare).not.toHaveBeenCalled();
        });

        test("returns 409 when user account is inactive", async () => {
            userModel.getUserByEmail.mockResolvedValue({
                ...activeUser,
                is_active: 0
            });

            const result = await userService.loginUser(
                "mithun@gmail.com",
                "password123"
            );

            expectFailure(
                result,
                409,
                "User account is inactive. Please contact the administrator."
            );

            expect(bcrypt.compare).not.toHaveBeenCalled();
        });

        test("returns 401 when password is incorrect", async () => {
            userModel.getUserByEmail.mockResolvedValue({
                ...activeUser
            });

            bcrypt.compare.mockResolvedValue(false);

            const result = await userService.loginUser(
                "mithun@gmail.com",
                "wrongPassword"
            );

            expectFailure(
                result,
                401,
                "Incorrect password."
            );

            expect(bcrypt.compare)
                .toHaveBeenCalledWith(
                    "wrongPassword",
                    "storedHash"
                );
        });

        test("returns 200 and JWT token when login succeeds", async () => {
            // Arrange: token_version is now required.
            userModel.getUserByEmail.mockResolvedValue({
                ...activeUser,
                token_version: 2
            });

            bcrypt.compare.mockResolvedValue(true);

            // Act
            const result = await userService.loginUser(
                "mithun@gmail.com",
                "password123"
            );

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe("Login successful.");

            expect(result.data.user).toEqual({
                user_id: 1,
                name: "Mithun",
                email: "mithun@gmail.com",
                role: "Customer"
            });

            expect(typeof result.data.token).toBe("string");

            // Verify the actual JWT contents.
            const payload = jwt.verify(
                result.data.token,
                process.env.JWT_SECRET
            );

            expect(payload).toMatchObject({
                userId: 1,
                email: "mithun@gmail.com",
                role: "Customer",
                token_version: 2
            });

            expect(bcrypt.compare)
                .toHaveBeenCalledWith(
                    "password123",
                    "storedHash"
                );
        });

        test.each([
            ["missing", undefined],
            ["null", null],
            ["negative", -1],
            ["decimal", 1.5],
            ["non-numeric", "invalid"]
        ])(
            "returns 500 when token_version is %s",
            async (_label, token_version) => {
                userModel.getUserByEmail.mockResolvedValue({
                    ...activeUser,
                    token_version
                });

                bcrypt.compare.mockResolvedValue(true);

                const result = await userService.loginUser(
                    "mithun@gmail.com",
                    "password123"
                );

                expectFailure(
                    result,
                    500,
                    "Unable to create a login session. Please contact the administrator."
                );
            }
        );
    });

    // =========================================================
    // 3. GET ALL USERS
    // =========================================================

    describe("getAllUsers", () => {

        test("returns 404 when no users are found", async () => {
            userModel.getAllUsers.mockResolvedValue([]);

            const result = await userService.getAllUsers();

            expectFailure(
                result,
                404,
                "No users found."
            );
        });

        test("returns 200 with users when users exist", async () => {
            const users = [
                {
                    user_id: 1,
                    name: "Mithun"
                },
                {
                    user_id: 2,
                    name: "Rahul"
                }
            ];

            userModel.getAllUsers.mockResolvedValue(users);

            const result = await userService.getAllUsers();

            expect(result).toEqual({
                status: 200,
                success: true,
                message: "Users retrieved successfully.",
                data: users
            });
        });
    });

    // =========================================================
    // 4. GET USER BY ID
    // =========================================================

    describe("getUserById", () => {

        test("returns 404 when user does not exist", async () => {
            userModel.getUserById.mockResolvedValue(null);

            const result = await userService.getUserById(999);

            expectFailure(
                result,
                404,
                "User not found."
            );
        });

        test("returns public user data without sensitive fields", async () => {
            userModel.getUserById.mockResolvedValue({
                ...activeUser
            });

            const result = await userService.getUserById(1);

            expect(result).toEqual({
                status: 200,
                success: true,
                message: "User retrieved successfully.",
                data: {
                    user_id: 1,
                    name: "Mithun",
                    email: "mithun@gmail.com",
                    role: "Customer",
                    created_at: "2026-01-01",
                    is_active: 1
                }
            });

            expect(result.data)
                .not.toHaveProperty("password_hash");

            expect(result.data)
                .not.toHaveProperty("token_version");
        });
    });

    // =========================================================
    // 5. UPDATE USER
    // =========================================================

    describe("updateUser", () => {

        const update = {
            name: "New Name",
            email: "new@gmail.com"
        };

        test("returns 404 when user does not exist", async () => {
            userModel.getUserById.mockResolvedValue(null);

            const result = await userService.updateUser(
                999,
                update
            );

            expectFailure(result, 404, "User not found.");

            expect(userModel.updateUser)
                .not.toHaveBeenCalled();
        });

        test("returns 409 when user is inactive", async () => {
            userModel.getUserById.mockResolvedValue({
                ...activeUser,
                is_active: 0
            });

            const result = await userService.updateUser(
                1,
                update
            );

            expectFailure(
                result,
                409,
                "User account is inactive. Restore it before updating."
            );

            expect(userModel.updateUser)
                .not.toHaveBeenCalled();
        });

        test("returns 409 when email belongs to another user", async () => {
            userModel.getUserById.mockResolvedValue({
                ...activeUser
            });

            userModel.getUserByEmail.mockResolvedValue({
                user_id: 2
            });

            const result = await userService.updateUser(
                1,
                update
            );

            expectFailure(
                result,
                409,
                "Email is already registered."
            );

            expect(userModel.updateUser)
                .not.toHaveBeenCalled();
        });

        test("updates user successfully when email is available", async () => {
            userModel.getUserById.mockResolvedValue({
                ...activeUser
            });

            userModel.getUserByEmail.mockResolvedValue(null);
            userModel.updateUser.mockResolvedValue(1);

            const result = await userService.updateUser(
                1,
                update
            );

            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "User updated successfully."
            );

            expect(userModel.updateUser)
                .toHaveBeenCalledWith(1, update);
        });

        test("allows updating when email belongs to same user", async () => {
            userModel.getUserById.mockResolvedValue({
                ...activeUser
            });

            userModel.getUserByEmail.mockResolvedValue({
                user_id: "1"
            });

            const result = await userService.updateUser(
                1,
                update
            );

            expect(result.status).toBe(200);

            expect(userModel.updateUser)
                .toHaveBeenCalledWith(1, update);
        });
    });

    // =========================================================
    // 6. CHANGE PASSWORD
    // =========================================================

    describe("changePassword", () => {

        test("returns 404 when user does not exist", async () => {
            userModel.getUserById.mockResolvedValue(null);

            const result = await userService.changePassword(
                999,
                "oldPassword",
                "newPassword"
            );

            expectFailure(result, 404, "User not found.");
        });

        test("returns 409 when user is inactive", async () => {
            userModel.getUserById.mockResolvedValue({
                ...activeUser,
                is_active: 0
            });

            const result = await userService.changePassword(
                1,
                "oldPassword",
                "newPassword"
            );

            expectFailure(
                result,
                409,
                "User account is inactive. Restore it before updating."
            );
        });

        test("returns 401 when current password is incorrect", async () => {
            userModel.getUserById.mockResolvedValue({
                ...activeUser
            });

            bcrypt.compare.mockResolvedValue(false);

            const result = await userService.changePassword(
                1,
                "wrongPassword",
                "newPassword"
            );

            expectFailure(
                result,
                401,
                "Current password is incorrect."
            );

            expect(userModel.updatePassword)
                .not.toHaveBeenCalled();
        });

        test("returns 400 when new password equals current password", async () => {
            userModel.getUserById.mockResolvedValue({
                ...activeUser
            });

            bcrypt.compare.mockResolvedValue(true);

            const result = await userService.changePassword(
                1,
                "oldPassword",
                "oldPassword"
            );

            expectFailure(
                result,
                400,
                "New password cannot be the same as the current password."
            );

            expect(userModel.updatePassword)
                .not.toHaveBeenCalled();
        });

        test("changes password successfully", async () => {
            // Arrange
            userModel.getUserById.mockResolvedValue({
                ...activeUser
            });

            bcrypt.compare
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false);

            bcrypt.hash.mockResolvedValue("newHash");

            userModel.updatePassword.mockResolvedValue(1);

            // Act
            const result = await userService.changePassword(
                1,
                "oldPassword",
                "newPassword"
            );

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Password changed successfully."
            );

            expect(bcrypt.compare).toHaveBeenNthCalledWith(
                1,
                "oldPassword",
                "storedHash"
            );

            expect(bcrypt.compare).toHaveBeenNthCalledWith(
                2,
                "newPassword",
                "storedHash"
            );

            expect(bcrypt.hash)
                .toHaveBeenCalledWith("newPassword", 10);

            expect(userModel.updatePassword)
                .toHaveBeenCalledWith(1, "newHash");
        });
    });

    // =========================================================
    // 7. CHANGE ROLE
    // =========================================================

    describe("changeRole", () => {

        test("returns 404 when user does not exist", async () => {
            userModel.getUserById.mockResolvedValue(null);

            const result = await userService.changeRole(
                999,
                "Admin"
            );

            expectFailure(result, 404, "User not found.");
        });

        test("returns 409 when user is inactive", async () => {
            userModel.getUserById.mockResolvedValue({
                ...activeUser,
                is_active: 0
            });

            const result = await userService.changeRole(
                1,
                "Admin"
            );

            expectFailure(
                result,
                409,
                "User account is inactive. Restore it before updating."
            );
        });

        test("returns 400 for invalid role", async () => {
            userModel.getUserById.mockResolvedValue({
                ...activeUser
            });

            const result = await userService.changeRole(
                1,
                "Manager"
            );

            expectFailure(result, 400, "Invalid role.");

            expect(userModel.updateRole)
                .not.toHaveBeenCalled();
        });

        test("returns 400 when role is already assigned", async () => {
            userModel.getUserById.mockResolvedValue({
                ...activeUser
            });

            const result = await userService.changeRole(
                1,
                "Customer"
            );

            expectFailure(
                result,
                400,
                "The user is already assigned to the 'Customer' role."
            );
        });

        test("changes role successfully", async () => {
            userModel.getUserById.mockResolvedValue({
                ...activeUser
            });

            userModel.updateRole.mockResolvedValue(1);

            const result = await userService.changeRole(
                1,
                "Admin"
            );

            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "User role updated successfully."
            );

            expect(userModel.updateRole)
                .toHaveBeenCalledWith(1, "Admin");
        });
    });

    // =========================================================
    // 8. DEACTIVATE USER
    // =========================================================

    describe("deactivateUser", () => {

        test.each([0, -1, "abc", 1.5])(
            "returns 400 for invalid target ID %s",
            async (userId) => {
                const result = await userService.deactivateUser(
                    userId,
                    99
                );

                expectFailure(
                    result,
                    400,
                    "Invalid user ID."
                );

                expect(userModel.getUserById)
                    .not.toHaveBeenCalled();
            }
        );

        test.each([undefined, 0, "abc"])(
            "returns 401 for invalid acting admin ID %s",
            async (actingUserId) => {
                const result = await userService.deactivateUser(
                    1,
                    actingUserId
                );

                expectFailure(
                    result,
                    401,
                    "Please sign in again."
                );

                expect(userModel.getUserById)
                    .not.toHaveBeenCalled();
            }
        );

        test("returns 403 when admin attempts self-deactivation", async () => {
            const result = await userService.deactivateUser(
                1,
                1
            );

            expectFailure(
                result,
                403,
                "You cannot deactivate your own account."
            );

            expect(userModel.getUserById)
                .not.toHaveBeenCalled();

            expect(userModel.deactivateUser)
                .not.toHaveBeenCalled();
        });

        test("returns 404 when target user does not exist", async () => {
            userModel.getUserById.mockResolvedValue(null);

            const result = await userService.deactivateUser(
                999,
                1
            );

            expectFailure(result, 404, "User not found.");

            expect(userModel.deactivateUser)
                .not.toHaveBeenCalled();
        });

        test("returns 400 when target user is already inactive", async () => {
            userModel.getUserById.mockResolvedValue({
                ...activeUser,
                is_active: 0
            });

            const result = await userService.deactivateUser(
                1,
                99
            );

            expectFailure(
                result,
                400,
                "User is already inactive."
            );

            expect(userModel.deactivateUser)
                .not.toHaveBeenCalled();
        });

        test("returns 409 when update affects zero rows", async () => {
            userModel.getUserById.mockResolvedValue({
                ...activeUser
            });

            userModel.deactivateUser.mockResolvedValue(0);

            const result = await userService.deactivateUser(
                1,
                99
            );

            expectFailure(
                result,
                409,
                "The account changed before deactivation. Reload users and try again."
            );

            expect(userModel.deactivateUser)
                .toHaveBeenCalledWith(1);
        });

        test("deactivates another user successfully", async () => {
            userModel.getUserById.mockResolvedValue({
                ...activeUser
            });

            userModel.deactivateUser.mockResolvedValue(1);

            const result = await userService.deactivateUser(
                1,
                99
            );

            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "User deactivated successfully."
            );

            expect(userModel.deactivateUser)
                .toHaveBeenCalledWith(1);

            expect(userModel.deactivateUser)
                .toHaveBeenCalledTimes(1);
        });
    });

    // =========================================================
    // 9. RESTORE USER
    // =========================================================

    describe("restoreUser", () => {

        test("returns 404 when user does not exist", async () => {
            userModel.getUserById.mockResolvedValue(null);

            const result = await userService.restoreUser(999);

            expectFailure(result, 404, "User not found.");
        });

        test("returns 400 when user is already active", async () => {
            userModel.getUserById.mockResolvedValue({
                ...activeUser
            });

            const result = await userService.restoreUser(1);

            expectFailure(
                result,
                400,
                "User is already active."
            );

            expect(userModel.restoreUser)
                .not.toHaveBeenCalled();
        });

        test("restores an inactive user successfully", async () => {
            userModel.getUserById.mockResolvedValue({
                ...activeUser,
                is_active: 0
            });

            userModel.restoreUser.mockResolvedValue(1);

            const result = await userService.restoreUser(1);

            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "User restored successfully."
            );

            expect(userModel.restoreUser)
                .toHaveBeenCalledWith(1);
        });
    });

    // =========================================================
    // 10. LOOKUP CUSTOMER BY EMAIL
    // =========================================================

    describe("lookupCustomerByEmail", () => {

        test.each([
            undefined,
            null,
            "",
            "   ",
            123
        ])(
            "rejects missing or non-string email %s",
            async (email) => {
                const result =
                    await userService.lookupCustomerByEmail(email);

                expectFailure(
                    result,
                    400,
                    "Customer email is required."
                );

                expect(userModel.getUserByEmail)
                    .not.toHaveBeenCalled();
            }
        );

        test.each([
            "bad-email",
            "name@",
            `${"a".repeat(96)}@x.com`
        ])(
            "rejects invalid email %s",
            async (email) => {
                const result =
                    await userService.lookupCustomerByEmail(email);

                expectFailure(
                    result,
                    400,
                    "Enter a valid email address."
                );

                expect(userModel.getUserByEmail)
                    .not.toHaveBeenCalled();
            }
        );

        test("returns 404 when customer does not exist", async () => {
            userModel.getUserByEmail.mockResolvedValue(null);

            const result = await userService.lookupCustomerByEmail(
                "  mithun@gmail.com  "
            );

            expectFailure(
                result,
                404,
                "No customer account found for this email."
            );

            expect(userModel.getUserByEmail)
                .toHaveBeenCalledWith("mithun@gmail.com");
        });

        test.each(["Admin", "Pharmacist"])(
            "returns 409 when email belongs to %s staff",
            async (role) => {
                userModel.getUserByEmail.mockResolvedValue({
                    ...activeUser,
                    role
                });

                const result =
                    await userService.lookupCustomerByEmail(
                        "mithun@gmail.com"
                    );

                expectFailure(
                    result,
                    409,
                    "This email belongs to a staff account and cannot be selected as a customer."
                );
            }
        );

        test.each([1, 0])(
            "returns safe customer data when is_active is %s",
            async (is_active) => {
                userModel.getUserByEmail.mockResolvedValue({
                    ...activeUser,
                    is_active
                });

                const result =
                    await userService.lookupCustomerByEmail(
                        "  mithun@gmail.com "
                    );

                expect(result).toEqual({
                    status: 200,
                    success: true,
                    message: "Customer found successfully.",
                    data: {
                        user_id: 1,
                        name: "Mithun",
                        email: "mithun@gmail.com"
                    }
                });

                expect(userModel.getUserByEmail)
                    .toHaveBeenCalledWith("mithun@gmail.com");

                expect(result.data)
                    .not.toHaveProperty("password_hash");

                expect(result.data)
                    .not.toHaveProperty("token_version");
            }
        );
    });

    // =========================================================
    // 11. CREATE CUSTOMER BY PHARMACIST
    // =========================================================

    describe("createCustomerByPharmacist", () => {

        const newCustomer = {
            name: " Rahul ",
            email: " rahul@gmail.com "
        };

        test.each([
            undefined,
            null,
            "invalid",
            []
        ])(
            "rejects invalid customer details %s",
            async (details) => {
                const result =
                    await userService.createCustomerByPharmacist(
                        details
                    );

                expectFailure(
                    result,
                    400,
                    "Customer details are required."
                );

                expect(userModel.createUser)
                    .not.toHaveBeenCalled();
            }
        );

        test.each([
            undefined,
            null,
            "",
            "  ",
            123
        ])(
            "rejects invalid customer name %s",
            async (name) => {
                const result =
                    await userService.createCustomerByPharmacist({
                        ...newCustomer,
                        name
                    });

                expectFailure(
                    result,
                    400,
                    "Customer name is required."
                );

                expect(userModel.getUserByEmail)
                    .not.toHaveBeenCalled();
            }
        );

        test("rejects customer name longer than 100 characters", async () => {
            const result =
                await userService.createCustomerByPharmacist({
                    ...newCustomer,
                    name: "x".repeat(101)
                });

            expectFailure(
                result,
                400,
                "Customer name must be 100 characters or fewer."
            );

            expect(userModel.createUser)
                .not.toHaveBeenCalled();
        });

        test.each([
            undefined,
            null,
            "",
            "   ",
            123
        ])(
            "rejects missing customer email %s",
            async (email) => {
                const result =
                    await userService.createCustomerByPharmacist({
                        ...newCustomer,
                        email
                    });

                expectFailure(
                    result,
                    400,
                    "Customer email is required."
                );

                expect(userModel.createUser)
                    .not.toHaveBeenCalled();
            }
        );

        test.each([
            "invalid",
            "foo@",
            `${"a".repeat(96)}@x.com`
        ])(
            "rejects invalid customer email %s",
            async (email) => {
                const result =
                    await userService.createCustomerByPharmacist({
                        ...newCustomer,
                        email
                    });

                expectFailure(
                    result,
                    400,
                    "Enter a valid email address."
                );

                expect(userModel.createUser)
                    .not.toHaveBeenCalled();
            }
        );

        test.each([1, 0])(
            "returns 409 for email already registered with is_active %s",
            async (is_active) => {
                userModel.getUserByEmail.mockResolvedValue({
                    ...activeUser,
                    is_active
                });

                const result =
                    await userService.createCustomerByPharmacist(
                        newCustomer
                    );

                expectFailure(
                    result,
                    409,
                    "Email is already registered. Search for the existing customer account."
                );

                expect(userModel.getUserByEmail)
                    .toHaveBeenCalledWith("rahul@gmail.com");

                expect(bcrypt.hash)
                    .not.toHaveBeenCalled();

                expect(userModel.createUser)
                    .not.toHaveBeenCalled();
            }
        );

        test("creates Customer with trimmed fields and server-controlled role/password", async () => {
            // Arrange
            userModel.getUserByEmail.mockResolvedValue(null);

            bcrypt.hash.mockResolvedValue("serverGeneratedHash");

            userModel.createUser.mockResolvedValue(25);

            // Attempt to pass unauthorized fields.
            const submittedCustomer = {
                ...newCustomer,
                role: "Admin",
                password: "userProvidedPassword",
                is_active: 0
            };

            // Act
            const result =
                await userService.createCustomerByPharmacist(
                    submittedCustomer
                );

            // Assert
            expect(result).toEqual({
                status: 201,
                success: true,
                message: "Customer account created successfully.",
                data: {
                    user_id: 25,
                    name: "Rahul",
                    email: "rahul@gmail.com"
                }
            });

            // Current service uses its own initial password.
            expect(bcrypt.hash)
                .toHaveBeenCalledWith("12345678", 10);

            expect(userModel.createUser)
                .toHaveBeenCalledWith({
                    name: "Rahul",
                    email: "rahul@gmail.com",
                    password_hash: "serverGeneratedHash",
                    role: "Customer"
                });

            expect(userModel.createUser)
                .toHaveBeenCalledTimes(1);
        });

        test("returns 409 when database reports duplicate email race", async () => {
            userModel.getUserByEmail.mockResolvedValue(null);

            bcrypt.hash.mockResolvedValue("serverGeneratedHash");

            userModel.createUser.mockRejectedValue(
                Object.assign(
                    new Error("Duplicate entry"),
                    {
                        code: "ER_DUP_ENTRY"
                    }
                )
            );

            const result =
                await userService.createCustomerByPharmacist(
                    newCustomer
                );

            expectFailure(
                result,
                409,
                "Email is already registered. Search for the existing customer account."
            );
        });

        test("rethrows unexpected database errors", async () => {
            userModel.getUserByEmail.mockResolvedValue(null);

            bcrypt.hash.mockResolvedValue("serverGeneratedHash");

            userModel.createUser.mockRejectedValue(
                new Error("Database unavailable")
            );

            await expect(
                userService.createCustomerByPharmacist(
                    newCustomer
                )
            ).rejects.toThrow("Database unavailable");
        });
    });
});
