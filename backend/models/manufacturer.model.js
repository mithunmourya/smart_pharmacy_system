const db = require("../config/db");


// Create
const createManufacturer = async (name) => {

    const sql = `
        INSERT INTO manufacturers (
            name
        )
        VALUES (?);
    `;

    const [result] = await db.execute(sql, [
        name
    ]);

    return result.insertId;
};


// Read
const getAllManufacturers = async () => {

    const sql = `
        SELECT
            manufacturer_id,
            name,
            created_at,
            is_active
        FROM manufacturers
        ORDER BY name ASC;
    `;

    const [rows] = await db.execute(sql);

    return rows;
};


const getManufacturerById = async (manufacturerId) => {

    const sql = `
        SELECT
            manufacturer_id,
            name,
            created_at,
            is_active
        FROM manufacturers
        WHERE manufacturer_id = ?;
    `;

    const [rows] = await db.execute(sql, [
        manufacturerId
    ]);

    return rows[0];
};


const getManufacturerByName = async (name) => {

    const sql = `
        SELECT
            manufacturer_id,
            name,
            created_at,
            is_active
        FROM manufacturers
        WHERE name = ?;
    `;

    const [rows] = await db.execute(sql, [
        name
    ]);

    return rows[0];
};


// Update
const updateManufacturer = async (
    manufacturerId,
    name
) => {

    const sql = `
        UPDATE manufacturers
        SET
            name = ?
        WHERE manufacturer_id = ?;
    `;

    const [result] = await db.execute(sql, [
        name,
        manufacturerId
    ]);

    return result.affectedRows;
};


// Soft Delete
const deactivateManufacturer = async (
    manufacturerId
) => {

    const sql = `
        UPDATE manufacturers
        SET
            is_active = 0
        WHERE manufacturer_id = ?
          AND is_active = 1;
    `;

    const [result] = await db.execute(sql, [
        manufacturerId
    ]);

    return result.affectedRows;
};


const restoreManufacturer = async (
    manufacturerId
) => {

    const sql = `
        UPDATE manufacturers
        SET
            is_active = 1
        WHERE manufacturer_id = ?
          AND is_active = 0;
    `;

    const [result] = await db.execute(sql, [
        manufacturerId
    ]);

    return result.affectedRows;
};


module.exports = {

    // Create
    createManufacturer,

    // Read
    getAllManufacturers,
    getManufacturerById,
    getManufacturerByName,

    // Update
    updateManufacturer,

    // Soft Delete
    deactivateManufacturer,
    restoreManufacturer
};