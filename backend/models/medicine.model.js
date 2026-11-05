const db = require("../config/db");


// Create
const createMedicine = async (medicine) => {

    const sql = `
        INSERT INTO medicines (
            manufacturer_id,
            name,
            category,
            reorder_level
        )
        VALUES (?, ?, ?, ?);
    `;

    const [result] = await db.execute(sql, [
        medicine.manufacturer_id,
        medicine.name,
        medicine.category,
        medicine.reorder_level
    ]);

    return result.insertId;
};


// Read
const getAllMedicines = async () => {

    const sql = `
        SELECT
            m.medicine_id,
            m.name,

            mf.manufacturer_id,
            mf.name AS manufacturer,
            mf.is_active AS manufacturer_is_active,

            m.category,
            m.reorder_level,
            m.created_at,
            m.is_active AS medicine_is_active

        FROM medicines m
        JOIN manufacturers mf
            ON m.manufacturer_id = mf.manufacturer_id

        ORDER BY m.name ASC;
    `;

    const [rows] = await db.execute(sql);

    return rows;
};


const getMedicineById = async (medicineId) => {

    const sql = `
        SELECT
            m.medicine_id,
            m.name,

            mf.manufacturer_id,
            mf.name AS manufacturer,
            mf.is_active AS manufacturer_is_active,

            m.category,
            m.reorder_level,
            m.created_at,
            m.is_active AS medicine_is_active

        FROM medicines m
        JOIN manufacturers mf
            ON m.manufacturer_id = mf.manufacturer_id

        WHERE m.medicine_id = ?;
    `;

    const [rows] = await db.execute(sql, [
        medicineId
    ]);

    return rows[0];
};

const getMedicineByManufacturerId = async (manufacturerId) => {

    const sql = `
        SELECT
            m.medicine_id,
            m.name,

            mf.manufacturer_id,
            mf.name AS manufacturer,
            mf.is_active AS manufacturer_is_active,

            m.category,
            m.reorder_level,
            m.created_at,
            m.is_active AS medicine_is_active

        FROM medicines m
        JOIN manufacturers mf
            ON m.manufacturer_id = mf.manufacturer_id

        WHERE m.manufacturer_id = ?

        ORDER BY m.name ASC;
    `;

    const [rows] = await db.execute(sql, [
        manufacturerId
    ]);

    return rows;
};

const getMedicineByNameAndManufacturerId = async (
    name,
    manufacturerId
) => {

    const sql = `
        SELECT
            medicine_id,
            manufacturer_id,
            name,
            category,
            reorder_level,
            created_at,
            is_active AS medicine_is_active
        FROM medicines
        WHERE name = ?
          AND manufacturer_id = ?;
    `;

    const [rows] = await db.execute(sql, [
        name,
        manufacturerId
    ]);

    return rows[0];
};


const searchMedicineByName = async (name) => {

    const sql = `
        SELECT
            m.medicine_id,
            m.name,

            mf.manufacturer_id,
            mf.name AS manufacturer,
            mf.is_active AS manufacturer_is_active,

            m.category,
            m.reorder_level,
            m.created_at,
            m.is_active AS medicine_is_active

        FROM medicines m
        JOIN manufacturers mf
            ON m.manufacturer_id = mf.manufacturer_id

        WHERE m.name LIKE ?

        ORDER BY m.name ASC;
    `;

    const [rows] = await db.execute(sql, [
        `%${name}%`
    ]);

    return rows;
};


const searchMedicineByManufacturerName = async (
    manufacturer
) => {

    const sql = `
        SELECT
            m.medicine_id,
            m.name,

            mf.manufacturer_id,
            mf.name AS manufacturer,
            mf.is_active AS manufacturer_is_active,

            m.category,
            m.reorder_level,
            m.created_at,
            m.is_active AS medicine_is_active

        FROM medicines m
        JOIN manufacturers mf
            ON m.manufacturer_id = mf.manufacturer_id

        WHERE mf.name LIKE ?

        ORDER BY
            mf.name ASC,
            m.name ASC;
    `;

    const [rows] = await db.execute(sql, [
        `%${manufacturer}%`
    ]);

    return rows;
};


// Update
const updateMedicine = async (
    medicineId,
    medicine
) => {

    const sql = `
        UPDATE medicines
        SET
            manufacturer_id = ?,
            name = ?,
            category = ?,
            reorder_level = ?
        WHERE medicine_id = ?;
    `;

    const [result] = await db.execute(sql, [
        medicine.manufacturer_id,
        medicine.name,
        medicine.category,
        medicine.reorder_level,
        medicineId
    ]);

    return result.affectedRows;
};


// Soft Delete
const deactivateMedicine = async (medicineId) => {

    const sql = `
        UPDATE medicines
        SET is_active = 0
        WHERE medicine_id = ?
          AND is_active = 1;
    `;

    const [result] = await db.execute(sql, [
        medicineId
    ]);

    return result.affectedRows;
};


const restoreMedicine = async (medicineId) => {

    const sql = `
        UPDATE medicines
        SET is_active = 1
        WHERE medicine_id = ?
          AND is_active = 0;
    `;

    const [result] = await db.execute(sql, [
        medicineId
    ]);

    return result.affectedRows;
};


module.exports = {

    // Create
    createMedicine,

    // Read
    getAllMedicines,
    getMedicineById,
    getMedicineByManufacturerId,
    getMedicineByNameAndManufacturerId,
    searchMedicineByName,
    searchMedicineByManufacturerName,

    // Update
    updateMedicine,

    // Soft Delete
    deactivateMedicine,
    restoreMedicine
};