const manufacturerService = require("../services/manufacturer.service");
const { badRequest } = require("../utils/response");

// ==========================================
// Validation Helpers
// ==========================================
const validateManufacturerName = (name) => {

    if (!name || name.trim() === "") {
        return false;
    }

    return true;
};

const validateManufacturerId = (manufacturerId) => {

    const id = Number(manufacturerId);

    if (!Number.isInteger(id) || id <= 0) {
        return null;
    }

    return id;
};


// ==========================================
// Create
// ==========================================
const addManufacturer = async (req, res) => {

    if (!validateManufacturerName(req.body.name)) {

        const err = badRequest(
            "Manufacturer name is required."
        );

        return res.status(err.status).json(err);
    }

    const name = req.body.name.trim();

    const serviceResponse =
        await manufacturerService.addManufacturer(name);

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


// ==========================================
// Read
// ==========================================
const getAllManufacturers = async (req, res) => {

    const serviceResponse =
        await manufacturerService.getAllManufacturers();

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


const getManufacturerById = async (req, res) => {

    const manufacturerId =
        validateManufacturerId(req.params.manufacturerId);

    if (!manufacturerId) {

        const err = badRequest("Invalid manufacturer ID.");

        return res.status(err.status).json(err);
    }

    const serviceResponse =
        await manufacturerService.getManufacturerById(
            manufacturerId
        );

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


// ==========================================
// Update
// ==========================================
const updateManufacturer = async (req, res) => {

    const manufacturerId =
        validateManufacturerId(req.params.manufacturerId);

    if (!manufacturerId) {

        const err = badRequest("Invalid manufacturer ID.");

        return res.status(err.status).json(err);
    }

    if (!validateManufacturerName(req.body.name)) {

        const err = badRequest(
            "Manufacturer name is required."
        );

        return res.status(err.status).json(err);
    }

    const name = req.body.name.trim();

    const serviceResponse =
        await manufacturerService.updateManufacturer(
            manufacturerId,
            name
        );

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


// ==========================================
// Soft Delete
// ==========================================
const deactivateManufacturer = async (req, res) => {

    const manufacturerId =
        validateManufacturerId(req.params.manufacturerId);

    if (!manufacturerId) {

        const err = badRequest("Invalid manufacturer ID.");

        return res.status(err.status).json(err);
    }

    const serviceResponse =
        await manufacturerService.deactivateManufacturer(
            manufacturerId
        );

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


const restoreManufacturer = async (req, res) => {

    const manufacturerId =
        validateManufacturerId(req.params.manufacturerId);

    if (!manufacturerId) {

        const err = badRequest("Invalid manufacturer ID.");

        return res.status(err.status).json(err);
    }

    const serviceResponse =
        await manufacturerService.restoreManufacturer(
            manufacturerId
        );

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


module.exports = {
    addManufacturer,
    getAllManufacturers,
    getManufacturerById,
    updateManufacturer,
    deactivateManufacturer,
    restoreManufacturer
};