
require("dotenv").config();

const request = require("supertest");
const jwt = require("jsonwebtoken");

// Mock authentication model and batch service
jest.mock("../../models/user.model", () => ({
    getUserAuthById: jest.fn()
}));

jest.mock("../../services/batch.service");

const app = require("../../app");
const userModel = require("../../models/user.model");
const batchService = require("../../services/batch.service");

// =====================================================
// MOCK USER ACCOUNTS
// =====================================================

const accounts = [
    {
        user_id: 1,
        email: "admin@example.com",
        role: "Admin",
        is_active: 1,
        token_version: 0
    },
    {
        user_id: 2,
        email: "pharmacist@example.com",
        role: "Pharmacist",
        is_active: 1,
        token_version: 0
    },
    {
        user_id: 3,
        email: "customer@example.com",
        role: "Customer",
        is_active: 1,
        token_version: 0
    }
];

// =====================================================
// JWT TOKENS
// =====================================================

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

const tokens = {
    Admin: signAccountToken(accounts[0]),
    Pharmacist: signAccountToken(accounts[1]),
    Customer: signAccountToken(accounts[2])
};

// =====================================================
// TEST DATA
// =====================================================

const validBatch = {
    medicine_id: 1,
    batch_number: "B001",
    purchase_price: 50,
    selling_price: 60,
    stock_quantity: 100,
    expiry_date: "2099-12-31"
};

// PUT updates only these four fields
const validUpdate = {
    batch_number: "B002",
    purchase_price: 55,
    selling_price: 70,
    expiry_date: "2099-12-31"
};

// =====================================================
// HELPERS
// =====================================================

const authRequest = (method, path, role = "Admin") =>
    request(app)[method](path).set(
        "Authorization",
        `Bearer ${tokens[role]}`
    );

const mockSuccess = (
    serviceName,
    message,
    data = null,
    status = 200
) => {
    batchService[serviceName].mockResolvedValue({
        status,
        success: true,
        message,
        data
    });
};

const expectError = (response, status, message) => {
    expect(response.status).toBe(status);
    expect(response.body).toEqual({
        status,
        success: false,
        message,
        data: null
    });
};

// =====================================================
// RESET MOCKS BEFORE EACH TEST
// =====================================================

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

// =====================================================
// POST /batches
// =====================================================

describe("POST /batches", () => {

    const endpoint = "/batches";

    const requiredFields = [
        "medicine_id",
        "batch_number",
        "purchase_price",
        "selling_price",
        "stock_quantity",
        "expiry_date"
    ];

    test.each(requiredFields)(
        "should return 400 when %s is missing",
        async (field) => {

            // Arrange
            const batch = { ...validBatch };
            delete batch[field];

            // Act
            const response = await authRequest(
                "post",
                endpoint
            ).send(batch);

            // Assert
            expectError(
                response,
                400,
                `Creation failed. Missing required fields: ${field}`
            );

            expect(batchService.createBatch)
                .not.toHaveBeenCalled();
        }
    );

    test("should reject empty batch number", async () => {

        const response = await authRequest(
            "post",
            endpoint
        ).send({
            ...validBatch,
            batch_number: "   "
        });

        expectError(
            response,
            400,
            "Creation failed. Missing required fields: batch_number"
        );

        expect(batchService.createBatch)
            .not.toHaveBeenCalled();
    });

    test("should reject multiple missing fields", async () => {

        const response = await authRequest(
            "post",
            endpoint
        ).send({});

        expectError(
            response,
            400,
            "Creation failed. Missing required fields: medicine_id, batch_number, purchase_price, selling_price, stock_quantity, expiry_date"
        );

        expect(batchService.createBatch)
            .not.toHaveBeenCalled();
    });

    test("Admin should create batch successfully", async () => {

        // Arrange
        mockSuccess(
            "createBatch",
            "Batch created successfully.",
            null,
            201
        );

        // Act
        const response = await authRequest(
            "post",
            endpoint
        ).send(validBatch);

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe(
            "Batch created successfully."
        );

        expect(batchService.createBatch)
            .toHaveBeenCalledWith(validBatch);

        expect(batchService.createBatch)
            .toHaveBeenCalledTimes(1);
    });
});

// =====================================================
// GET /batches/inventory
// =====================================================

