
require("dotenv").config();

const request = require("supertest");
const jwt = require("jsonwebtoken");

// Mock authentication database lookup and sales business logic.
jest.mock("../../models/user.model", () => ({
    getUserAuthById: jest.fn()
}));

jest.mock("../../services/sales.service");

const app = require("../../app");
const userModel = require("../../models/user.model");
const salesService = require("../../services/sales.service");

// ============================================================
// TEST USERS AND JWT TOKENS
// ============================================================

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

function signAccountToken(account) {
    return jwt.sign(
        {
            userId: account.user_id,
            email: account.email,
            role: account.role,
            token_version: account.token_version
        },
        process.env.JWT_SECRET,
        { algorithm: "HS256", expiresIn: "1h" }
    );
}

const tokens = {
    Admin: signAccountToken(accounts[0]),
    Pharmacist: signAccountToken(accounts[1]),
    Customer: signAccountToken(accounts[2])
};

const validSale = {
    customer_id: 3,
    payment_mode: "Cash",
    items: [{ batch_id: 10, quantity: 2 }]
};

// ============================================================
// RESET MOCKS
// ============================================================

beforeEach(() => {
    jest.resetAllMocks();

    userModel.getUserAuthById.mockImplementation(async (userId) =>
        accounts.find(account => account.user_id === userId) ?? null
    );
});

const authRequest = (method, path, role) =>
    request(app)[method](path)
        .set("Authorization", `Bearer ${tokens[role]}`);

// ============================================================
// POST /sales - CREATE SALE
// ============================================================

describe("POST /sales - Create Sale", () => {

    test("should return 401 when token is missing", async () => {
        const response = await request(app)
            .post("/sales")
            .send(validSale);

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Access token is required.");
        expect(salesService.createSale).not.toHaveBeenCalled();
    });

    test("should return 401 when token is invalid", async () => {
        const response = await request(app)
            .post("/sales")
            .set("Authorization", "Bearer invalid-token")
            .send(validSale);

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Invalid or expired token.");
        expect(salesService.createSale).not.toHaveBeenCalled();
    });

    test.each(["Admin", "Customer"])(
        "should return 403 when %s tries to create sale",
        async (role) => {
            const response = await authRequest("post", "/sales", role)
                .send(validSale);

            expect(response.status).toBe(403);
            expect(response.body.message).toBe(
                "You are not authorized to access this resource."
            );
            expect(salesService.createSale).not.toHaveBeenCalled();
        }
    );

    test("should create sale successfully for Pharmacist", async () => {
        salesService.createSale.mockResolvedValue({
            status: 201,
            success: true,
            message: "Sale completed successfully.",
            data: { sale_id: 100, total_amount: 100 }
        });

        const response = await authRequest("post", "/sales", "Pharmacist")
            .send(validSale);

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe("Sale completed successfully.");
        expect(response.body.data).toEqual({
            sale_id: 100,
            total_amount: 100
        });
        expect(salesService.createSale).toHaveBeenCalledWith({
            ...validSale,
            pharmacist_id: 2
        });
        expect(salesService.createSale).toHaveBeenCalledTimes(1);
    });

    test("should use pharmacist ID from JWT instead of request body", async () => {
        salesService.createSale.mockResolvedValue({
            status: 201,
            success: true,
            message: "Sale completed successfully.",
            data: { sale_id: 101, total_amount: 100 }
        });

        const response = await authRequest("post", "/sales", "Pharmacist")
            .send({ ...validSale, pharmacist_id: 999 });

        expect(response.status).toBe(201);
        expect(salesService.createSale).toHaveBeenCalledWith({
            ...validSale,
            pharmacist_id: 2
        });
    });

    test("should return service validation error when sale is invalid", async () => {
        salesService.createSale.mockResolvedValue({
            status: 400,
            success: false,
            message: "Invalid payment mode.",
            data: null
        });
        const sale = { ...validSale, payment_mode: "Bitcoin" };

        const response = await authRequest("post", "/sales", "Pharmacist")
            .send(sale);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe("Invalid payment mode.");
        expect(salesService.createSale).toHaveBeenCalledWith({
            ...sale,
            pharmacist_id: 2
        });
    });

    test("should return service conflict when stock is insufficient", async () => {
        salesService.createSale.mockResolvedValue({
            status: 409,
            success: false,
            message: "Insufficient stock.",
            data: null
        });

        const response = await authRequest("post", "/sales", "Pharmacist")
            .send(validSale);

        expect(response.status).toBe(409);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe("Insufficient stock.");
    });
});

