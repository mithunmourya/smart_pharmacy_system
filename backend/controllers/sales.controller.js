const salesService = require("../services/sales.service");
const { badRequest } = require("../utils/response");

// ==========================================
// Validation Helpers
// ==========================================

const validateSaleId = (saleId) => {

    const id = Number(saleId);

    if (!Number.isInteger(id) || id <= 0) {
        return null;
    }

    return id;
};


// ==========================================
// Create
// ==========================================

const createSale = async (req, res) => {

    const serviceResponse =
        await salesService.createSale({
            ...req.body,
            pharmacist_id: req.user.userId
        });

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


// ==========================================
// Read
// ==========================================

const getAllSales = async (req, res) => {

    const serviceResponse =
        await salesService.getAllSales();

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


const getSaleById = async (req, res) => {

    const saleId =
        validateSaleId(req.params.saleId);

    if (!saleId) {

        const err =
            badRequest("Invalid sale ID.");

        return res
            .status(err.status)
            .json(err);
    }

    const serviceResponse =
        await salesService.getSaleById(saleId);

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


const searchSales = async (req, res) => {

    const search =
        req.query.search?.trim();

    if (!search) {

        const err = badRequest(
            "Search failed. The 'search' query parameter is missing or empty."
        );

        return res
            .status(err.status)
            .json(err);
    }

    const serviceResponse =
        await salesService.searchSales(search);

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};

// ==========================================
// Customer: List Own Purchases
// ==========================================

const getMyPurchases = async (req, res, next) => {
    try {
        const serviceResponse =
            await salesService.getMyPurchases(
                req.user.userId
            );

        return res
            .status(serviceResponse.status)
            .json(serviceResponse);
    } catch (error) {
        return next(error);
    }
};

// ==========================================
// Customer: View Own Purchase Details
// ==========================================

const getMyPurchaseById = async (req, res, next) => {
    const saleId = Number(req.params.saleId);

    if (
        !Number.isSafeInteger(saleId) ||
        saleId <= 0
    ) {
        const err = badRequest("Invalid sale ID.");

        return res
            .status(err.status)
            .json(err);
    }

    try {
        const serviceResponse =
            await salesService.getMyPurchaseById(
                req.user.userId,
                saleId
            );

        return res
            .status(serviceResponse.status)
            .json(serviceResponse);
    } catch (error) {
        return next(error);
    }
};


module.exports = {

    // Create
    createSale,

    // Read
    getAllSales,
    getSaleById,
    searchSales,

    getMyPurchases,
    getMyPurchaseById

};