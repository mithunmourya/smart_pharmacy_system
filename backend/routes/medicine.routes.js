const express = require("express");

const router = express.Router();

const medicineController = require("../controllers/medicine.controller");

const authenticate = require("../middleware/auth.middleware");
const authorize = require("../middleware/role.middleware");


// Create
router.post(
    "/",
    authenticate,
    authorize("Admin"),
    medicineController.addMedicine
);


// Read
router.get(
    "/",
    authenticate,
    authorize("Admin", "Pharmacist"),
    medicineController.getAllMedicines
);

router.get(
    "/search/name",
    authenticate,
    authorize("Admin", "Pharmacist"),
    medicineController.searchMedicineByName
);

router.get(
    "/search/manufacturer",
    authenticate,
    authorize("Admin", "Pharmacist"),
    medicineController.searchMedicineByManufacturerName
);

router.get(
    "/:medicineId",
    authenticate,
    authorize("Admin", "Pharmacist"),
    medicineController.getMedicineById
);


// Update
router.put(
    "/:medicineId",
    authenticate,
    authorize("Admin"),
    medicineController.updateMedicine
);


// Soft Delete
router.patch(
    "/:medicineId/deactivate",
    authenticate,
    authorize("Admin"),
    medicineController.deactivateMedicine
);

router.patch(
    "/:medicineId/restore",
    authenticate,
    authorize("Admin"),
    medicineController.restoreMedicine
);


module.exports = router;