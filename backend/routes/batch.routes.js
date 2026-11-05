const express = require("express");

const router = express.Router();

const batchController = require("../controllers/batch.controller");

const authenticate = require("../middleware/auth.middleware");
const authorize = require("../middleware/role.middleware");


// ==========================================
// Create
// ==========================================
router.post(
    "/",
    authenticate,
    authorize("Admin"),
    batchController.createBatch
);


// ==========================================
// Read
// ==========================================
router.get(
    "/inventory",
    authenticate,
    authorize("Admin", "Pharmacist"),
    batchController.getInventory
);

router.get(
    "/low-stock",
    authenticate,
    authorize("Admin", "Pharmacist"),
    batchController.getLowStockMedicines
);

router.get(
    "/search",
    authenticate,
    authorize("Admin", "Pharmacist"),
    batchController.searchInventory
);

router.get(
    "/medicine/:medicineId",
    authenticate,
    authorize("Admin", "Pharmacist"),
    batchController.getBatchByMedicineId
);

router.get(
    "/:batchId",
    authenticate,
    authorize("Admin", "Pharmacist"),
    batchController.getBatchById
);


// ==========================================
// Update
// ==========================================
router.put(
    "/:batchId",
    authenticate,
    authorize("Admin"),
    batchController.updateBatch
);

router.patch(
    "/:batchId/stock",
    authenticate,
    authorize("Admin"),
    batchController.updateBatchStock
);


// ==========================================
// Soft Delete & Restore
// ==========================================
router.patch(
    "/:batchId/deactivate",
    authenticate,
    authorize("Admin"),
    batchController.deactivateBatch
);

router.patch(
    "/:batchId/restore",
    authenticate,
    authorize("Admin"),
    batchController.restoreBatch
);


module.exports = router;