
// tests/unit testing/sales.service.test.js
// Real service logic, mocked models and database connection.

jest.mock("../../models/sales.model", () => ({
    createSale: jest.fn(),
    getAllSales: jest.fn(),
    getSaleById: jest.fn(),
    searchSales: jest.fn(),
    getSalesByCustomerId: jest.fn(),
    getSaleByIdForCustomer: jest.fn()
}));

jest.mock("../../models/sale_items.model", () => ({
    createSaleItem: jest.fn(),
    getSaleItemsBySaleId: jest.fn()
}));

jest.mock("../../models/batch.model", () => ({
    getBatchById: jest.fn(),
    getBatchByIdForUpdate: jest.fn(),
    updateBatchStock: jest.fn()
}));

jest.mock("../../models/medicine.model", () => ({
    getMedicineById: jest.fn()
}));

jest.mock("../../models/manufacturer.model", () => ({
    getManufacturerById: jest.fn()
}));

jest.mock("../../models/user.model", () => ({
    getUserById: jest.fn()
}));

jest.mock("../../config/db", () => ({
    getConnection: jest.fn()
}));

const salesService = require("../../services/sales.service");
const salesModel = require("../../models/sales.model");
const saleItemModel = require("../../models/sale_items.model");
const batchModel = require("../../models/batch.model");
const medicineModel = require("../../models/medicine.model");
const manufacturerModel = require("../../models/manufacturer.model");
const userModel = require("../../models/user.model");
const db = require("../../config/db");

// ============================================================
// TEST DATA
// ============================================================

const validSale = {
    customer_id: 2,
    pharmacist_id: 1,
    payment_mode: "Cash",
    items: [{ batch_id: 10, quantity: 2 }]
};

const pharmacist = {
    user_id: 1,
    role: "Pharmacist",
    is_active: 1
};

const customer = {
    user_id: 2,
    role: "Customer",
    is_active: 1
};

const batch = {
    batch_id: 10,
    medicine_id: 5,
    selling_price: 50,
    stock_quantity: 100,
    expiry_date: "2099-12-31",
    is_active: 1
};

const medicine = {
    medicine_id: 5,
    manufacturer_id: 3,
    medicine_is_active: 1
};

const manufacturer = {
    manufacturer_id: 3,
    is_active: 1
};

// ============================================================
// MOCK SETUP
// ============================================================

let connection;

beforeEach(() => {
    jest.resetAllMocks();

    connection = {
        beginTransaction: jest.fn().mockResolvedValue(),
        commit: jest.fn().mockResolvedValue(),
        rollback: jest.fn().mockResolvedValue(),
        release: jest.fn()
    };

    db.getConnection.mockResolvedValue(connection);

    userModel.getUserById.mockImplementation(async (id) => {
        if (id === 1) return { ...pharmacist };
        if (id === 2) return { ...customer };
        return null;
    });

    batchModel.getBatchById.mockResolvedValue({ ...batch });
    batchModel.getBatchByIdForUpdate.mockResolvedValue({ ...batch });

    medicineModel.getMedicineById.mockResolvedValue({ ...medicine });

    manufacturerModel.getManufacturerById.mockResolvedValue({
        ...manufacturer
    });

    salesModel.createSale.mockResolvedValue(100);

    saleItemModel.createSaleItem.mockResolvedValue();
    saleItemModel.getSaleItemsBySaleId.mockResolvedValue([]);

    batchModel.updateBatchStock.mockResolvedValue();
});

