
require("dotenv").config();

const request = require("supertest");
const jwt = require("jsonwebtoken");

// Mock user model for authentication
jest.mock("../../models/user.model", () => ({
    getUserAuthById: jest.fn()
}));

// Mock manufacturer service
jest.mock("../../services/manufacturer.service");

const app = require("../../app");
const userModel = require("../../models/user.model");
const manufacturerService = require("../../services/manufacturer.service");

// ============================================================
// TEST USERS AND JWT TOKENS
// ============================================================

const accounts = [
    {
        user_id: 1,
        email: "admin@gmail.com",
        role: "Admin",
        is_active: 1,
        token_version: 0
    },
    {
        user_id: 2,
        email: "customer@gmail.com",
        role: "Customer",
        is_active: 1,
        token_version: 0
    },
    {
        user_id: 3,
        email: "pharmacist@gmail.com",
        role: "Pharmacist",
        is_active: 1,
        token_version: 0
    }
];

const signAccountToken = (account) => jwt.sign(
    {
        userId: account.user_id,
        email: account.email,
        role: account.role,
        token_version: account.token_version
    },
    process.env.JWT_SECRET,
    {
        algorithm: "HS256",
        expiresIn: "1h"
    }
);

const [adminToken, customerToken, pharmacistToken] =
    accounts.map(signAccountToken);

// ============================================================
// RESET MOCKS BEFORE EACH TEST
// ============================================================

beforeEach(() => {
    jest.resetAllMocks();

    userModel.getUserAuthById.mockImplementation(
        async (userId) => {
            return accounts.find(
                account => account.user_id === userId
            ) ?? null;
        }
    );
});

// Helper for authenticated requests
const authRequest = (method, path, token = adminToken) =>
    request(app)[method](path).set(
        "Authorization",
        `Bearer ${token}`
    );

// ============================================================
// POST /manufacturers
// ============================================================

describe("POST /manufacturers", () => {

    test("should return 401 when token is missing", async () => {

        const response = await request(app)
            .post("/manufacturers")
            .send({ name: "Cipla" });

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);

        expect(manufacturerService.addManufacturer)
            .not.toHaveBeenCalled();
    });

    test("should return 403 when user is not Admin", async () => {

        const response = await authRequest(
            "post",
            "/manufacturers",
            customerToken
        ).send({ name: "Cipla" });

        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);

        expect(manufacturerService.addManufacturer)
            .not.toHaveBeenCalled();
    });

    test("should return 400 when manufacturer name is missing", async () => {

        const response = await authRequest(
            "post",
            "/manufacturers"
        ).send({});

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe(
            "Manufacturer name is required."
        );

        expect(manufacturerService.addManufacturer)
            .not.toHaveBeenCalled();
    });

    test("should return 400 when manufacturer name is empty", async () => {

        const response = await authRequest(
            "post",
            "/manufacturers"
        ).send({ name: "   " });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe(
            "Manufacturer name is required."
        );

        expect(manufacturerService.addManufacturer)
            .not.toHaveBeenCalled();
    });

    test("should add manufacturer successfully", async () => {

        // Arrange
        manufacturerService.addManufacturer.mockResolvedValue({
            status: 201,
            success: true,
            message: "Manufacturer added successfully.",
            data: {
                manufacturerId: 1
            }
        });

        // Act
        const response = await authRequest(
            "post",
            "/manufacturers"
        ).send({ name: "Cipla" });

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe(
            "Manufacturer added successfully."
        );
        expect(response.body.data.manufacturerId).toBe(1);

        expect(manufacturerService.addManufacturer)
            .toHaveBeenCalledWith("Cipla");

        expect(manufacturerService.addManufacturer)
            .toHaveBeenCalledTimes(1);
    });
});

// ============================================================
// GET /manufacturers
// ============================================================