describe("GET /batches/inventory", () => {

    test.each(["Admin", "Pharmacist"])(
        "%s should retrieve inventory successfully",
        async (role) => {

            // Arrange
            const inventory = [
                {
                    medicine_id: 1,
                    available_stock: 100
                }
            ];

            mockSuccess(
                "getInventory",
                "Inventory retrieved successfully.",
                inventory
            );

            // Act
            const response = await authRequest(
                "get",
                "/batches/inventory",
                role
            );

            // Assert
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toEqual(inventory);

            expect(batchService.getInventory)
                .toHaveBeenCalledTimes(1);
        }
    );

    test("should forward service 404 response", async () => {

        batchService.getInventory.mockResolvedValue({
            status: 404,
            success: false,
            message: "No inventory found.",
            data: null
        });

        const response = await authRequest(
            "get",
            "/batches/inventory"
        );

        expectError(
            response,
            404,
            "No inventory found."
        );
    });
});

// =====================================================
// GET /batches/low-stock
// =====================================================

describe("GET /batches/low-stock", () => {

    test.each(["Admin", "Pharmacist"])(
        "%s should retrieve low stock medicines",
        async (role) => {

            // Arrange
            mockSuccess(
                "getLowStockMedicines",
                "Low stock medicines retrieved successfully.",
                [
                    {
                        medicine_id: 1,
                        available_stock: 5
                    }
                ]
            );

            // Act
            const response = await authRequest(
                "get",
                "/batches/low-stock",
                role
            );

            // Assert
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe(
                "Low stock medicines retrieved successfully."
            );

            expect(batchService.getLowStockMedicines)
                .toHaveBeenCalledTimes(1);
        }
    );
});

// =====================================================
// GET /batches/search
// =====================================================

describe("GET /batches/search", () => {

    test("should reject missing search parameter", async () => {

        const response = await authRequest(
            "get",
            "/batches/search"
        );

        expectError(
            response,
            400,
            "Search failed. The 'search' query parameter is required."
        );

        expect(batchService.searchInventory)
            .not.toHaveBeenCalled();
    });

    test("should reject empty search parameter", async () => {

        const response = await authRequest(
            "get",
            "/batches/search?search=%20%20%20"
        );

        expectError(
            response,
            400,
            "Search failed. The 'search' query parameter is required."
        );

        expect(batchService.searchInventory)
            .not.toHaveBeenCalled();
    });

    test.each(["Admin", "Pharmacist"])(
        "%s should search inventory successfully",
        async (role) => {

            // Arrange
            mockSuccess(
                "searchInventory",
                "Inventory retrieved successfully.",
                []
            );

            // Act
            const response = await authRequest(
                "get",
                "/batches/search?search=%20Paracetamol%20",
                role
            );

            // Assert
            expect(response.status).toBe(200);

            expect(batchService.searchInventory)
                .toHaveBeenCalledWith("Paracetamol");
        }
    );

    test("should forward not found response", async () => {

        batchService.searchInventory.mockResolvedValue({
            status: 404,
            success: false,
            message: "No inventory found matching the search.",
            data: null
        });

        const response = await authRequest(
            "get",
            "/batches/search?search=unknown"
        );

        expectError(
            response,
            404,
            "No inventory found matching the search."
        );
    });
});

// =====================================================
// GET /batches/medicine/:medicineId
// =====================================================

describe("GET /batches/medicine/:medicineId", () => {

    test.each(["Admin", "Pharmacist"])(
        "%s should retrieve batches by medicine ID",
        async (role) => {

            // Arrange
            mockSuccess(
                "getBatchByMedicineId",
                "Batches retrieved successfully.",
                [{ batch_id: 10, medicine_id: 1 }]
            );

            // Act
            const response = await authRequest(
                "get",
                "/batches/medicine/1",
                role
            );

            // Assert
            expect(response.status).toBe(200);

            expect(batchService.getBatchByMedicineId)
                .toHaveBeenCalledWith("1");
        }
    );
});

// =====================================================
// GET /batches/:batchId
// =====================================================

describe("GET /batches/:batchId", () => {

    test.each(["Admin", "Pharmacist"])(
        "%s should retrieve batch by ID",
        async (role) => {

            // Arrange
            const batch = {
                batch_id: 10,
                batch_number: "B001"
            };

            mockSuccess(
                "getBatchById",
                "Batch retrieved successfully.",
                batch
            );

            // Act
            const response = await authRequest(
                "get",
                "/batches/10",
                role
            );

            // Assert
            expect(response.status).toBe(200);
            expect(response.body.data).toEqual(batch);

            expect(batchService.getBatchById)
                .toHaveBeenCalledWith("10");
        }
    );
});

// =====================================================
// PUT /batches/:batchId
// ONLY FOUR REQUIRED FIELDS
// =====================================================