afterEach(() => {
    jest.restoreAllMocks();
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const expectError = (result, status, message) => {
    expect(result).toMatchObject({
        status,
        success: false,
        message,
        data: null
    });
};

const expectNoTransaction = () => {
    expect(db.getConnection).not.toHaveBeenCalled();
    expect(salesModel.createSale).not.toHaveBeenCalled();
};

const silenceExpectedErrors = () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
};

// ============================================================
// CREATE SALE: INPUT VALIDATIONS
// ============================================================

describe("createSale - initial validations", () => {

    test.each([
        ["Bitcoin", "Invalid payment mode."],
        [undefined, "Invalid payment mode."],
        ["cash", "Invalid payment mode."]
    ])("rejects payment mode %s", async (payment_mode, message) => {

        const result = await salesService.createSale({
            ...validSale,
            payment_mode
        });

        expectError(result, 400, message);
        expectNoTransaction();
    });

    test.each([
        [
            "non-array items",
            "medicine",
            "Items must be an array."
        ],
        [
            "empty items",
            [],
            "At least one medicine must be selected."
        ],
        [
            "negative batch ID",
            [{ batch_id: -1, quantity: 2 }],
            "Invalid batch ID."
        ],
        [
            "string batch ID",
            [{ batch_id: "10", quantity: 2 }],
            "Invalid batch ID."
        ],
        [
            "zero batch ID",
            [{ batch_id: 0, quantity: 2 }],
            "Invalid batch ID."
        ],
        [
            "zero quantity",
            [{ batch_id: 10, quantity: 0 }],
            "Quantity must be greater than zero."
        ],
        [
            "negative quantity",
            [{ batch_id: 10, quantity: -5 }],
            "Quantity must be greater than zero."
        ],
        [
            "decimal quantity",
            [{ batch_id: 10, quantity: 1.5 }],
            "Quantity must be greater than zero."
        ],
        [
            "duplicate batches",
            [
                { batch_id: 10, quantity: 2 },
                { batch_id: 10, quantity: 3 }
            ],
            "Duplicate batch selected."
        ]
    ])("rejects %s", async (_label, items, message) => {

        const result = await salesService.createSale({
            ...validSale,
            items
        });

        expectError(result, 400, message);
        expectNoTransaction();
    });
});

// ============================================================
// CREATE SALE: PHARMACIST AND CUSTOMER VALIDATIONS
// ============================================================

describe("createSale - pharmacist and customer", () => {

    test("returns 404 when pharmacist does not exist", async () => {

        userModel.getUserById.mockResolvedValue(null);

        const result = await salesService.createSale(validSale);

        expectError(result, 404, "Pharmacist not found.");
        expectNoTransaction();
    });

    test("returns 409 when pharmacist is inactive", async () => {

        userModel.getUserById.mockResolvedValue({
            ...pharmacist,
            is_active: 0
        });

        const result = await salesService.createSale(validSale);

        expectError(result, 409, "Pharmacist account is inactive.");
        expectNoTransaction();
    });

    test("returns 409 when seller is not a pharmacist", async () => {

        userModel.getUserById.mockResolvedValue({
            ...pharmacist,
            role: "Admin"
        });

        const result = await salesService.createSale(validSale);

        expectError(result, 409, "Unauthorized user.");
        expectNoTransaction();
    });

    test.each([0, -2, 1.5, "2"])(
        "rejects invalid customer ID %s",
        async (customer_id) => {

            const result = await salesService.createSale({
                ...validSale,
                customer_id
            });

            expectError(result, 400, "Invalid customer ID.");
            expectNoTransaction();
        }
    );

    test("returns 404 when customer is not found", async () => {

        userModel.getUserById.mockImplementation(async (id) =>
            id === 1 ? { ...pharmacist } : null
        );

        const result = await salesService.createSale(validSale);

        expectError(result, 404, "Customer not found.");
        expectNoTransaction();
    });

    test("returns 409 when selected account is not a customer", async () => {

        userModel.getUserById.mockImplementation(async (id) =>
            id === 1
                ? { ...pharmacist }
                : { ...customer, role: "Admin" }
        );

        const result = await salesService.createSale(validSale);

        expectError(
            result,
            409,
            "The selected account is not a customer."
        );

        expectNoTransaction();
    });

    test("keeps customer ID when customer is inactive", async () => {

        userModel.getUserById.mockImplementation(async (id) =>
            id === 1
                ? { ...pharmacist }
                : { ...customer, is_active: 0 }
        );

        const result = await salesService.createSale(validSale);

        expect(result.status).toBe(201);

        expect(salesModel.createSale).toHaveBeenCalledWith(
            connection,
            expect.objectContaining({
                customer_id: 2
            })
        );
    });

    test.each([
        ["null", null],
        ["omitted", undefined]
    ])(
        "supports walk-in sale with %s customer ID",
        async (_label, customer_id) => {

            const result = await salesService.createSale({
                ...validSale,
                customer_id
            });

            expect(result.status).toBe(201);

            expect(salesModel.createSale).toHaveBeenCalledWith(
                connection,
                expect.objectContaining({
                    customer_id: null
                })
            );

            expect(userModel.getUserById).toHaveBeenCalledTimes(1);
        }
    );
});

// ============================================================
// CREATE SALE: INVENTORY VALIDATION
// ============================================================

describe("createSale - inventory validation", () => {

    test("returns 404 for missing batch", async () => {

        batchModel.getBatchById.mockResolvedValue(null);

        const result = await salesService.createSale(validSale);

        expectError(result, 404, "Batch not found.");
        expectNoTransaction();
    });

    test("returns 409 for inactive batch", async () => {

        batchModel.getBatchById.mockResolvedValue({
            ...batch,
            is_active: 0
        });

        const result = await salesService.createSale(validSale);

        expectError(result, 409, "Batch is inactive.");
        expectNoTransaction();
    });

    test("returns 409 for expired batch", async () => {

        batchModel.getBatchById.mockResolvedValue({
            ...batch,
            expiry_date: "2020-01-01"
        });

        const result = await salesService.createSale(validSale);

        expectError(result, 409, "Batch has expired.");
        expectNoTransaction();
    });

    test("returns 400 for insufficient stock before transaction", async () => {

        batchModel.getBatchById.mockResolvedValue({
            ...batch,
            stock_quantity: 1
        });

        const result = await salesService.createSale(validSale);

        expectError(result, 400, "Insufficient stock.");
        expectNoTransaction();
    });

    test("returns 404 for missing medicine", async () => {

        medicineModel.getMedicineById.mockResolvedValue(null);

        const result = await salesService.createSale(validSale);

        expectError(result, 404, "Medicine not found.");
        expectNoTransaction();
    });

    test("returns 409 for inactive medicine", async () => {

        medicineModel.getMedicineById.mockResolvedValue({
            ...medicine,
            medicine_is_active: 0
        });

        const result = await salesService.createSale(validSale);

        expectError(result, 409, "Medicine is inactive.");
        expectNoTransaction();
    });

    test("returns 404 for missing manufacturer", async () => {

        manufacturerModel.getManufacturerById.mockResolvedValue(null);

        const result = await salesService.createSale(validSale);

        expectError(result, 404, "Manufacturer not found.");
        expectNoTransaction();
    });

    test("returns 409 for inactive manufacturer", async () => {

        manufacturerModel.getManufacturerById.mockResolvedValue({
            ...manufacturer,
            is_active: 0
        });

        const result = await salesService.createSale(validSale);

        expectError(result, 409, "Manufacturer is inactive.");
        expectNoTransaction();
    });
});

// ============================================================
// CREATE SALE: SUCCESSFUL TRANSACTION
// ============================================================

describe("createSale - successful transaction", () => {

    test("creates sale, saves items, reduces stock, commits and releases", async () => {

        const result = await salesService.createSale(validSale);

        expect(result).toEqual({
            status: 201,
            success: true,
            message: "Sale completed successfully.",
            data: {
                sale_id: 100,
                total_amount: 100
            }
        });

        expect(db.getConnection).toHaveBeenCalledTimes(1);

        expect(connection.beginTransaction).toHaveBeenCalledTimes(1);

        expect(batchModel.getBatchByIdForUpdate)
            .toHaveBeenCalledWith(connection, 10);

        expect(salesModel.createSale).toHaveBeenCalledWith(
            connection,
            {
                customer_id: 2,
                pharmacist_id: 1,
                payment_mode: "Cash",
                total_amount: 100
            }
        );

        expect(saleItemModel.createSaleItem).toHaveBeenCalledWith(
            connection,
            {
                sale_id: 100,
                medicine_id: 5,
                batch_id: 10,
                quantity: 2,
                selling_price: 50,
                subtotal: 100
            }
        );

        expect(batchModel.updateBatchStock).toHaveBeenCalledWith(
            connection,
            10,
            -2
        );

        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.rollback).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalledTimes(1);
    });

    test("calculates multiple items and locks batches in ascending ID order", async () => {

        const sale = {
            ...validSale,
            items: [
                { batch_id: 20, quantity: 3 },
                { batch_id: 10, quantity: 2 }
            ]
        };

        const getMockBatch = async (id) => ({
            ...batch,
            batch_id: id,
            selling_price: id === 10 ? 50 : 30
        });

        batchModel.getBatchById.mockImplementation(getMockBatch);

        batchModel.getBatchByIdForUpdate.mockImplementation(
            async (_connection, id) => getMockBatch(id)
        );

        const result = await salesService.createSale(sale);

        expect(result.status).toBe(201);
        expect(result.data.total_amount).toBe(190);

        expect(
            batchModel.getBatchByIdForUpdate.mock.calls.map(
                (args) => args[1]
            )
        ).toEqual([10, 20]);

        expect(saleItemModel.createSaleItem).toHaveBeenCalledTimes(2);
        expect(batchModel.updateBatchStock).toHaveBeenCalledTimes(2);

        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.release).toHaveBeenCalledTimes(1);
    });
});

