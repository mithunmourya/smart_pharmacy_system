const express = require("express");

const router = express.Router();

const manufacturerController = require("../controllers/manufacturer.controller");

const authenticate = require("../middleware/auth.middleware");
const authorize = require("../middleware/role.middleware");


// Create
router.post(
    "/",
    authenticate,
    authorize("Admin"),
    manufacturerController.addManufacturer
);


// Read
router.get(
    "/",
    authenticate,
    authorize("Admin", "Pharmacist"),
    manufacturerController.getAllManufacturers
);

router.get(
    "/:manufacturerId",
    authenticate,
    authorize("Admin", "Pharmacist"),
    manufacturerController.getManufacturerById
);


// Update
router.put(
    "/:manufacturerId",
    authenticate,
    authorize("Admin"),
    manufacturerController.updateManufacturer
);


// Soft Delete
router.patch(
    "/:manufacturerId/deactivate",
    authenticate,
    authorize("Admin"),
    manufacturerController.deactivateManufacturer
);

router.patch(
    "/:manufacturerId/restore",
    authenticate,
    authorize("Admin"),
    manufacturerController.restoreManufacturer
);


module.exports = router;