// ============================================================
// GET /sales - SALES HISTORY (ADMIN ONLY)
// ============================================================

describe("GET /sales - Get All Sales", () => {

    test("should return 401 when token is missing", async () => {
        const response = await request(app).get("/sales");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Access token is required.");
        expect(salesService.getAllSales).not.toHaveBeenCalled();
    });

    test("should return 401 when token is invalid", async () => {
        const response = await request(app)
            .get("/sales")
            .set("Authorization", "Bearer invalid-token");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Invalid or expired token.");
        expect(salesService.getAllSales).not.toHaveBeenCalled();
    });

    test.each(["Pharmacist", "Customer"])(
        "should return 403 when %s accesses all sales",
        async (role) => {
            const response = await authRequest("get", "/sales", role);

            expect(response.status).toBe(403);
            expect(response.body.message).toBe(
                "You are not authorized to access this resource."
            );
            expect(salesService.getAllSales).not.toHaveBeenCalled();
        }
    );

    test("should return all sales successfully for Admin", async () => {
        const sales = [
            { sale_id: 1, total_amount: 500, payment_mode: "Cash" },
            { sale_id: 2, total_amount: 300, payment_mode: "UPI" }
        ];
        salesService.getAllSales.mockResolvedValue({
            status: 200,
            success: true,
            message: "Sales retrieved successfully.",
            data: sales
        });

        const response = await authRequest("get", "/sales", "Admin");

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe("Sales retrieved successfully.");
        expect(response.body.data).toEqual(sales);
        expect(salesService.getAllSales).toHaveBeenCalledTimes(1);
    });

    test("should return 404 when no sales are found", async () => {
        salesService.getAllSales.mockResolvedValue({
            status: 404,
            success: false,
            message: "No sales found.",
            data: null
        });

        const response = await authRequest("get", "/sales", "Admin");

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe("No sales found.");
        expect(salesService.getAllSales).toHaveBeenCalledTimes(1);
    });
});

// ============================================================
// GET /sales/search - SEARCH SALES (ADMIN ONLY)
// ============================================================

describe("GET /sales/search - Search Sales", () => {

    test("should return 401 when token is missing", async () => {
        const response = await request(app).get("/sales/search?search=Rahul");

        expect(response.status).toBe(401);
        expect(salesService.searchSales).not.toHaveBeenCalled();
    });

    test.each(["Pharmacist", "Customer"])(
        "should return 403 when %s searches sales",
        async (role) => {
            const response = await authRequest(
                "get", "/sales/search?search=Rahul", role
            );

            expect(response.status).toBe(403);
            expect(salesService.searchSales).not.toHaveBeenCalled();
        }
    );

    test.each([
        ["/sales/search", "missing"],
        ["/sales/search?search=", "empty"],
        ["/sales/search?search=%20%20%20", "spaces only"]
    ])("should return 400 when search parameter is %s (%s)", async (path) => {
        const response = await authRequest("get", path, "Admin");

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Search failed. The 'search' query parameter is missing or empty."
        );
        expect(salesService.searchSales).not.toHaveBeenCalled();
    });

    test("should search sales successfully for Admin", async () => {
        const sales = [
            { sale_id: 10, customer_name: "Rahul", total_amount: 500 }
        ];
        salesService.searchSales.mockResolvedValue({
            status: 200,
            success: true,
            message: "Sales retrieved successfully.",
            data: sales
        });

        const response = await authRequest(
            "get", "/sales/search?search=Rahul", "Admin"
        );

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(sales);
        expect(salesService.searchSales).toHaveBeenCalledWith("Rahul");
    });

    test("should trim search text before calling service", async () => {
        salesService.searchSales.mockResolvedValue({
            status: 200,
            success: true,
            message: "Sales retrieved successfully.",
            data: []
        });

        const response = await authRequest(
            "get", "/sales/search?search=%20Rahul%20", "Admin"
        );

        expect(response.status).toBe(200);
        expect(salesService.searchSales).toHaveBeenCalledWith("Rahul");
    });

    test("should return 404 when no matching sales exist", async () => {
        salesService.searchSales.mockResolvedValue({
            status: 404,
            success: false,
            message: "No matching sales found.",
            data: null
        });

        const response = await authRequest(
            "get", "/sales/search?search=Unknown", "Admin"
        );

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("No matching sales found.");
        expect(salesService.searchSales).toHaveBeenCalledWith("Unknown");
    });
});