// ============================================================
// CREATE SALE: LOCKED INVENTORY RECHECKS
// ============================================================

describe("createSale - locked inventory rechecks", () => {

    test("rolls back when stock decreases after pre-check", async () => {

        batchModel.getBatchByIdForUpdate.mockResolvedValue({
            ...batch,
            stock_quantity: 1
        });

        const result = await salesService.createSale(validSale);

        expectError(result, 409, "Insufficient stock.");

        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalledTimes(1);

        expect(salesModel.createSale).not.toHaveBeenCalled();
    });

    test("rolls back when batch becomes inactive after locking", async () => {

        batchModel.getBatchByIdForUpdate.mockResolvedValue({
            ...batch,
            is_active: 0
        });

        const result = await salesService.createSale(validSale);

        expectError(result, 409, "Batch is inactive.");

        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalledTimes(1);
    });

    test("rolls back when medicine becomes inactive after pre-check", async () => {

        medicineModel.getMedicineById
            .mockResolvedValueOnce({ ...medicine })
            .mockResolvedValueOnce({
                ...medicine,
                medicine_is_active: 0
            });

        const result = await salesService.createSale(validSale);

        expectError(result, 409, "Medicine is inactive.");

        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalledTimes(1);
    });

    test("rolls back when manufacturer becomes inactive after pre-check", async () => {

        manufacturerModel.getManufacturerById
            .mockResolvedValueOnce({ ...manufacturer })
            .mockResolvedValueOnce({
                ...manufacturer,
                is_active: 0
            });

        const result = await salesService.createSale(validSale);

        expectError(result, 409, "Manufacturer is inactive.");

        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalledTimes(1);
    });

    test("rolls back when batch expires at locking time", async () => {

        batchModel.getBatchByIdForUpdate.mockResolvedValue({
            ...batch,
            expiry_date: "2020-01-01"
        });

        const result = await salesService.createSale(validSale);

        expectError(result, 409, "Batch has expired.");

        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalledTimes(1);
    });

    test("returns 500 and rolls back when locked batch is missing", async () => {

        batchModel.getBatchByIdForUpdate.mockResolvedValue(null);

        silenceExpectedErrors();

        const result = await salesService.createSale(validSale);

        expectError(
            result,
            500,
            "An error occurred while processing the sale."
        );

        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalledTimes(1);
    });
});

