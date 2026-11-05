// ==========================================
// 1. Module Dependencies
// ==========================================

const salesModel = require("../models/sales.model");
const saleItemModel = require("../models/sale_items.model");
const batchModel = require("../models/batch.model");
const medicineModel = require("../models/medicine.model");
const manufacturerModel = require("../models/manufacturer.model");
const userModel = require("../models/user.model");
const db = require("../config/db");

const {
    ok,
    created,
    badRequest,
    conflict,
    notFound,
    serverError
} = require("../utils/response");

// ==========================================
// Create Sale
// ==========================================

const createSale = async (sale) => {
    // ==========================================
    // 2. Initial Validations
    // ==========================================

    const validPaymentModes = ["Cash", "Card", "UPI"];

    if (
        !sale.payment_mode ||
        !validPaymentModes.includes(sale.payment_mode)
    ) {
        return badRequest("Invalid payment mode.");
    }

    if (!Array.isArray(sale.items)) {
        return badRequest("Items must be an array.");
    }

    if (sale.items.length === 0) {
        return badRequest(
            "At least one medicine must be selected."
        );
    }

    const batchIds = new Set();

    for (const item of sale.items) {
        if (
            !Number.isInteger(item.batch_id) ||
            item.batch_id <= 0
        ) {
            return badRequest("Invalid batch ID.");
        }

        if (
            !Number.isInteger(item.quantity) ||
            item.quantity <= 0
        ) {
            return badRequest(
                "Quantity must be greater than zero."
            );
        }

        if (batchIds.has(item.batch_id)) {
            return badRequest("Duplicate batch selected.");
        }

        batchIds.add(item.batch_id);
    }

    // ==========================================
    // 3. Pharmacist Validation
    // ==========================================

    const pharmacist = await userModel.getUserById(
        sale.pharmacist_id
    );

    if (!pharmacist) {
        return notFound("Pharmacist not found.");
    }

    if (!pharmacist.is_active) {
        return conflict("Pharmacist account is inactive.");
    }

    if (pharmacist.role !== "Pharmacist") {
        return conflict("Unauthorized user.");
    }

    // ==========================================
    // 4. Customer Validation
    // ==========================================

    // A null or omitted ID represents a walk-in sale.
    const customerId = sale.customer_id ?? null;

    if (customerId !== null) {
        if (
            !Number.isSafeInteger(customerId) ||
            customerId <= 0
        ) {
            return badRequest("Invalid customer ID.");
        }

        const customer = await userModel.getUserById(
            customerId
        );

        if (!customer) {
            return notFound("Customer not found.");
        }

        if (customer.role !== "Customer") {
            return conflict(
                "The selected account is not a customer."
            );
        }

        // Allow purchases for active and inactive customers.
        // Preserve their ID without changing account status.
    }

    // ==========================================
    // 5. Item Validations — Pre-Check
    // ==========================================

    const validatedItems = [];
    let totalAmount = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const item of sale.items) {
        const batch = await batchModel.getBatchById(
            item.batch_id
        );

        if (!batch) {
            return notFound("Batch not found.");
        }

        if (!batch.is_active) {
            return conflict("Batch is inactive.");
        }

        const medicine = await medicineModel.getMedicineById(
            batch.medicine_id
        );

        if (!medicine) {
            return notFound("Medicine not found.");
        }

        if (!medicine.medicine_is_active) {
            return conflict("Medicine is inactive.");
        }

        const manufacturer =
            await manufacturerModel.getManufacturerById(
                medicine.manufacturer_id
            );

        if (!manufacturer) {
            return notFound("Manufacturer not found.");
        }

        if (!manufacturer.is_active) {
            return conflict("Manufacturer is inactive.");
        }

        const expiryDate = new Date(batch.expiry_date);
        expiryDate.setHours(0, 0, 0, 0);

        if (expiryDate < today) {
            return conflict("Batch has expired.");
        }

        if (batch.stock_quantity < item.quantity) {
            return badRequest("Insufficient stock.");
        }

        const sellingPrice = Number(batch.selling_price);
        const subtotal = sellingPrice * item.quantity;

        totalAmount += subtotal;

        validatedItems.push({
            medicine_id: medicine.medicine_id,
            batch_id: batch.batch_id,
            quantity: item.quantity,
            selling_price: sellingPrice,
            subtotal,
            available_stock: batch.stock_quantity
        });
    }

    // ==========================================
    // 6. Transaction
    // ==========================================

    // Acquire batch locks in a consistent order.
    validatedItems.sort(
        (a, b) => a.batch_id - b.batch_id
    );

    let connection;

    try {
        connection = await db.getConnection();

        await connection.beginTransaction();

        // ==========================================
        // A. Lock and Recheck Batches
        // ==========================================

        for (const item of validatedItems) {
            const lockedBatch =
                await batchModel.getBatchByIdForUpdate(
                    connection,
                    item.batch_id
                );

            if (!lockedBatch) {
                throw new Error("Batch not found.");
            }

            if (!lockedBatch.is_active) {
                throw new Error("Batch is inactive.");
            }

            const medicine =
                await medicineModel.getMedicineById(
                    lockedBatch.medicine_id
                );

            if (!medicine || !medicine.medicine_is_active) {
                throw new Error("Medicine is inactive.");
            }

            const manufacturer =
                await manufacturerModel.getManufacturerById(
                    medicine.manufacturer_id
                );

            if (!manufacturer || !manufacturer.is_active) {
                throw new Error("Manufacturer is inactive.");
            }

            const lockedExpiryDate = new Date(
                lockedBatch.expiry_date
            );

            lockedExpiryDate.setHours(0, 0, 0, 0);

            if (lockedExpiryDate < today) {
                throw new Error("Batch has expired.");
            }

            if (lockedBatch.stock_quantity < item.quantity) {
                throw new Error("Insufficient stock.");
            }
        }

        // ==========================================
        // B. Insert Sale
        // ==========================================

        const saleId = await salesModel.createSale(
            connection,
            {
                customer_id: customerId,
                pharmacist_id: sale.pharmacist_id,
                payment_mode: sale.payment_mode,
                total_amount: totalAmount
            }
        );

        // ==========================================
        // C. Insert Sale Items
        // ==========================================

        for (const item of validatedItems) {
            await saleItemModel.createSaleItem(
                connection,
                {
                    sale_id: saleId,
                    medicine_id: item.medicine_id,
                    batch_id: item.batch_id,
                    quantity: item.quantity,
                    selling_price: item.selling_price,
                    subtotal: item.subtotal
                }
            );
        }

        // ==========================================
        // D. Reduce Stock
        // ==========================================

        for (const item of validatedItems) {
            await batchModel.updateBatchStock(
                connection,
                item.batch_id,
                -item.quantity
            );
        }

        // ==========================================
        // E. Commit
        // ==========================================

        await connection.commit();

        return created(
            "Sale completed successfully.",
            {
                sale_id: saleId,
                total_amount: totalAmount
            }
        );
    } catch (error) {
        // ==========================================
        // F. Roll Back
        // ==========================================

        if (connection) {
            await connection.rollback();
        }

        if (
            error.message === "Insufficient stock." ||
            error.message === "Batch is inactive." ||
            error.message === "Medicine is inactive." ||
            error.message === "Manufacturer is inactive." ||
            error.message === "Batch has expired."
        ) {
            return conflict(error.message);
        }

        console.error(error);

        return serverError(
            "An error occurred while processing the sale."
        );
    } finally {
        // ==========================================
        // G. Release Connection
        // ==========================================

        if (connection) {
            connection.release();
        }
    }
};