describe("PUT /batches/:batchId", () => {

    const endpoint = "/batches/1";

    const requiredUpdateFields = [
        "batch_number",
        "purchase_price",
        "selling_price",
        "expiry_date"
    ];

    test.each(requiredUpdateFields)(
        "should return 400 when %s is missing",
        async (field) => {

            // Arrange
            const batch = { ...validUpdate };
            delete batch[field];

            // Act
            const response = await authRequest(
                "put",
                endpoint
            ).send(batch);

            // Assert
            expectError(
                response,
                400,
                `Update failed. Missing required fields: ${field}`
            );

            expect(batchService.updateBatch)
                .not.toHaveBeenCalled();
        }
    );

    test("should reject empty batch number", async () => {

        const response = await authRequest(
            "put",
            endpoint
        ).send({
            ...validUpdate,
            batch_number: "   "
        });

        expectError(
            response,
            400,
            "Update failed. Missing required fields: batch_number"
        );

        expect(batchService.updateBatch)
            .not.toHaveBeenCalled();
    });

    test("should reject multiple missing fields", async () => {

        // Act
        const response = await authRequest(
            "put",
            endpoint
        ).send({});

        // Assert
        expectError(
            response,
            400,
            "Update failed. Missing required fields: batch_number, purchase_price, selling_price, expiry_date"
        );

        expect(batchService.updateBatch)
            .not.toHaveBeenCalled();
    });

    test("should allow update without medicine_id and stock_quantity", async () => {

        // Arrange
        mockSuccess(
            "updateBatch",
            "Batch updated successfully."
        );

        // Act
        const response = await authRequest(
            "put",
            endpoint
        ).send(validUpdate);

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe(
            "Batch updated successfully."
        );

        expect(batchService.updateBatch)
            .toHaveBeenCalledWith("1", validUpdate);

        expect(batchService.updateBatch)
            .toHaveBeenCalledTimes(1);
    });

    test("should forward service error response", async () => {

        // Arrange
        batchService.updateBatch.mockResolvedValue({
            status: 404,
            success: false,
            message: "Batch not found.",
            data: null
        });

        // Act
        const response = await authRequest(
            "put",
            endpoint
        ).send(validUpdate);

        // Assert
        expectError(
            response,
            404,
            "Batch not found."
        );

        expect(batchService.updateBatch)
            .toHaveBeenCalledWith("1", validUpdate);
    });
});

// =====================================================
// PATCH /batches/:batchId/stock
// =====================================================

describe("PATCH /batches/:batchId/stock", () => {

    const endpoint = "/batches/1/stock";

    test("should return 400 when quantity is missing", async () => {

        const response = await authRequest(
            "patch",
            endpoint
        ).send({});

        expectError(
            response,
            400,
            "Quantity is required."
        );

        expect(batchService.updateBatchStock)
            .not.toHaveBeenCalled();
    });

    test.each([
        [20, "increase"],
        [-5, "decrease"],
        [0, "zero adjustment"]
    ])(
        "should process %s quantity (%s)",
        async (quantity) => {

            // Arrange
            mockSuccess(
                "updateBatchStock",
                "Batch stock updated successfully."
            );

            // Act
            const response = await authRequest(
                "patch",
                endpoint
            ).send({ quantity });

            // Assert
            expect(response.status).toBe(200);
            expect(response.body.message).toBe(
                "Batch stock updated successfully."
            );

            expect(batchService.updateBatchStock)
                .toHaveBeenCalledWith("1", quantity);
        }
    );

    test("should forward insufficient stock error", async () => {

        // Arrange
        batchService.updateBatchStock.mockResolvedValue({
            status: 400,
            success: false,
            message: "Insufficient stock.",
            data: null
        });

        // Act
        const response = await authRequest(
            "patch",
            endpoint
        ).send({
            quantity: -200
        });

        // Assert
        expectError(
            response,
            400,
            "Insufficient stock."
        );
    });
});

// =====================================================
// PATCH /batches/:batchId/deactivate
// =====================================================

describe("PATCH /batches/:batchId/deactivate", () => {

    test("Admin should deactivate batch successfully", async () => {

        // Arrange
        mockSuccess(
            "deactivateBatch",
            "Batch deactivated successfully."
        );

        // Act
        const response = await authRequest(
            "patch",
            "/batches/1/deactivate"
        );

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.message).toBe(
            "Batch deactivated successfully."
        );

        expect(batchService.deactivateBatch)
            .toHaveBeenCalledWith("1");
    });

    test("should forward already inactive error", async () => {

        batchService.deactivateBatch.mockResolvedValue({
            status: 400,
            success: false,
            message: "Batch is already inactive.",
            data: null
        });

        const response = await authRequest(
            "patch",
            "/batches/1/deactivate"
        );

        expectError(
            response,
            400,
            "Batch is already inactive."
        );
    });
});

