const db = require("../config/db");

// ==========================================
// Create
// ==========================================

const createUser = async (user) => {
    const sql = `
        INSERT INTO users (
            name,
            email,
            password_hash,
            role
        )
        VALUES (?, ?, ?, ?);
    `;

    const [result] = await db.execute(sql, [
        user.name,
        user.email,
        user.password_hash,
        user.role
    ]);

    // token_version uses the database default: 0.
    return result.insertId;
};

// ==========================================
// Read
// ==========================================

const getAllUsers = async () => {
    const sql = `
        SELECT
            user_id,
            name,
            email,
            role,
            created_at,
            is_active
        FROM users
        ORDER BY name ASC;
    `;

    const [rows] = await db.execute(sql);

    return rows;
};

const getUserById = async (userId) => {
    const sql = `
        SELECT
            user_id,
            name,
            email,
            password_hash,
            role,
            created_at,
            is_active,
            token_version
        FROM users
        WHERE user_id = ?;
    `;

    const [rows] = await db.execute(sql, [userId]);

    return rows[0];
};

const getUserByEmail = async (email) => {
    const sql = `
        SELECT
            user_id,
            name,
            email,
            password_hash,
            role,
            created_at,
            is_active,
            token_version
        FROM users
        WHERE email = ?;
    `;

    const [rows] = await db.execute(sql, [email]);

    return rows[0];
};

// Used by authentication middleware.
// Reads only the fields needed to validate the current session.
const getUserAuthById = async (userId) => {
    const sql = `
        SELECT
            user_id,
            email,
            role,
            is_active,
            token_version
        FROM users
        WHERE user_id = ?;
    `;

    const [rows] = await db.execute(sql, [userId]);

    return rows[0];
};

// ==========================================
// Update
// ==========================================

const updateUser = async (userId, user) => {
    const sql = `
        UPDATE users
        SET
            name = ?,
            email = ?
        WHERE user_id = ?;
    `;

    const [result] = await db.execute(sql, [
        user.name,
        user.email,
        userId
    ]);

    return result.affectedRows;
};

const updatePassword = async (userId, passwordHash) => {
    const sql = `
        UPDATE users
        SET password_hash = ?
        WHERE user_id = ?;
    `;

    const [result] = await db.execute(sql, [
        passwordHash,
        userId
    ]);

    return result.affectedRows;
};

const updateRole = async (userId, role) => {
    const sql = `
        UPDATE users
        SET role = ?
        WHERE user_id = ?;
    `;

    const [result] = await db.execute(sql, [
        role,
        userId
    ]);

    return result.affectedRows;
};

// ==========================================
// Deactivate / Restore
// ==========================================

const deactivateUser = async (userId) => {
    const sql = `
        UPDATE users
        SET
            is_active = 0,
            token_version = token_version + 1
        WHERE user_id = ?
          AND is_active = 1;
    `;

    const [result] = await db.execute(sql, [userId]);

    return result.affectedRows;
};

const restoreUser = async (userId) => {
    const sql = `
        UPDATE users
        SET is_active = 1
        WHERE user_id = ?
          AND is_active = 0;
    `;

    const [result] = await db.execute(sql, [userId]);

    // Preserve token_version so previously revoked tokens stay revoked.
    return result.affectedRows;
};

module.exports = {
    // Create
    createUser,

    // Read
    getAllUsers,
    getUserById,
    getUserByEmail,
    getUserAuthById,

    // Update
    updateUser,
    updatePassword,
    updateRole,

    // Deactivate / Restore
    deactivateUser,
    restoreUser
};