// ============================================================
// GET /sales/:saleId - SALE BY ID (ADMIN ONLY)
// ============================================================

describe("GET /sales/:saleId - Get Sale By ID", () => {

    test("should return 401 when token is missing", async () => {
        const response = await request(app).get("/sales/10");

        expect(response.status).toBe(401);
        expect(salesService.getSaleById).not.toHaveBeenCalled();
    });

    test("should return 401 when token is invalid", async () => {
        const response = await request(app)
            .get("/sales/10")
            .set("Authorization", "Bearer invalid-token");

        expect(response.status).toBe(401);
        expect(salesService.getSaleById).not.toHaveBeenCalled();
    });

    test.each(["Pharmacist", "Customer"])(
        "should return 403 when %s accesses sale by ID",
        async (role) => {
            const response = await authRequest("get", "/sales/10", role);

            expect(response.status).toBe(403);
            expect(salesService.getSaleById).not.toHaveBeenCalled();
        }
    );

    test.each([
        ["abc", "not a number"],
        ["0", "zero"],
        ["-5", "negative"],
        ["1.5", "decimal"]
    ])("should return 400 when sale ID is %s (%s)", async (id) => {
        const response = await authRequest("get", `/sales/${id}`, "Admin");

        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Invalid sale ID.");
        expect(salesService.getSaleById).not.toHaveBeenCalled();
    });

    test("should return sale successfully for Admin", async () => {
        const sale = {
            sale_id: 10,
            total_amount: 500,
            payment_mode: "UPI"
        };
        salesService.getSaleById.mockResolvedValue({
            status: 200,
            success: true,
            message: "Sale retrieved successfully.",
            data: sale
        });

        const response = await authRequest("get", "/sales/10", "Admin");

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe("Sale retrieved successfully.");
        expect(response.body.data).toEqual(sale);
        expect(salesService.getSaleById).toHaveBeenCalledWith(10);
    });

    test("should return 404 when sale does not exist", async () => {
        salesService.getSaleById.mockResolvedValue({
            status: 404,
            success: false,
            message: "Sale not found.",
            data: null
        });

        const response = await authRequest("get", "/sales/999", "Admin");

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe("Sale not found.");
        expect(salesService.getSaleById).toHaveBeenCalledWith(999);
    });
});



 // ============================================================
 // GET /sales/my-purchases - CUSTOMER OWN PURCHASES
 // ============================================================

 describe("GET /sales/my-purchases - Customer Purchase History", () => {

     test("should return the authenticated Customer's purchases", async () => {
         const purchases = [
             { sale_id: 10, customer_id: 3, total_amount: 500 },
             { sale_id: 11, customer_id: 3, total_amount: 200 }
         ];

         salesService.getMyPurchases.mockResolvedValue({
             status: 200,
             success: true,
             message: "Purchases retrieved successfully.",
             data: purchases
         });

         const response = await authRequest(
             "get",
             "/sales/my-purchases",
             "Customer"
         );

         expect(response.status).toBe(200);
         expect(response.body.success).toBe(true);
         expect(response.body.message).toBe(
             "Purchases retrieved successfully."
         );
         expect(response.body.data).toEqual(purchases);

         // Customer ID comes from the authenticated user.
         expect(salesService.getMyPurchases)
             .toHaveBeenCalledWith(3);

         expect(salesService.getMyPurchases)
             .toHaveBeenCalledTimes(1);

         expect(salesService.getAllSales)
             .not.toHaveBeenCalled();
     });

     test("should return 200 and empty array when no purchases exist", async () => {
         salesService.getMyPurchases.mockResolvedValue({
             status: 200,
             success: true,
             message: "Purchases retrieved successfully.",
             data: []
         });

         const response = await authRequest(
             "get",
             "/sales/my-purchases",
             "Customer"
         );

         expect(response.status).toBe(200);
         expect(response.body.data).toEqual([]);

         expect(salesService.getMyPurchases)
             .toHaveBeenCalledWith(3);
     });
 });

 // ============================================================
 // GET /sales/my-purchases/:saleId
 // CUSTOMER OWN PURCHASE DETAILS
 // ============================================================

 describe("GET /sales/my-purchases/:saleId - Customer Purchase Details", () => {

     test.each([
         ["abc", "not a number"],
         ["0", "zero"],
         ["-5", "negative"],
         ["1.5", "decimal"],
         ["9007199254740992", "unsafe integer"]
     ])("should reject sale ID %s (%s)", async (saleId) => {

         const response = await authRequest(
             "get",
             `/sales/my-purchases/${saleId}`,
             "Customer"
         );

         expect(response.status).toBe(400);
         expect(response.body.message).toBe("Invalid sale ID.");

         expect(salesService.getMyPurchaseById)
             .not.toHaveBeenCalled();
     });

     test("should return own purchase details successfully", async () => {
         const purchase = {
             sale_id: 10,
             customer_id: 3,
             total_amount: 500,
             items: [
                 {
                     batch_id: 10,
                     quantity: 2,
                     subtotal: 500
                 }
             ]
         };

         salesService.getMyPurchaseById.mockResolvedValue({
             status: 200,
             success: true,
             message: "Purchase retrieved successfully.",
             data: purchase
         });

         const response = await authRequest(
             "get",
             "/sales/my-purchases/10",
             "Customer"
         );

         expect(response.status).toBe(200);
         expect(response.body.success).toBe(true);
         expect(response.body.message).toBe(
             "Purchase retrieved successfully."
         );

         expect(response.body.data).toEqual(purchase);

         // Customer ID and validated sale ID.
         expect(salesService.getMyPurchaseById)
             .toHaveBeenCalledWith(3, 10);

         expect(salesService.getMyPurchaseById)
             .toHaveBeenCalledTimes(1);

         // Admin's service should not be used.
         expect(salesService.getSaleById)
             .not.toHaveBeenCalled();
     });

     test("should return 404 when purchase does not exist", async () => {
         salesService.getMyPurchaseById.mockResolvedValue({
             status: 404,
             success: false,
             message: "Purchase not found.",
             data: null
         });

         const response = await authRequest(
             "get",
             "/sales/my-purchases/999",
             "Customer"
         );

         expect(response.status).toBe(404);
         expect(response.body.success).toBe(false);
         expect(response.body.message).toBe(
             "Purchase not found."
         );

         expect(salesService.getMyPurchaseById)
             .toHaveBeenCalledWith(3, 999);
     });

     test("should forward 404 for another customer's purchase", async () => {
         // Simulate the service rejecting a purchase
         // that does not belong to this customer.
         salesService.getMyPurchaseById.mockResolvedValue({
             status: 404,
             success: false,
             message: "Purchase not found.",
             data: null
         });

         const response = await authRequest(
             "get",
             "/sales/my-purchases/20",
             "Customer"
         );

         expect(response.status).toBe(404);
         expect(response.body.message).toBe(
             "Purchase not found."
         );

         expect(salesService.getMyPurchaseById)
             .toHaveBeenCalledWith(3, 20);
     });
 });



// ============================================================
// CUSTOMER PURCHASE ROUTES - SECURITY TESTS
// Success and ownership cases need the updated sales controller.
// ============================================================

describe.each([
    ["/sales/my-purchases", "purchase history"],
    ["/sales/my-purchases/10", "single purchase"]
])("GET %s - Customer %s access", (path) => {

    test("should return 401 without a token", async () => {
        const response = await request(app).get(path);

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Access token is required.");
    });

    test("should return 401 with an invalid token", async () => {
        const response = await request(app)
            .get(path)
            .set("Authorization", "Bearer invalid-token");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Invalid or expired token.");
    });

    test.each(["Admin", "Pharmacist"])(
        "should return 403 for %s",
        async (role) => {
            const response = await authRequest("get", path, role);

            expect(response.status).toBe(403);
            expect(response.body.message).toBe(
                "You are not authorized to access this resource."
            );
        }
    );
});