// =====================================================
// PATCH /batches/:batchId/restore
// =====================================================

describe("PATCH /batches/:batchId/restore", () => {

    test("Admin should restore batch successfully", async () => {

        // Arrange
        mockSuccess(
            "restoreBatch",
            "Batch restored successfully."
        );

        // Act
        const response = await authRequest(
            "patch",
            "/batches/1/restore"
        );

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.message).toBe(
            "Batch restored successfully."
        );

        expect(batchService.restoreBatch)
            .toHaveBeenCalledWith("1");
    });

    test("should forward already active error", async () => {

        batchService.restoreBatch.mockResolvedValue({
            status: 400,
            success: false,
            message: "Batch is already active.",
            data: null
        });

        const response = await authRequest(
            "patch",
            "/batches/1/restore"
        );

        expectError(
            response,
            400,
            "Batch is already active."
        );
    });
});

// =====================================================
// AUTHENTICATION AND AUTHORIZATION
// ALL 10 ENDPOINTS
// =====================================================

describe("Batch Route Security", () => {

    const endpoints = [
        {
            method: "post",
            path: "/batches",
            service: "createBatch",
            forbiddenRole: "Pharmacist",
            body: validBatch
        },
        {
            method: "get",
            path: "/batches/inventory",
            service: "getInventory",
            forbiddenRole: "Customer"
        },
        {
            method: "get",
            path: "/batches/low-stock",
            service: "getLowStockMedicines",
            forbiddenRole: "Customer"
        },
        {
            method: "get",
            path: "/batches/search?search=test",
            service: "searchInventory",
            forbiddenRole: "Customer"
        },
        {
            method: "get",
            path: "/batches/medicine/1",
            service: "getBatchByMedicineId",
            forbiddenRole: "Customer"
        },
        {
            method: "get",
            path: "/batches/1",
            service: "getBatchById",
            forbiddenRole: "Customer"
        },
        {
            method: "put",
            path: "/batches/1",
            service: "updateBatch",
            forbiddenRole: "Pharmacist",
            body: validUpdate
        },
        {
            method: "patch",
            path: "/batches/1/stock",
            service: "updateBatchStock",
            forbiddenRole: "Pharmacist",
            body: { quantity: 10 }
        },
        {
            method: "patch",
            path: "/batches/1/deactivate",
            service: "deactivateBatch",
            forbiddenRole: "Pharmacist"
        },
        {
            method: "patch",
            path: "/batches/1/restore",
            service: "restoreBatch",
            forbiddenRole: "Pharmacist"
        }
    ];

    // -------------------------------------------------
    // NO TOKEN
    // -------------------------------------------------

    test.each(endpoints)(
        "$method $path should return 401 without token",
        async ({ method, path, service, body }) => {

            let req = request(app)[method](path);

            if (body) {
                req = req.send(body);
            }

            const response = await req;

            expectError(
                response,
                401,
                "Access token is required."
            );

            expect(batchService[service])
                .not.toHaveBeenCalled();
        }
    );

    // -------------------------------------------------
    // INVALID TOKEN
    // -------------------------------------------------

    test.each(endpoints)(
        "$method $path should reject invalid token",
        async ({ method, path, service, body }) => {

            let req = request(app)[method](path)
                .set(
                    "Authorization",
                    "Bearer invalid-token"
                );

            if (body) {
                req = req.send(body);
            }

            const response = await req;

            expectError(
                response,
                401,
                "Invalid or expired token."
            );

            expect(batchService[service])
                .not.toHaveBeenCalled();
        }
    );

    // -------------------------------------------------
    // FORBIDDEN ROLE
    // -------------------------------------------------

    test.each(endpoints)(
        "$method $path should return 403 for $forbiddenRole",
        async ({ method, path, service, forbiddenRole, body }) => {

            let req = authRequest(
                method,
                path,
                forbiddenRole
            );

            if (body) {
                req = req.send(body);
            }

            const response = await req;

            expectError(
                response,
                403,
                "You are not authorized to access this resource."
            );

            expect(batchService[service])
                .not.toHaveBeenCalled();
        }
    );
});
