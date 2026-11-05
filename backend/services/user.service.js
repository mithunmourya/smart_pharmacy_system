const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const userModel = require("../models/user.model");

const {
    ok,
    created,
    badRequest,
    notFound,
    conflict,
    unauthorized,
    forbidden,
    serverError
} = require("../utils/response");

// ==========================================
// Register
// ==========================================

const registerUser = async (user) => {
    const existingUser =
        await userModel.getUserByEmail(user.email);

    if (existingUser) {
        if (existingUser.is_active) {
            return conflict("Email is already registered.");
        }

        return conflict(
            "User account is inactive. Please contact the administrator."
        );
    }

    const passwordHash = await bcrypt.hash(user.password, 10);

    const userId = await userModel.createUser({
        name: user.name,
        email: user.email,
        password_hash: passwordHash,
        role: user.role
    });

    return created(
        "User registered successfully.",
        { userId }
    );
};

// ==========================================
// Login
// ==========================================

const loginUser = async (email, password) => {
    const user = await userModel.getUserByEmail(email);

    if (!user) {
        return unauthorized("Email is not registered.");
    }

    if (!user.is_active) {
        return conflict(
            "User account is inactive. Please contact the administrator."
        );
    }

    const passwordMatch = await bcrypt.compare(
        password,
        user.password_hash
    );

    if (!passwordMatch) {
        return unauthorized("Incorrect password.");
    }

    const tokenVersion = Number(user.token_version);

    if (
        user.token_version == null ||
        !Number.isSafeInteger(tokenVersion) ||
        tokenVersion < 0
    ) {
        return serverError(
            "Unable to create a login session. Please contact the administrator."
        );
    }

    const token = jwt.sign(
        {
            userId: user.user_id,
            email: user.email,
            role: user.role,
            token_version: tokenVersion
        },
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_EXPIRES_IN
        }
    );

    return ok(
        "Login successful.",
        {
            token,
            user: {
                user_id: user.user_id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        }
    );
};

// ==========================================
// Read
// ==========================================

const getAllUsers = async () => {
    const users = await userModel.getAllUsers();

    if (users.length === 0) {
        return notFound("No users found.");
    }

    return ok(
        "Users retrieved successfully.",
        users
    );
};

const getUserById = async (userId) => {
    const user = await userModel.getUserById(userId);

    if (!user) {
        return notFound("User not found.");
    }

    // Return account details without password hashes
    // or internal token-version information.
    return ok(
        "User retrieved successfully.",
        {
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            role: user.role,
            created_at: user.created_at,
            is_active: user.is_active
        }
    );
};

// ==========================================
// Update Account Details
// ==========================================

const updateUser = async (userId, user) => {
    const existingUser =
        await userModel.getUserById(userId);

    if (!existingUser) {
        return notFound("User not found.");
    }

    if (!existingUser.is_active) {
        return conflict(
            "User account is inactive. Restore it before updating."
        );
    }

    const emailUser =
        await userModel.getUserByEmail(user.email);

    if (
        emailUser &&
        Number(emailUser.user_id) !== Number(userId)
    ) {
        return conflict("Email is already registered.");
    }

    await userModel.updateUser(userId, user);

    return ok("User updated successfully.");
};

// ==========================================
// Change Password
// ==========================================

