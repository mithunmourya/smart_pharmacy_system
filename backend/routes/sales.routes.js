const express = require("express");

const router = express.Router();

const salesController = require("../controllers/sales.controller");
const authenticate = require("../middleware/auth.middleware");
const authorize = require("../middleware/role.middleware");

// ==========================================
// Pharmacist: Create Sale
// ==========================================

router.post(
    "/",
    authenticate,
    authorize("Pharmacist"),
    salesController.createSale
);

// ==========================================
// Customer: Own Purchases
// Keep these routes before /:saleId.
// ==========================================

router.get(
    "/my-purchases",
    authenticate,
    authorize("Customer"),
    salesController.getMyPurchases
);

router.get(
    "/my-purchases/:saleId",
    authenticate,
    authorize("Customer"),
    salesController.getMyPurchaseById
);

// ==========================================
// Admin: Sales History
// ==========================================

router.get(
    "/",
    authenticate,
    authorize("Admin"),
    salesController.getAllSales
);

router.get(
    "/search",
    authenticate,
    authorize("Admin"),
    salesController.searchSales
);

router.get(
    "/:saleId",
    authenticate,
    authorize("Admin"),
    salesController.getSaleById
);

module.exports = router;