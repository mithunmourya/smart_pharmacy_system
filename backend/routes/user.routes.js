const express = require("express");

const router = express.Router();

const userController = require("../controllers/user.controller");

const authenticate = require("../middleware/auth.middleware");
const authorize = require("../middleware/role.middleware");


// Authentication
router.post("/register", userController.registerUser);
router.post("/login", userController.loginUser);



// Pharmacist searches for an existing customer.
router.get(
    "/customers/lookup",
    authenticate,
    authorize("Pharmacist"),
    userController.lookupCustomerByEmail
);
// Pharmacist creates a customer account.
router.post(
    "/customers",
    authenticate,
    authorize("Pharmacist"),
    userController.createCustomerByPharmacist
);
// Read
router.get(
    "/",
    authenticate,
    authorize("Admin"),
    userController.getAllUsers
);



// Logged-in user changes their own password
router.patch(
    "/change-password",
    authenticate,
    userController.changePassword
);

router.get(
    "/:userId",
    authenticate,
    authorize("Admin"),
    userController.getUserById
);


// Update
router.put(
    "/:userId",
    authenticate,
    authorize("Admin"),
    userController.updateUser
);

// Admin changes user role
router.patch(
    "/:userId/role",
    authenticate,
    authorize("Admin"),
    userController.changeRole
);


// Soft Delete
router.patch(
    "/:userId/deactivate",
    authenticate,
    authorize("Admin"),
    userController.deactivateUser
);

router.patch(
    "/:userId/restore",
    authenticate,
    authorize("Admin"),
    userController.restoreUser
);


module.exports = router;