// ==========================================
// Read All Sales
// ==========================================

const getAllSales = async () => {
    const sales = await salesModel.getAllSales();

    if (sales.length === 0) {
        return notFound("No sales found.");
    }

    return ok(
        "Sales retrieved successfully.",
        sales
    );
};

// ==========================================
// Read Sale by ID
// ==========================================

// ==========================================
// Admin: Read Sale with Medicine Details
// ==========================================

const getSaleById = async (saleId) => {
    const sale = await salesModel.getSaleById(saleId);

    if (!sale) {
        return notFound("Sale not found.");
    }

    const items =
        await saleItemModel.getSaleItemsBySaleId(sale.sale_id);

    return ok(
        "Sale retrieved successfully.",
        {
            ...sale,
            items
        }
    );
};
// ==========================================
// Search Sales
// ==========================================

const searchSales = async (search) => {
    const sales = await salesModel.searchSales(search);

    if (sales.length === 0) {
        return notFound("No matching sales found.");
    }

    return ok(
        "Sales retrieved successfully.",
        sales
    );
};

// ==========================================
// Customer: List Own Purchases
// ==========================================

const getMyPurchases = async (customerId) => {
    if (
        !Number.isSafeInteger(customerId) ||
        customerId <= 0
    ) {
        return badRequest("Invalid customer ID.");
    }

    const purchases =
        await salesModel.getSalesByCustomerId(customerId);

    // An empty purchase history is a successful result.
    return ok(
        "Purchases retrieved successfully.",
        purchases
    );
};

// ==========================================
// Customer: View Own Purchase Details
// ==========================================

const getMyPurchaseById = async (
    customerId,
    saleId
) => {
    if (
        !Number.isSafeInteger(customerId) ||
        customerId <= 0
    ) {
        return badRequest("Invalid customer ID.");
    }

    if (
        !Number.isSafeInteger(saleId) ||
        saleId <= 0
    ) {
        return badRequest("Invalid sale ID.");
    }

    const sale =
        await salesModel.getSaleByIdForCustomer(
            saleId,
            customerId
        );

    if (!sale) {
        // Use the same response for nonexistent sales and
        // sales belonging to someone else.
        return notFound("Purchase not found.");
    }

    // Fetch medicine items only after ownership is verified.
    const items =
        await saleItemModel.getSaleItemsBySaleId(
            sale.sale_id
        );

    return ok(
        "Purchase retrieved successfully.",
        {
            ...sale,
            items
        }
    );
};


// ==========================================
// Exports
// ==========================================

module.exports = {
    createSale,
    getAllSales,
    getSaleById,
    searchSales,

    getMyPurchases,
    getMyPurchaseById
};