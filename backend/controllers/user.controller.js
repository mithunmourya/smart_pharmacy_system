const userService = require("../services/user.service");
const { badRequest } = require("../utils/response");

// ==========================================
// Validation Helpers
// ==========================================
const validateUserId = (userId) => {

    const id = Number(userId);

    if (!Number.isInteger(id) || id <= 0) {
        return null;
    }

    return id;
};

// ==========================================
// Create
// ==========================================
const registerUser = async (req, res) => {

    const serviceResponse =
        await userService.registerUser(req.body);

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


// ==========================================
// Authentication
// ==========================================
const loginUser = async (req, res) => {

    const serviceResponse =
        await userService.loginUser(
            req.body.email,
            req.body.password
        );

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


// ==========================================
// Read
// ==========================================
const getAllUsers = async (req, res) => {

    const serviceResponse =
        await userService.getAllUsers();

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


const getUserById = async (req, res) => {

    const userId =
        validateUserId(req.params.userId);

    if (!userId) {

        const err = badRequest("Invalid user ID.");

        return res.status(err.status).json(err);
    }

    const serviceResponse =
        await userService.getUserById(userId);

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


// ==========================================
// Update
// ==========================================
const updateUser = async (req, res) => {

    const userId =
        validateUserId(req.params.userId);

    if (!userId) {

        const err = badRequest("Invalid user ID.");

        return res.status(err.status).json(err);
    }

    const serviceResponse =
        await userService.updateUser(
            userId,
            req.body
        );

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


const changePassword = async (req, res) => {

    const serviceResponse =
        await userService.changePassword(
            req.user.userId,
            req.body.currentPassword,
            req.body.newPassword
        );

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


const changeRole = async (req, res) => {

    const userId =
        validateUserId(req.params.userId);

    if (!userId) {

        const err = badRequest("Invalid user ID.");

        return res.status(err.status).json(err);
    }

    const serviceResponse =
        await userService.changeRole(
            userId,
            req.body.role
        );

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};


// ==========================================
// Soft Delete
// ==========================================
const deactivateUser = async (req, res) => {
    const userId = validateUserId(req.params.userId);

    if (!userId) {
        const err = badRequest("Invalid user ID.");

        return res
            .status(err.status)
            .json(err);
    }

    const serviceResponse =
        await userService.deactivateUser(
            userId,
            req.user.userId
        );

    return res
        .status(serviceResponse.status)
        .json(serviceResponse);
};

const restoreUser = async (req, res) => {

    const userId =
        validateUserId(req.params.userId);

    if (!userId) {

        const err = badRequest("Invalid user ID.");

        return res.status(err.status).json(err);
    }

    const serviceResponse =
        await userService.restoreUser(
            userId
        );

    res
        .status(serviceResponse.status)
        .json(serviceResponse);
};

// ==========================================
// Pharmacist: Find Customer by Email
// ==========================================

const lookupCustomerByEmail = async (req, res, next) => {
    try {
        const serviceResponse =
            await userService.lookupCustomerByEmail(
                req.query.email
            );

        return res
            .status(serviceResponse.status)
            .json(serviceResponse);
    } catch (error) {
        return next(error);
    }
};
// ==========================================
// Pharmacist: Create Customer
// ==========================================

const createCustomerByPharmacist = async (req, res, next) => {
    try {
        const serviceResponse =
            await userService.createCustomerByPharmacist(
                req.body
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
    registerUser,

    // Authentication
    loginUser,

    // Read
    getAllUsers,
    getUserById,
    lookupCustomerByEmail,
    createCustomerByPharmacist,

    // Update
    updateUser,
    changePassword,
    changeRole,
    

    // Soft Delete
    deactivateUser,
    restoreUser
};