// ============================================================
// CREATE SALE: DATABASE TRANSACTION FAILURES
// ============================================================

describe("createSale - transaction failures", () => {

    test.each([
        [
            "sale creation",
            () => salesModel.createSale.mockRejectedValue(
                new Error("Insert failed")
            )
        ],
        [
            "item insertion",
            () => saleItemModel.createSaleItem.mockRejectedValue(
                new Error("Item insert failed")
            )
        ],
        [
            "stock update",
            () => batchModel.updateBatchStock.mockRejectedValue(
                new Error("Stock update failed")
            )
        ],
        [
            "commit",
            () => connection.commit.mockRejectedValue(
                new Error("Commit failed")
            )
        ]
    ])(
        "returns 500 and rolls back when %s fails",
        async (_label, arrange) => {

            arrange();
            silenceExpectedErrors();

            const result = await salesService.createSale(validSale);

            expectError(
                result,
                500,
                "An error occurred while processing the sale."
            );

            expect(connection.rollback).toHaveBeenCalledTimes(1);
            expect(connection.release).toHaveBeenCalledTimes(1);
        }
    );

    test("returns 500 when database connection cannot be acquired", async () => {

        db.getConnection.mockRejectedValue(
            new Error("Connection failed")
        );

        silenceExpectedErrors();

        const result = await salesService.createSale(validSale);

        expectError(
            result,
            500,
            "An error occurred while processing the sale."
        );

        expect(connection.beginTransaction).not.toHaveBeenCalled();
        expect(connection.rollback).not.toHaveBeenCalled();
        expect(connection.release).not.toHaveBeenCalled();
    });

    test("rolls back and releases when beginTransaction fails", async () => {

        connection.beginTransaction.mockRejectedValue(
            new Error("Begin failed")
        );

        silenceExpectedErrors();

        const result = await salesService.createSale(validSale);

        expectError(
            result,
            500,
            "An error occurred while processing the sale."
        );

        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.release).toHaveBeenCalledTimes(1);
    });
});

