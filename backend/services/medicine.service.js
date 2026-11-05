const medicineModel = require("../models/medicine.model");
const manufacturerModel = require("../models/manufacturer.model");

const {
    ok,
    created,
    badRequest,
    notFound,
    conflict
} = require("../utils/response");


// Create
const addMedicine = async (medicine) => {

    const manufacturer =
        await manufacturerModel.getManufacturerById(
            medicine.manufacturer_id
        );

    if (!manufacturer) {
        return notFound("Manufacturer not found.");
    }

    if (!manufacturer.is_active) {
        return conflict(
            "Manufacturer is inactive. Restore it before adding medicines."
        );
    }
    // --- NEW DATA HYGIENE CODE ---
    if (medicine.name) medicine.name = medicine.name.trim();
    if (medicine.category) medicine.category = medicine.category.trim();
    
    const existingMedicine =
        await medicineModel.getMedicineByNameAndManufacturerId(
            medicine.name,
            medicine.manufacturer_id
        );

    if (existingMedicine) {

        if (existingMedicine.medicine_is_active) {
            return conflict("Medicine already exists.");
        }

        return conflict(
            "Medicine is inactive. Do you want to restore it?",
            {
                requiresConfirmation: true,
                medicineId: existingMedicine.medicine_id
            }
        );
    }

    const medicineId =
        await medicineModel.createMedicine(medicine);

    return created(
        "Medicine added successfully.",
        { medicineId }
    );
};


// Read
const getAllMedicines = async () => {

    const medicines =
        await medicineModel.getAllMedicines();

    if (medicines.length === 0) {
        return notFound("No medicines found.");
    }

    return ok(
        "Medicines retrieved successfully.",
        medicines
    );
};


const getMedicineById = async (medicineId) => {

    const medicine =
        await medicineModel.getMedicineById(
            medicineId
        );

    if (!medicine) {
        return notFound("Medicine not found.");
    }

    return ok(
        "Medicine retrieved successfully.",
        medicine
    );
};


const searchMedicineByName = async (name) => {

    const medicines =
        await medicineModel.searchMedicineByName(
            name
        );

    if (medicines.length === 0) {
        return notFound("No medicines found.");
    }

    return ok(
        "Medicines retrieved successfully.",
        medicines
    );
};


const searchMedicineByManufacturerName = async (
    manufacturer
) => {

    const medicines =
        await medicineModel.searchMedicineByManufacturerName(
            manufacturer
        );

    if (medicines.length === 0) {
        return notFound("No medicines found.");
    }

    return ok(
        "Medicines retrieved successfully.",
        medicines
    );
};


// Update
const updateMedicine = async (
    medicineId,
    medicine
) => {

    const existingMedicine =
        await medicineModel.getMedicineById(
            medicineId
        );

    if (!existingMedicine) {
        return notFound("Medicine not found.");
    }

    if (!existingMedicine.medicine_is_active) {
        return conflict(
            "Medicine is inactive. Restore it before updating."
        );
    }
    // --- NEW DATA HYGIENE CODE ---
    if (medicine.name) medicine.name = medicine.name.trim();
    if (medicine.category) medicine.category = medicine.category.trim();

    const manufacturer =
        await manufacturerModel.getManufacturerById(
            medicine.manufacturer_id
        );

    if (!manufacturer) {
        return notFound("Manufacturer not found.");
    }

    if (!manufacturer.is_active) {
        return conflict(
            "Manufacturer is inactive."
        );
    }

    const duplicateMedicine =
        await medicineModel.getMedicineByNameAndManufacturerId(
            medicine.name,
            medicine.manufacturer_id
        );

    if (
        duplicateMedicine &&
        duplicateMedicine.medicine_id !== Number(medicineId)
    ) {
        return conflict("Medicine already exists.");
    }

    await medicineModel.updateMedicine(
        medicineId,
        medicine
    );

    return ok(
        "Medicine updated successfully."
    );
};


// Soft Delete
const deactivateMedicine = async (
    medicineId
) => {

    const medicine =
        await medicineModel.getMedicineById(
            medicineId
        );

    if (!medicine) {
        return notFound("Medicine not found.");
    }

    if (!medicine.medicine_is_active) {
        return badRequest(
            "Medicine is already inactive."
        );
    }

    await medicineModel.deactivateMedicine(
        medicineId
    );

    return ok(
        "Medicine deactivated successfully."
    );
};


const restoreMedicine = async (
    medicineId
) => {

    const medicine =
        await medicineModel.getMedicineById(
            medicineId
        );

    if (!medicine) {
        return notFound("Medicine not found.");
    }

    if (medicine.medicine_is_active) {
        return badRequest(
            "Medicine is already active."
        );
    }

    const manufacturer =
        await manufacturerModel.getManufacturerById(
            medicine.manufacturer_id
        );

    if (!manufacturer.is_active) {
        return conflict(
            "Manufacturer is inactive. Restore the manufacturer first."
        );
    }

    await medicineModel.restoreMedicine(
        medicineId
    );

    return ok(
        "Medicine restored successfully."
    );
};


module.exports = {

    // Create
    addMedicine,

    // Read
    getAllMedicines,
    getMedicineById,
    searchMedicineByName,
    searchMedicineByManufacturerName,

    // Update
    updateMedicine,

    // Soft Delete
    deactivateMedicine,
    restoreMedicine
};