const changePassword = async (
    userId,
    currentPassword,
    newPassword
) => {
    const user = await userModel.getUserById(userId);

    if (!user) {
        return notFound("User not found.");
    }

    if (!user.is_active) {
        return conflict(
            "User account is inactive. Restore it before updating."
        );
    }

    const passwordMatch = await bcrypt.compare(
        currentPassword,
        user.password_hash
    );

    if (!passwordMatch) {
        return unauthorized("Current password is incorrect.");
    }

    const samePassword = await bcrypt.compare(
        newPassword,
        user.password_hash
    );

    if (samePassword) {
        return badRequest(
            "New password cannot be the same as the current password."
        );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await userModel.updatePassword(userId, passwordHash);

    return ok("Password changed successfully.");
};

// ==========================================
// Change Role
// Existing endpoint retained.
// ==========================================

const changeRole = async (userId, role) => {
    const user = await userModel.getUserById(userId);

    if (!user) {
        return notFound("User not found.");
    }

    if (!user.is_active) {
        return conflict(
            "User account is inactive. Restore it before updating."
        );
    }

    const validRoles = ["Admin", "Pharmacist", "Customer"];

    if (!validRoles.includes(role)) {
        return badRequest("Invalid role.");
    }

    if (user.role === role) {
        return badRequest(
            `The user is already assigned to the '${role}' role.`
        );
    }

    await userModel.updateRole(userId, role);

    return ok("User role updated successfully.");
};

// ==========================================
// Deactivate
// ==========================================

const deactivateUser = async (userId, actingUserId) => {
    const targetId = Number(userId);
    const actorId = Number(actingUserId);

    if (!Number.isSafeInteger(targetId) || targetId <= 0) {
        return badRequest("Invalid user ID.");
    }

    // The controller must supply this from the authenticated token,
    // never from the request body.
    if (!Number.isSafeInteger(actorId) || actorId <= 0) {
        return unauthorized("Please sign in again.");
    }

    if (targetId === actorId) {
        return forbidden("You cannot deactivate your own account.");
    }

    const user = await userModel.getUserById(targetId);

    if (!user) {
        return notFound("User not found.");
    }

    if (!user.is_active) {
        return badRequest("User is already inactive.");
    }

    // The model sets is_active = 0 and increments token_version
    // together in one SQL statement.
    const affectedRows =
        await userModel.deactivateUser(targetId);

    if (affectedRows === 0) {
        return conflict(
            "The account changed before deactivation. Reload users and try again."
        );
    }

    return ok("User deactivated successfully.");
};

// ==========================================
// Restore
// ==========================================

const restoreUser = async (userId) => {
    const user = await userModel.getUserById(userId);

    if (!user) {
        return notFound("User not found.");
    }

    if (user.is_active) {
        return badRequest("User is already active.");
    }

    await userModel.restoreUser(userId);

    // Restoration preserves token_version.
    // The user must sign in to obtain a new valid token.
    return ok("User restored successfully.");
};

// ==========================================
// Pharmacist: Find Customer by Email
// ==========================================

const lookupCustomerByEmail = async (email) => {
    if (typeof email !== "string" || !email.trim()) {
        return badRequest("Customer email is required.");
    }

    const normalizedEmail = email.trim();

    if (
        normalizedEmail.length > 100 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
        return badRequest("Enter a valid email address.");
    }

    const user = await userModel.getUserByEmail(
        normalizedEmail
    );

    if (!user) {
        return notFound("No customer account found for this email.");
    }

    if (user.role !== "Customer") {
        return conflict(
            "This email belongs to a staff account and cannot be selected as a customer."
        );
    }

    // Both active and inactive customers may be selected for sales.
    // Do not expose password hashes or authentication details.
    return ok(
        "Customer found successfully.",
        {
            user_id: user.user_id,
            name: user.name,
            email: user.email
        }
    );
};
// ==========================================
// Pharmacist: Create Customer
// ==========================================

const createCustomerByPharmacist = async (customer) => {
    if (
        !customer ||
        typeof customer !== "object" ||
        Array.isArray(customer)
    ) {
        return badRequest("Customer details are required.");
    }

    const { name, email } = customer;

    if (typeof name !== "string" || !name.trim()) {
        return badRequest("Customer name is required.");
    }

    const normalizedName = name.trim();

    if (normalizedName.length > 100) {
        return badRequest(
            "Customer name must be 100 characters or fewer."
        );
    }

    if (typeof email !== "string" || !email.trim()) {
        return badRequest("Customer email is required.");
    }

    const normalizedEmail = email.trim();

    if (
        normalizedEmail.length > 100 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
        return badRequest("Enter a valid email address.");
    }

    const existingUser = await userModel.getUserByEmail(
        normalizedEmail
    );

    if (existingUser) {
        return conflict(
            "Email is already registered. Search for the existing customer account."
        );
    }

    // These values are controlled by the server.
    const passwordHash = await bcrypt.hash("12345678", 10);

    let userId;

    try {
        userId = await userModel.createUser({
            name: normalizedName,
            email: normalizedEmail,
            password_hash: passwordHash,
            role: "Customer"
        });
    } catch (error) {
        // Another request may register the email after our lookup.
        // The database's unique email constraint handles that race.
        if (error.code === "ER_DUP_ENTRY") {
            return conflict(
                "Email is already registered. Search for the existing customer account."
            );
        }

        throw error;
    }

    return created(
        "Customer account created successfully.",
        {
            user_id: userId,
            name: normalizedName,
            email: normalizedEmail
        }
    );
};
module.exports = {
    registerUser,
    loginUser,

    getAllUsers,
    getUserById,
    createCustomerByPharmacist,

    updateUser,
    changePassword,
    changeRole,

    deactivateUser,
    restoreUser,
    lookupCustomerByEmail
};