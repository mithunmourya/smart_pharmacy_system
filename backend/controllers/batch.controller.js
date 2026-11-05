const batchService = require("../services/batch.service");
const { badRequest } = require("../utils/response");

// ==========================================
// Validation Helper
// ==========================================

const getMissingBatchFields = (body, isUpdate = false) => {

    const missing = [];

    // Required only when creating a batch
    if (!isUpdate && !body.medicine_id) {
        missing.push("medicine_id");
    }

    if (!body.batch_number || body.batch_number.trim() === "") {
        missing.push("batch_number");
    }

    if (
        body.purchase_price === undefined ||
        body.purchase_price === null
    ) {
        missing.push("purchase_price");
    }

    if (
        body.selling_price === undefined ||
        body.selling_price === null
    ) {
        missing.push("selling_price");
    }

    // Required only when creating a batch
    if (
        !isUpdate &&
        (
            body.stock_quantity === undefined ||
            body.stock_quantity === null
        )
    ) {
        missing.push("stock_quantity");
    }

    if (!body.expiry_date) {
        missing.push("expiry_date");
    }

    return missing.length > 0 ? missing : null;
};

// ==========================================
// Create
// ==========================================
const createBatch = async (req, res) => {

    const missingFields = getMissingBatchFields(req.body);

    if (missingFields) {

        const err = badRequest(
            `Creation failed. Missing required fields: ${missingFields.join(", ")}`
        );

        return res.status(err.status).json(err);
    }

    const response =
        await batchService.createBatch(req.body);

    res.status(response.status).json(response);
};

// ==========================================
// Read
// ==========================================
const getInventory = async (req, res) => {

    const response =
        await batchService.getInventory();

    res.status(response.status).json(response);
};

const getBatchById = async (req, res) => {

    const response =
        await batchService.getBatchById(
            req.params.batchId
        );

    res.status(response.status).json(response);
};

const getBatchByMedicineId = async (req, res) => {

    const response =
        await batchService.getBatchByMedicineId(
            req.params.medicineId
        );

    res.status(response.status).json(response);
};

const searchInventory = async (req, res) => {

    const search = req.query.search?.trim();

    if (!search) {

        const err = badRequest(
            "Search failed. The 'search' query parameter is required."
        );

        return res.status(err.status).json(err);
    }

    const response =
        await batchService.searchInventory(search);

    res.status(response.status).json(response);
};

const getLowStockMedicines = async (req, res) => {

    const response =
        await batchService.getLowStockMedicines();

    res.status(response.status).json(response);
};

// ==========================================
// Update
// ==========================================
const updateBatch = async (req, res) => {

    const missingFields = getMissingBatchFields(req.body, true);

    if (missingFields) {

        const err = badRequest(
            `Update failed. Missing required fields: ${missingFields.join(", ")}`
        );

        return res.status(err.status).json(err);
    }

    const response =
        await batchService.updateBatch(
            req.params.batchId,
            req.body
        );

    res.status(response.status).json(response);
};

const updateBatchStock = async (req, res) => {

    if (
        req.body.quantity === undefined ||
        req.body.quantity === null
    ) {

        const err = badRequest(
            "Quantity is required."
        );

        return res.status(err.status).json(err);
    }

    const response =
        await batchService.updateBatchStock(
            req.params.batchId,
            req.body.quantity
        );

    res.status(response.status).json(response);
};

// ==========================================
// Soft Delete & Restore
// ==========================================
const deactivateBatch = async (req, res) => {

    const response =
        await batchService.deactivateBatch(
            req.params.batchId
        );

    res.status(response.status).json(response);
};

const restoreBatch = async (req, res) => {

    const response =
        await batchService.restoreBatch(
            req.params.batchId
        );

    res.status(response.status).json(response);
};

module.exports = {

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
};