// ============================================================
// ADMIN: GET ALL SALES
// ============================================================

describe("getAllSales", () => {

    test("returns 404 for empty sales history", async () => {

        salesModel.getAllSales.mockResolvedValue([]);

        const result = await salesService.getAllSales();

        expectError(result, 404, "No sales found.");

        expect(salesModel.getAllSales).toHaveBeenCalledTimes(1);
    });

    test("returns 200 with sales history", async () => {

        const sales = [
            { sale_id: 1 },
            { sale_id: 2 }
        ];

        salesModel.getAllSales.mockResolvedValue(sales);

        const result = await salesService.getAllSales();

        expect(result).toMatchObject({
            status: 200,
            success: true,
            message: "Sales retrieved successfully.",
            data: sales
        });
    });
});

// ============================================================
// ADMIN: GET SALE BY ID
// ============================================================

describe("getSaleById", () => {

    test("returns 404 when sale does not exist", async () => {

        salesModel.getSaleById.mockResolvedValue(null);

        const result = await salesService.getSaleById(999);

        expectError(result, 404, "Sale not found.");

        expect(salesModel.getSaleById).toHaveBeenCalledWith(999);

        expect(saleItemModel.getSaleItemsBySaleId)
            .not.toHaveBeenCalled();
    });

    test("returns sale together with sale items", async () => {

        const sale = {
            sale_id: 10,
            total_amount: 500,
            payment_mode: "UPI"
        };

        const items = [
            { sale_id: 10, batch_id: 10, quantity: 2 }
        ];

        salesModel.getSaleById.mockResolvedValue(sale);

        saleItemModel.getSaleItemsBySaleId.mockResolvedValue(items);

        const result = await salesService.getSaleById(10);

        expect(result).toEqual({
            status: 200,
            success: true,
            message: "Sale retrieved successfully.",
            data: {
                ...sale,
                items
            }
        });

        expect(saleItemModel.getSaleItemsBySaleId)
            .toHaveBeenCalledWith(10);
    });
});

// ============================================================
// ADMIN: SEARCH SALES
// ============================================================

describe("searchSales", () => {

    test("returns 404 for no matching sales", async () => {

        salesModel.searchSales.mockResolvedValue([]);

        const result = await salesService.searchSales("unknown");

        expectError(result, 404, "No matching sales found.");

        expect(salesModel.searchSales)
            .toHaveBeenCalledWith("unknown");
    });

    test("returns 200 for matching sales", async () => {

        const sales = [
            { sale_id: 10, customer_name: "Rahul" }
        ];

        salesModel.searchSales.mockResolvedValue(sales);

        const result = await salesService.searchSales("Rahul");

        expect(result).toMatchObject({
            status: 200,
            success: true,
            message: "Sales retrieved successfully.",
            data: sales
        });

        expect(salesModel.searchSales)
            .toHaveBeenCalledWith("Rahul");
    });
});

