const batchModel = require("../models/batch.model");
const medicineModel = require("../models/medicine.model");
const db = require("../config/db");

const {
    ok,
    created,
    badRequest,
    conflict,
    notFound
} = require("../utils/response");

// ==========================================
// Create
// ==========================================
const createBatch = async (batch) => {

    // Check medicine exists
    const medicine =
        await medicineModel.getMedicineById(batch.medicine_id);
    
 
    if (!medicine) {
        return notFound("Medicine not found.");
    }


    // Check medicine active
    if (!medicine.medicine_is_active) {
        return badRequest(
            "Cannot create batch for an inactive medicine."
        );
    }

    // Validate prices
    if (Number(batch.selling_price) < Number(batch.purchase_price)) {
        return badRequest(
            "Selling price cannot be less than purchase price."
        );
    }

    // Validate expiry
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiryDate = new Date(batch.expiry_date);

    if (expiryDate <= today) {
        return badRequest(
            "Expiry date must be a future date."
        );
    }

    // Check existing batch
    const existingBatch =
        await batchModel.getBatchByMedicineIdAndBatchNumber(
            batch.medicine_id,
            batch.batch_number
        );

    if (existingBatch) {

      return conflict("Batch already exists.");

    }

    // Create new batch
    await batchModel.createBatch(batch);

    return created(
        "Batch created successfully."
    );
};

// ==========================================
// Read
// ==========================================
const getInventory = async () => {

    const rows =
        await batchModel.getInventory();

    if (rows.length === 0) {
        return notFound(
            "No inventory found."
        );
    }

    const inventoryMap = new Map();

    for (const row of rows) {

        if (!inventoryMap.has(row.medicine_id)) {

            inventoryMap.set(row.medicine_id, {

                medicine_id: row.medicine_id,

                medicine_name: row.medicine_name,

                manufacturer_id: row.manufacturer_id,

                manufacturer_name: row.manufacturer_name,

                category: row.category,

                reorder_level: row.reorder_level,

                available_stock: 0,

                batches: []

            });
        }

        const medicine =
            inventoryMap.get(row.medicine_id);

        medicine.available_stock +=
            Number(row.stock_quantity);

        medicine.batches.push({

            batch_id: row.batch_id,

            batch_number: row.batch_number,

            selling_price: Number(row.selling_price),

            stock_quantity: Number(row.stock_quantity),

            expiry_date: row.expiry_date,

            days_to_expire: Number(row.days_to_expire),

            is_expiring_soon:
                Number(row.days_to_expire) <= 10

        });
    }

    return ok(
        "Inventory retrieved successfully.",
        Array.from(inventoryMap.values())
    );
};

const getBatchById = async (batchId) => {

    const batch =
        await batchModel.getBatchById(batchId);

    if (!batch) {
        return notFound("Batch not found.");
    }

    return ok(
        "Batch retrieved successfully.",
        batch
    );
};
const getBatchByMedicineId = async (medicineId) => {

    const medicine =
        await medicineModel.getMedicineById(medicineId);

    if (!medicine) {
        return notFound("Medicine not found.");
    }

    const batches =
        await batchModel.getBatchByMedicineId(medicineId);

    if (batches.length === 0) {
        return notFound("No batches found for this medicine.");
    }

    return ok(
        "Batches retrieved successfully.",
        batches
    );
};

const searchInventory = async (search) => {

    const inventory =
        await batchModel.searchInventory(search);

    if (inventory.length === 0) {
        return notFound(
            "No inventory found matching the search."
        );
    }

    return ok(
        "Inventory retrieved successfully.",
        inventory
    );
};

const getLowStockMedicines = async () => {

    const medicines =
        await batchModel.getLowStockMedicines();

    if (medicines.length === 0) {
        return notFound(
            "No low stock medicines found."
        );
    }

    const result = medicines.map(medicine => ({

        ...medicine,

        severity:
            medicine.available_stock === 0
                ? "Critical"
                : "Warning"

    }));

    return ok(
        "Low stock medicines retrieved successfully.",
        result
    );
};

// ==========================================
// Update
// ==========================================
const updateBatch = async (
    batchId,
    batch
) => {

    // Check batch exists
    const existingBatch =
        await batchModel.getBatchById(batchId);

    if (!existingBatch) {
        return notFound("Batch not found.");
    }

    // Check batch active
    if (!existingBatch.is_active) {
        return badRequest(
            "Cannot update an inactive batch."
        );
    }

    // Validate prices
    if (Number(batch.selling_price) < Number(batch.purchase_price)) {
        return badRequest(
            "Selling price cannot be less than purchase price."
        );
    }

    // Validate expiry
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiryDate = new Date(batch.expiry_date);

    if (expiryDate <= today) {
        return badRequest(
            "Expiry date must be a future date."
        );
    }

    // Check duplicate batch number
    const duplicateBatch =
        await batchModel.getBatchByMedicineIdAndBatchNumber(
            existingBatch.medicine_id,
            batch.batch_number
        );

    if (
        duplicateBatch &&
        duplicateBatch.batch_id !== Number(batchId)
    ) {
        return conflict(
            "Batch number already exists for this medicine."
        );
    }

    // Update batch
    await batchModel.updateBatch(
        batchId,
        batch
    );

    return ok(
        "Batch updated successfully."
    );
};

const updateBatchStock = async (batchId, quantity) => {

    // Check batch exists
    const batch = await batchModel.getBatchById(batchId);

    if (!batch) {
        return notFound("Batch not found.");
    }

    // Check batch active
    if (!batch.is_active) {
        return badRequest("Cannot update an inactive batch.");
    }

    // Prevent negative stock
    const updatedStock =
        Number(batch.stock_quantity) + Number(quantity);

    if (updatedStock < 0) {
        return badRequest("Insufficient stock.");
    }

    // Pass database pool as first argument
    await batchModel.updateBatchStock(
        db,
        batchId,
        quantity
    );

    return ok("Batch stock updated successfully.");
};


const deactivateBatch = async (batchId) => {

    const batch =
        await batchModel.getBatchById(batchId);

    if (!batch) {
        return notFound("Batch not found.");
    }

    if (!batch.is_active) {
        return badRequest(
            "Batch is already inactive."
        );
    }

    await batchModel.deactivateBatch(batchId);

    return ok(
        "Batch deactivated successfully."
    );
};

const restoreBatch = async (batchId) => {

    const batch =
        await batchModel.getBatchById(batchId);

    if (!batch) {
        return notFound("Batch not found.");
    }

    if (batch.is_active) {
        return badRequest(
            "Batch is already active."
        );
    }

    await batchModel.restoreBatch(batchId);

    return ok(
        "Batch restored successfully."
    );
};

module.exports={
        // Create
    createBatch,

    // Read
    getInventory,
    getBatchById,
    getBatchByMedicineId,
    searchInventory,
    getLowStockMedicines,

    // Update
    updateBatch,
    updateBatchStock,

    // Soft Delete
    deactivateBatch,
    restoreBatch
}