describe("GET /manufacturers", () => {

    test("should return 401 when token is missing", async () => {

        const response = await request(app)
            .get("/manufacturers");

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);

        expect(manufacturerService.getAllManufacturers)
            .not.toHaveBeenCalled();
    });

    test("should return 403 when user is not Admin or Pharmacist", async () => {

        const response = await authRequest(
            "get",
            "/manufacturers",
            customerToken
        );

        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);

        expect(manufacturerService.getAllManufacturers)
            .not.toHaveBeenCalled();
    });

    test("should return manufacturers when Admin token is provided", async () => {

        // Arrange
        manufacturerService.getAllManufacturers.mockResolvedValue({
            status: 200,
            success: true,
            message: "Manufacturers retrieved successfully.",
            data: [
                {
                    manufacturer_id: 1,
                    name: "Cipla",
                    is_active: 1
                }
            ]
        });

        // Act
        const response = await authRequest(
            "get",
            "/manufacturers"
        );

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe(
            "Manufacturers retrieved successfully."
        );
        expect(response.body.data[0].name).toBe("Cipla");

        expect(manufacturerService.getAllManufacturers)
            .toHaveBeenCalledTimes(1);
    });

    test("should return manufacturers when Pharmacist token is provided", async () => {

        // Arrange
        manufacturerService.getAllManufacturers.mockResolvedValue({
            status: 200,
            success: true,
            message: "Manufacturers retrieved successfully.",
            data: [
                {
                    manufacturer_id: 1,
                    name: "Cipla",
                    is_active: 1
                }
            ]
        });

        // Act
        const response = await authRequest(
            "get",
            "/manufacturers",
            pharmacistToken
        );

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        expect(manufacturerService.getAllManufacturers)
            .toHaveBeenCalledTimes(1);
    });
});

// ============================================================
// GET /manufacturers/:manufacturerId
// ============================================================

describe("GET /manufacturers/:manufacturerId", () => {

    test("should return 401 when token is missing", async () => {

        const response = await request(app)
            .get("/manufacturers/1");

        expect(response.status).toBe(401);

        expect(manufacturerService.getManufacturerById)
            .not.toHaveBeenCalled();
    });

    test("should return 403 when user is not Admin or Pharmacist", async () => {

        const response = await authRequest(
            "get",
            "/manufacturers/1",
            customerToken
        );

        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);

        expect(manufacturerService.getManufacturerById)
            .not.toHaveBeenCalled();
    });

    test("should return 400 for invalid manufacturer ID", async () => {

        const response = await authRequest(
            "get",
            "/manufacturers/abc"
        );

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe(
            "Invalid manufacturer ID."
        );

        expect(manufacturerService.getManufacturerById)
            .not.toHaveBeenCalled();
    });

    test("should return manufacturer when Admin token is provided", async () => {

        // Arrange
        manufacturerService.getManufacturerById.mockResolvedValue({
            status: 200,
            success: true,
            message: "Manufacturer retrieved successfully.",
            data: {
                manufacturer_id: 1,
                name: "Cipla",
                is_active: 1
            }
        });

        // Act
        const response = await authRequest(
            "get",
            "/manufacturers/1"
        );

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.manufacturer_id).toBe(1);

        expect(manufacturerService.getManufacturerById)
            .toHaveBeenCalledWith(1);
    });

    test("should return manufacturer when Pharmacist token is provided", async () => {

        // Arrange
        manufacturerService.getManufacturerById.mockResolvedValue({
            status: 200,
            success: true,
            message: "Manufacturer retrieved successfully.",
            data: {
                manufacturer_id: 1,
                name: "Cipla",
                is_active: 1
            }
        });

        // Act
        const response = await authRequest(
            "get",
            "/manufacturers/1",
            pharmacistToken
        );

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        expect(manufacturerService.getManufacturerById)
            .toHaveBeenCalledWith(1);
    });
});

// ============================================================
// PUT /manufacturers/:manufacturerId
// ============================================================