// ============================================================
// CUSTOMER: OWN PURCHASE HISTORY
// ============================================================

describe("getMyPurchases", () => {

    test.each([0, -2, 1.5, "2", null])(
        "rejects invalid customer ID %s",
        async (customerId) => {

            const result = await salesService.getMyPurchases(customerId);

            expectError(result, 400, "Invalid customer ID.");

            expect(salesModel.getSalesByCustomerId)
                .not.toHaveBeenCalled();
        }
    );

    test("returns 200 with empty purchase history", async () => {

        salesModel.getSalesByCustomerId.mockResolvedValue([]);

        const result = await salesService.getMyPurchases(2);

        expect(result).toEqual({
            status: 200,
            success: true,
            message: "Purchases retrieved successfully.",
            data: []
        });

        expect(salesModel.getSalesByCustomerId)
            .toHaveBeenCalledWith(2);
    });

    test("returns only model purchases for this customer", async () => {

        const purchases = [
            { sale_id: 10, customer_id: 2 },
            { sale_id: 11, customer_id: 2 }
        ];

        salesModel.getSalesByCustomerId.mockResolvedValue(purchases);

        const result = await salesService.getMyPurchases(2);

        expect(result.status).toBe(200);
        expect(result.data).toEqual(purchases);

        expect(salesModel.getSalesByCustomerId)
            .toHaveBeenCalledWith(2);

        expect(salesModel.getAllSales).not.toHaveBeenCalled();
    });
});

// ============================================================
// CUSTOMER: OWN PURCHASE DETAILS AND OWNERSHIP
// ============================================================

describe("getMyPurchaseById", () => {

    test.each([0, -1, 1.5, "2", null])(
        "rejects invalid customer ID %s",
        async (customerId) => {

            const result = await salesService.getMyPurchaseById(
                customerId,
                10
            );

            expectError(result, 400, "Invalid customer ID.");

            expect(salesModel.getSaleByIdForCustomer)
                .not.toHaveBeenCalled();
        }
    );

    test.each([0, -1, 1.5, "10", NaN])(
        "rejects invalid sale ID %s",
        async (saleId) => {

            const result = await salesService.getMyPurchaseById(
                2,
                saleId
            );

            expectError(result, 400, "Invalid sale ID.");

            expect(salesModel.getSaleByIdForCustomer)
                .not.toHaveBeenCalled();
        }
    );

    test("returns same 404 for nonexistent or unowned purchase", async () => {

        salesModel.getSaleByIdForCustomer.mockResolvedValue(null);

        const result = await salesService.getMyPurchaseById(2, 999);

        expectError(result, 404, "Purchase not found.");

        expect(salesModel.getSaleByIdForCustomer)
            .toHaveBeenCalledWith(999, 2);

        expect(saleItemModel.getSaleItemsBySaleId)
            .not.toHaveBeenCalled();
    });

    test("returns owned purchase details and items", async () => {

        const sale = {
            sale_id: 10,
            customer_id: 2,
            total_amount: 100
        };

        const items = [
            {
                sale_id: 10,
                batch_id: 10,
                quantity: 2
            }
        ];

        salesModel.getSaleByIdForCustomer.mockResolvedValue(sale);

        saleItemModel.getSaleItemsBySaleId.mockResolvedValue(items);

        const result = await salesService.getMyPurchaseById(2, 10);

        expect(result).toEqual({
            status: 200,
            success: true,
            message: "Purchase retrieved successfully.",
            data: {
                ...sale,
                items
            }
        });

        expect(salesModel.getSaleByIdForCustomer)
            .toHaveBeenCalledWith(10, 2);

        expect(saleItemModel.getSaleItemsBySaleId)
            .toHaveBeenCalledWith(10);

        expect(salesModel.getSaleById).not.toHaveBeenCalled();
    });
});
