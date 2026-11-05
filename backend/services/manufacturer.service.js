const manufacturerModel = require("../models/manufacturer.model");

const {
    ok,
    created,
    badRequest,
    notFound,
    conflict
} = require("../utils/response");


// Create
const addManufacturer = async (name) => {

    name = name.trim();

    const existingManufacturer =
        await manufacturerModel.getManufacturerByName(name);

    if (existingManufacturer) {

        if (existingManufacturer.is_active) {
            return conflict("Manufacturer already exists.");
        }

        return conflict(
            "Manufacturer is inactive. Do you want to restore it?",
            {
                requiresConfirmation: true,
                manufacturerId: existingManufacturer.manufacturer_id
            }
        );
    }

    const manufacturerId =
        await manufacturerModel.createManufacturer(name);

    return created(
        "Manufacturer added successfully.",
        { manufacturerId }
    );
};


// Read
const getAllManufacturers = async () => {

    const manufacturers =
        await manufacturerModel.getAllManufacturers();

    if (manufacturers.length === 0) {
        return notFound("No manufacturers found.");
    }

    return ok(
        "Manufacturers retrieved successfully.",
        manufacturers
    );
};


const getManufacturerById = async (manufacturerId) => {

    const manufacturer =
        await manufacturerModel.getManufacturerById(manufacturerId);

    if (!manufacturer) {
        return notFound("Manufacturer not found.");
    }

    return ok(
        "Manufacturer retrieved successfully.",
        manufacturer
    );
};


// Update
const updateManufacturer = async (
    manufacturerId,
    name
) => {

    name = name.trim();

    const existingManufacturer =
        await manufacturerModel.getManufacturerById(manufacturerId);

    if (!existingManufacturer) {
        return notFound("Manufacturer not found.");
    }

    if (!existingManufacturer.is_active) {
        return conflict(
            "Manufacturer is inactive. Restore it before updating."
        );
    }

    const duplicateManufacturer =
        await manufacturerModel.getManufacturerByName(name);

    if (
        duplicateManufacturer &&
        duplicateManufacturer.manufacturer_id !== Number(manufacturerId)
    ) {
        return conflict("Manufacturer already exists.");
    }

    await manufacturerModel.updateManufacturer(
        manufacturerId,
        name
    );

    return ok("Manufacturer updated successfully.");
};


// Soft Delete
const deactivateManufacturer = async (manufacturerId) => {

    const manufacturer =
        await manufacturerModel.getManufacturerById(manufacturerId);

    if (!manufacturer) {
        return notFound("Manufacturer not found.");
    }

    if (!manufacturer.is_active) {
        return badRequest(
            "Manufacturer is already inactive."
        );
    }

    // Later:
    // Check whether this manufacturer has medicines before allowing deactivation.

    await manufacturerModel.deactivateManufacturer(
        manufacturerId
    );

    return ok("Manufacturer deactivated successfully.");
};


const restoreManufacturer = async (manufacturerId) => {

    const manufacturer =
        await manufacturerModel.getManufacturerById(manufacturerId);

    if (!manufacturer) {
        return notFound("Manufacturer not found.");
    }

    if (manufacturer.is_active) {
        return badRequest(
            "Manufacturer is already active."
        );
    }

    await manufacturerModel.restoreManufacturer(
        manufacturerId
    );

    return ok("Manufacturer restored successfully.");
};


module.exports = {

    // Create
    addManufacturer,

    // Read
    getAllManufacturers,
    getManufacturerById,

    // Update
    updateManufacturer,

    // Soft Delete
    deactivateManufacturer,
    restoreManufacturer
};