describe("PUT /manufacturers/:manufacturerId", () => {

    test("should return 401 when token is missing", async () => {

        const response = await request(app)
            .put("/manufacturers/1")
            .send({ name: "Updated Cipla" });

        expect(response.status).toBe(401);

        expect(manufacturerService.updateManufacturer)
            .not.toHaveBeenCalled();
    });

    test("should return 403 when user is not Admin", async () => {

        const response = await authRequest(
            "put",
            "/manufacturers/1",
            pharmacistToken
        ).send({ name: "Updated Cipla" });

        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);

        expect(manufacturerService.updateManufacturer)
            .not.toHaveBeenCalled();
    });

    test("should return 400 for invalid manufacturer ID", async () => {

        const response = await authRequest(
            "put",
            "/manufacturers/abc"
        ).send({ name: "Updated Cipla" });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe(
            "Invalid manufacturer ID."
        );

        expect(manufacturerService.updateManufacturer)
            .not.toHaveBeenCalled();
    });

    test("should return 400 when manufacturer name is missing", async () => {

        const response = await authRequest(
            "put",
            "/manufacturers/1"
        ).send({});

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe(
            "Manufacturer name is required."
        );

        expect(manufacturerService.updateManufacturer)
            .not.toHaveBeenCalled();
    });

    test("should update manufacturer successfully", async () => {

        // Arrange
        manufacturerService.updateManufacturer.mockResolvedValue({
            status: 200,
            success: true,
            message: "Manufacturer updated successfully."
        });

        // Act
        const response = await authRequest(
            "put",
            "/manufacturers/1"
        ).send({ name: "Updated Cipla" });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe(
            "Manufacturer updated successfully."
        );

        expect(manufacturerService.updateManufacturer)
            .toHaveBeenCalledWith(1, "Updated Cipla");

        expect(manufacturerService.updateManufacturer)
            .toHaveBeenCalledTimes(1);
    });
});

// ============================================================
// PATCH /manufacturers/:manufacturerId/deactivate
// ============================================================

describe("PATCH /manufacturers/:manufacturerId/deactivate", () => {

    test("should return 401 when token is missing", async () => {

        const response = await request(app)
            .patch("/manufacturers/1/deactivate");

        expect(response.status).toBe(401);

        expect(manufacturerService.deactivateManufacturer)
            .not.toHaveBeenCalled();
    });

    test("should return 403 when user is not Admin", async () => {

        const response = await authRequest(
            "patch",
            "/manufacturers/1/deactivate",
            pharmacistToken
        );

        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);

        expect(manufacturerService.deactivateManufacturer)
            .not.toHaveBeenCalled();
    });

    test("should return 400 for invalid manufacturer ID", async () => {

        const response = await authRequest(
            "patch",
            "/manufacturers/abc/deactivate"
        );

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe(
            "Invalid manufacturer ID."
        );

        expect(manufacturerService.deactivateManufacturer)
            .not.toHaveBeenCalled();
    });

    test("should deactivate manufacturer successfully", async () => {

        // Arrange
        manufacturerService.deactivateManufacturer.mockResolvedValue({
            status: 200,
            success: true,
            message: "Manufacturer deactivated successfully."
        });

        // Act
        const response = await authRequest(
            "patch",
            "/manufacturers/1/deactivate"
        );

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe(
            "Manufacturer deactivated successfully."
        );

        expect(manufacturerService.deactivateManufacturer)
            .toHaveBeenCalledWith(1);
    });
});

// ============================================================
// PATCH /manufacturers/:manufacturerId/restore
// ============================================================

describe("PATCH /manufacturers/:manufacturerId/restore", () => {

    test("should return 401 when token is missing", async () => {

        const response = await request(app)
            .patch("/manufacturers/1/restore");

        expect(response.status).toBe(401);

        expect(manufacturerService.restoreManufacturer)
            .not.toHaveBeenCalled();
    });

    test("should return 403 when user is not Admin", async () => {

        const response = await authRequest(
            "patch",
            "/manufacturers/1/restore",
            customerToken
        );

        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);

        expect(manufacturerService.restoreManufacturer)
            .not.toHaveBeenCalled();
    });

    test("should return 400 for invalid manufacturer ID", async () => {

        const response = await authRequest(
            "patch",
            "/manufacturers/abc/restore"
        );

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe(
            "Invalid manufacturer ID."
        );

        expect(manufacturerService.restoreManufacturer)
            .not.toHaveBeenCalled();
    });

    test("should restore manufacturer successfully", async () => {

        // Arrange
        manufacturerService.restoreManufacturer.mockResolvedValue({
            status: 200,
            success: true,
            message: "Manufacturer restored successfully."
        });

        // Act
        const response = await authRequest(
            "patch",
            "/manufacturers/1/restore"
        );

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe(
            "Manufacturer restored successfully."
        );

        expect(manufacturerService.restoreManufacturer)
            .toHaveBeenCalledWith(1);
    });
});
