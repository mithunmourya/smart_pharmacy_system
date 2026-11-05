const db = require("../config/db");

// ==========================================
// Create
// ==========================================

const createSaleItem = async (
    connection,
    saleItem
) => {

    await connection.query(
        `
        INSERT INTO sale_items
        (
            sale_id,
            medicine_id,
            batch_id,
            quantity,
            selling_price,
            subtotal
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
            saleItem.sale_id,
            saleItem.medicine_id,
            saleItem.batch_id,
            saleItem.quantity,
            saleItem.selling_price,
            saleItem.subtotal
        ]
    );
};


// ==========================================
// Read
// ==========================================

const getSaleItemsBySaleId = async (
    saleId
) => {

    const [rows] = await db.query(
        `
        SELECT

            si.sale_item_id,

            si.sale_id,

            si.quantity,

            si.selling_price,

            si.subtotal,

            m.medicine_id,

            m.name AS medicine_name,

            mf.manufacturer_id,

            mf.name AS manufacturer_name,

            b.batch_id,

            b.batch_number

        FROM sale_items si

        INNER JOIN medicines m
            ON si.medicine_id = m.medicine_id

        INNER JOIN medicine_batches b
            ON si.batch_id = b.batch_id

        INNER JOIN manufacturers mf
            ON m.manufacturer_id = mf.manufacturer_id

        WHERE
            si.sale_id = ?
        `,
        [saleId]
    );

    return rows;
};


module.exports = {

    // Create
    createSaleItem,

    // Read
    getSaleItemsBySaleId

};