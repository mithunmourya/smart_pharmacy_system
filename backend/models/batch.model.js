const db = require("../config/db");

// ==========================================
// Create
// ==========================================
const createBatch = async (batch) => {

    const sql = `
        INSERT INTO medicine_batches (
            medicine_id,
            batch_number,
            purchase_price,
            selling_price,
            stock_quantity,
            expiry_date
        )
        VALUES (?, ?, ?, ?, ?, ?);
    `;

    const [result] = await db.execute(sql, [
        batch.medicine_id,
        batch.batch_number,
        batch.purchase_price,
        batch.selling_price,
        batch.stock_quantity,
        batch.expiry_date
    ]);

    return result.insertId;
};

// ==========================================
// Read (Table)
// ==========================================
const getBatchById = async (batchId) => {

    const sql = `
        SELECT
            batch_id,
            medicine_id,
            batch_number,
            purchase_price,
            selling_price,
            stock_quantity,
            expiry_date,
            is_active,
            created_at
        FROM medicine_batches
        WHERE batch_id = ?;
    `;

    const [rows] = await db.execute(sql, [
        batchId
    ]);

    return rows[0];
};

const getBatchByMedicineId = async (medicineId) => {

    const sql = `
        SELECT
            batch_id,
            medicine_id,
            batch_number,
            purchase_price,
            selling_price,
            stock_quantity,
            expiry_date,
            is_active,
            created_at
        FROM medicine_batches
        WHERE medicine_id = ?
        ORDER BY expiry_date ASC;
    `;

    const [rows] = await db.execute(sql, [
        medicineId
    ]);

    return rows;
};

const getBatchByMedicineIdAndBatchNumber = async (
    medicineId,
    batchNumber
) => {

    const sql = `
        SELECT
            batch_id,
            medicine_id,
            batch_number,
            purchase_price,
            selling_price,
            stock_quantity,
            expiry_date,
            is_active,
            created_at
        FROM medicine_batches
        WHERE
            medicine_id = ?
        AND
            batch_number = ?;
    `;

    const [rows] = await db.execute(sql, [
        medicineId,
        batchNumber
    ]);

    return rows[0];
};


const getBatchByIdForUpdate = async (
    connection,
    batchId
) => {

    const [rows] = await connection.query(
        `
        SELECT
            batch_id,
            medicine_id,
            purchase_price,
            selling_price,
            stock_quantity,
            expiry_date,
            is_active
        FROM medicine_batches
        WHERE batch_id = ?
        FOR UPDATE
        `,
        [batchId]
    );

    return rows[0] || null;
};

// ==========================================
// Read (Views)
// ==========================================
const getInventory = async () => {

    const [rows] = await db.query(`
        SELECT
            m.medicine_id,
            m.name AS medicine_name,
            m.reorder_level,

            mf.manufacturer_id,
            mf.name AS manufacturer_name,

            m.category,

            b.batch_id,
            b.batch_number,
            b.selling_price,
            b.stock_quantity,
            b.expiry_date,

            DATEDIFF(
                b.expiry_date,
                CURDATE()
            ) AS days_to_expire

        FROM medicine_batches b

        INNER JOIN medicines m
            ON b.medicine_id = m.medicine_id

        INNER JOIN manufacturers mf
            ON m.manufacturer_id = mf.manufacturer_id

        WHERE
            b.is_active = 1
            AND m.is_active = 1
            AND mf.is_active = 1
            AND b.stock_quantity > 0
            AND b.expiry_date >= CURDATE()

        ORDER BY
            m.name,
            mf.name,
            b.expiry_date ASC;
    `);

    return rows;
};
const searchInventory = async (search) => {

    const sql = `
        SELECT *
        FROM inventory_view
        WHERE
            medicine_name LIKE ?
        OR
            manufacturer_name LIKE ?
        OR
            batch_number LIKE ?
        ORDER BY medicine_name ASC, expiry_date ASC;
    `;

    const keyword = `%${search}%`;

    const [rows] = await db.execute(sql, [
        keyword,
        keyword,
        keyword
    ]);

    return rows;
};

const getLowStockMedicines = async () => {

    const sql = `
        SELECT *
        FROM low_stock_view
        ORDER BY available_stock ASC;
    `;

    const [rows] = await db.execute(sql);

    return rows;
};

// ==========================================
// Update
// ==========================================
const updateBatch = async (
    batchId,
    batch
) => {

    const sql = `
        UPDATE medicine_batches
        SET
            batch_number = ?,
            purchase_price = ?,
            selling_price = ?,
            expiry_date = ?
        WHERE batch_id = ?;
    `;

    const [result] = await db.execute(sql, [
        batch.batch_number,
        batch.purchase_price,
        batch.selling_price,
        batch.expiry_date,
        batchId
    ]);

    return result.affectedRows;
};

const updateBatchStock = async (
    connection,
    batchId,
    quantity
) => {

    await connection.query(
        `
        UPDATE medicine_batches
        SET stock_quantity = stock_quantity + ?
        WHERE batch_id = ?
        `,
        [
            quantity,
            batchId
        ]
    );
};
// ==========================================
// Soft Delete & Restore
// ==========================================
const deactivateBatch = async (batchId) => {

    const sql = `
        UPDATE medicine_batches
        SET
            is_active = 0
        WHERE batch_id = ?;
    `;

    const [result] = await db.execute(sql, [
        batchId
    ]);

    return result.affectedRows;
};

const restoreBatch = async (batchId) => {

    const sql = `
        UPDATE medicine_batches
        SET
            is_active = 1
        WHERE batch_id = ?;
    `;

    const [result] = await db.execute(sql, [
        batchId
    ]);

    return result.affectedRows;
};

module.exports = {

    // Create
    createBatch,

    // Read (Table)
    getBatchById,
    getBatchByMedicineId,
    getBatchByMedicineIdAndBatchNumber,
    getBatchByIdForUpdate,

    // Read (Views)
    getInventory,
    searchInventory,
    getLowStockMedicines,

    // Update
    updateBatch,
    updateBatchStock,

    // Soft Delete & Restore
    deactivateBatch,
    restoreBatch
};