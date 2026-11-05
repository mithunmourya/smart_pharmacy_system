const db = require("../config/db");

// ==========================================
// Create
// ==========================================

const createSale = async (
    connection,
    sale
) => {

    const [result] = await connection.query(
        `
        INSERT INTO sales
        (
            customer_id,
            pharmacist_id,
            total_amount,
            payment_mode
        )
        VALUES (?, ?, ?, ?)
        `,
        [
            sale.customer_id,
            sale.pharmacist_id,
            sale.total_amount,
            sale.payment_mode
        ]
    );

    return result.insertId;
};


// ==========================================
// Read
// ==========================================

const getAllSales = async () => {

    const [rows] = await db.query(
        `
        SELECT
            s.sale_id,
            s.total_amount,
            s.payment_mode,
            s.created_at,

            c.user_id AS customer_id,
            c.name AS customer_name,

            p.user_id AS pharmacist_id,
            p.name AS pharmacist_name

        FROM sales s

        LEFT JOIN users c
            ON s.customer_id = c.user_id

        INNER JOIN users p
            ON s.pharmacist_id = p.user_id

        ORDER BY
            s.created_at DESC
        `
    );

    return rows;
};


const getSaleById = async (
    saleId
) => {

    const [rows] = await db.query(
        `
        SELECT
            s.sale_id,
            s.total_amount,
            s.payment_mode,
            s.created_at,

            c.user_id AS customer_id,
            c.name AS customer_name,

            p.user_id AS pharmacist_id,
            p.name AS pharmacist_name

        FROM sales s

        LEFT JOIN users c
            ON s.customer_id = c.user_id

        INNER JOIN users p
            ON s.pharmacist_id = p.user_id

        WHERE
            s.sale_id = ?
        `,
        [saleId]
    );

    return rows[0];
};


const searchSales = async (
    search
) => {

    const [rows] = await db.query(
        `
        SELECT
            s.sale_id,
            s.total_amount,
            s.payment_mode,
            s.created_at,

            c.name AS customer_name,

            p.name AS pharmacist_name

        FROM sales s

        LEFT JOIN users c
            ON s.customer_id = c.user_id

        INNER JOIN users p
            ON s.pharmacist_id = p.user_id

        WHERE

            CAST(s.sale_id AS CHAR) LIKE ?

            OR

            c.name LIKE ?

            OR

            p.name LIKE ?

        ORDER BY
            s.created_at DESC
        `,
        [
            `%${search}%`,
            `%${search}%`,
            `%${search}%`
        ]
    );

    return rows;
};

// ==========================================
// Customer: Read Own Purchases
// ==========================================

const getSalesByCustomerId = async (customerId) => {
    const [rows] = await db.query(
        `
        SELECT
            s.sale_id,
            s.total_amount,
            s.payment_mode,
            s.created_at,
            p.name AS pharmacist_name
        FROM sales s
        INNER JOIN users p
            ON s.pharmacist_id = p.user_id
        WHERE s.customer_id = ?
        ORDER BY
            s.created_at DESC,
            s.sale_id DESC
        `,
        [customerId]
    );

    return rows;
};

// Both IDs are checked in the query.
// Another customer's sale will not be returned.
const getSaleByIdForCustomer = async (
    saleId,
    customerId
) => {
    const [rows] = await db.query(
        `
        SELECT
            s.sale_id,
            s.total_amount,
            s.payment_mode,
            s.created_at,
            p.name AS pharmacist_name
        FROM sales s
        INNER JOIN users p
            ON s.pharmacist_id = p.user_id
        WHERE s.sale_id = ?
          AND s.customer_id = ?
        `,
        [saleId, customerId]
    );

    return rows[0];
};


module.exports = {

    // Create
    createSale,

    // Read
    getAllSales,
    getSaleById,
    searchSales,

    getSalesByCustomerId,
    getSaleByIdForCustomer

};