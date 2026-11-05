const medicineService = require("../services/medicine.service");
const { badRequest } = require("../utils/response");

// ==========================================
// Validation Helpers
// ==========================================
const getMissingMedicineFields = (body) => {

    const missing = [];

    if (
        body.manufacturer_id === undefined ||
        body.manufacturer_id === null
    ) {
        missing.push("manufacturer_id");
    }

    if (!body.name || body.name.trim() === "") {
        missing.push("name");
    }

    if (!body.category || body.category.trim() === "") {
        missing.push("category");
    }

    if (
        body.reorder_level === undefined ||
        body.reorder_level === null
    ) {
        missing.push("reorder_level");
    }

    return missing.length > 0 ? missing : null;
};

const validateMedicineId = (medicineId) => {

    const id = Number(medicineId);

    if (!Number.isInteger(id) || id <= 0) {
        return null;
    }

    return id;
};

// ==========================================
// Create
// ==========================================
const addMedicine = async (req, res) => {

    const missingFields = getMissingMedicineFields(req.body);

    if (missingFields) {

        const err = badRequest(
            `Creation failed. Missing required fields: ${missingFields.join(", ")}`
        );

        return res.status(err.status).json(err);
    }

    req.body.name = req.body.name.trim();
    req.body.category = req.body.category.trim();

    const serviceResponse =
        await medicineService.addMedicine(req.body);

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


// ==========================================
// Read
// ==========================================
const getAllMedicines = async (req, res) => {

    const serviceResponse =
        await medicineService.getAllMedicines();

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


const getMedicineById = async (req, res) => {

    const medicineId =
        validateMedicineId(req.params.medicineId);

    if (!medicineId) {

        const err = badRequest("Invalid medicine ID.");

        return res.status(err.status).json(err);
    }

    const serviceResponse =
        await medicineService.getMedicineById(medicineId);

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


// ==========================================
// Search
// ==========================================
const searchMedicineByName = async (req, res) => {

    const name = req.query.name?.trim();

    if (!name) {

        const err = badRequest(
            "Search failed. The 'name' query parameter is missing or empty (e.g., ?name=paracetamol)."
        );

        return res.status(err.status).json(err);
    }

    const serviceResponse =
        await medicineService.searchMedicineByName(name);

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


const searchMedicineByManufacturerName = async (req, res) => {

    const manufacturer = req.query.manufacturer?.trim();

    if (!manufacturer) {

        const err = badRequest(
            "Search failed. The 'manufacturer' query parameter is missing or empty (e.g., ?manufacturer=Micro Labs)."
        );

        return res.status(err.status).json(err);
    }

    const serviceResponse =
        await medicineService.searchMedicineByManufacturerName(
            manufacturer
        );

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


// ==========================================
// Update
// ==========================================
const updateMedicine = async (req, res) => {

    const medicineId =
        validateMedicineId(req.params.medicineId);

    if (!medicineId) {

        const err = badRequest("Invalid medicine ID.");

        return res.status(err.status).json(err);
    }

    const missingFields = getMissingMedicineFields(req.body);

    if (missingFields) {

        const err = badRequest(
            `Update failed. Missing required fields: ${missingFields.join(", ")}`
        );

        return res.status(err.status).json(err);
    }

    req.body.name = req.body.name.trim();
    req.body.category = req.body.category.trim();

    const serviceResponse =
        await medicineService.updateMedicine(
            medicineId,
            req.body
        );

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


// ==========================================
// Soft Delete
// ==========================================
const deactivateMedicine = async (req, res) => {

    const medicineId =
        validateMedicineId(req.params.medicineId);

    if (!medicineId) {

        const err = badRequest("Invalid medicine ID.");

        return res.status(err.status).json(err);
    }

    const serviceResponse =
        await medicineService.deactivateMedicine(
            medicineId
        );

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


const restoreMedicine = async (req, res) => {

    const medicineId =
        validateMedicineId(req.params.medicineId);

    if (!medicineId) {

        const err = badRequest("Invalid medicine ID.");

        return res.status(err.status).json(err);
    }

    const serviceResponse =
        await medicineService.restoreMedicine(
            medicineId
        );

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


module.exports = {
    addMedicine,
    getAllMedicines,
    getMedicineById,
    searchMedicineByName,
    searchMedicineByManufacturerName,
    updateMedicine,
    deactivateMedicine,
    restoreMedicine
};