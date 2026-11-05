const request = require("supertest");
const jwt = require("jsonwebtoken");

jest.mock("../../models/user.model", () => ({
    getUserAuthById: jest.fn()
}));
jest.mock("../../services/medicine.service");

const app = require("../../app");
const userModel = require("../../models/user.model");
const medicineService = require("../../services/medicine.service");

const accounts = [
    { user_id: 1, email: "admin@example.com", role: "Admin", is_active: 1, token_version: 0 },
    { user_id: 2, email: "pharmacist@example.com", role: "Pharmacist", is_active: 1, token_version: 0 },
    { user_id: 3, email: "customer@example.com", role: "Customer", is_active: 1, token_version: 0 }
];

beforeEach(() => {
    jest.resetAllMocks();
    userModel.getUserAuthById.mockImplementation(async (userId) =>
        accounts.find(account => account.user_id === userId) ?? null
    );
});


// =========================================================
// JWT TOKENS
// =========================================================

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

const [adminToken, pharmacistToken, customerToken] = accounts.map(signAccountToken);


// =========================================================
// POST /medicines
// =========================================================

describe("POST /medicines", () => {

    test("should return 401 when token is missing", async () => {

        const response = await request(app)
            .post("/medicines")
            .send({
                manufacturer_id: 1,
                name: "Paracetamol",
                category: "Tablet",
                reorder_level: 10
            });

        expect(response.status).toBe(401);
        expect(response.body.message).toBe(
            "Access token is required."
        );

        expect(medicineService.addMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 403 when Pharmacist tries to add medicine", async () => {

        const response = await request(app)
            .post("/medicines")
            .set("Authorization", `Bearer ${pharmacistToken}`)
            .send({
                manufacturer_id: 1,
                name: "Paracetamol",
                category: "Tablet",
                reorder_level: 10
            });

        expect(response.status).toBe(403);
        expect(response.body.message).toBe(
            "You are not authorized to access this resource."
        );

        expect(medicineService.addMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when manufacturer_id is missing", async () => {

        const response = await request(app)
            .post("/medicines")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                name: "Paracetamol",
                category: "Tablet",
                reorder_level: 10
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Creation failed. Missing required fields: manufacturer_id"
        );

        expect(medicineService.addMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when name is missing", async () => {

        const response = await request(app)
            .post("/medicines")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                manufacturer_id: 1,
                category: "Tablet",
                reorder_level: 10
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Creation failed. Missing required fields: name"
        );

        expect(medicineService.addMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when name is empty", async () => {

        const response = await request(app)
            .post("/medicines")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                manufacturer_id: 1,
                name: "   ",
                category: "Tablet",
                reorder_level: 10
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Creation failed. Missing required fields: name"
        );

        expect(medicineService.addMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when category is missing", async () => {

        const response = await request(app)
            .post("/medicines")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                manufacturer_id: 1,
                name: "Paracetamol",
                reorder_level: 10
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Creation failed. Missing required fields: category"
        );

        expect(medicineService.addMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when category is empty", async () => {

        const response = await request(app)
            .post("/medicines")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                manufacturer_id: 1,
                name: "Paracetamol",
                category: "   ",
                reorder_level: 10
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Creation failed. Missing required fields: category"
        );

        expect(medicineService.addMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when reorder_level is missing", async () => {

        const response = await request(app)
            .post("/medicines")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                manufacturer_id: 1,
                name: "Paracetamol",
                category: "Tablet"
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Creation failed. Missing required fields: reorder_level"
        );

        expect(medicineService.addMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when multiple required fields are missing", async () => {

        const response = await request(app)
            .post("/medicines")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({});

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Creation failed. Missing required fields: manufacturer_id, name, category, reorder_level"
        );

        expect(medicineService.addMedicine)
            .not.toHaveBeenCalled();
    });


    test("should add medicine successfully for Admin", async () => {

        medicineService.addMedicine.mockResolvedValue({
            status: 201,
            success: true,
            message: "Medicine added successfully.",
            data: {
                medicineId: 10
            }
        });

        const response = await request(app)
            .post("/medicines")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                manufacturer_id: 1,
                name: "  Paracetamol  ",
                category: "  Tablet  ",
                reorder_level: 10
            });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe(
            "Medicine added successfully."
        );
        expect(response.body.data).toEqual({
            medicineId: 10
        });

        expect(medicineService.addMedicine)
            .toHaveBeenCalledWith({
                manufacturer_id: 1,
                name: "Paracetamol",
                category: "Tablet",
                reorder_level: 10
            });
    });

});


// =========================================================
// GET /medicines
// =========================================================

describe("GET /medicines", () => {

    test("should return 401 when token is missing", async () => {

        const response = await request(app)
            .get("/medicines");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe(
            "Access token is required."
        );

        expect(medicineService.getAllMedicines)
            .not.toHaveBeenCalled();
    });


    test("should return 403 when Customer accesses medicines", async () => {

        const response = await request(app)
            .get("/medicines")
            .set("Authorization", `Bearer ${customerToken}`);

        expect(response.status).toBe(403);
        expect(response.body.message).toBe(
            "You are not authorized to access this resource."
        );

        expect(medicineService.getAllMedicines)
            .not.toHaveBeenCalled();
    });


    test("should get all medicines successfully for Admin", async () => {

        medicineService.getAllMedicines.mockResolvedValue({
            status: 200,
            success: true,
            message: "Medicines retrieved successfully.",
            data: [
                {
                    medicine_id: 1,
                    name: "Paracetamol"
                },
                {
                    medicine_id: 2,
                    name: "Amoxicillin"
                }
            ]
        });

        const response = await request(app)
            .get("/medicines")
            .set("Authorization", `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe(
            "Medicines retrieved successfully."
        );
        expect(response.body.data).toHaveLength(2);

        expect(medicineService.getAllMedicines)
            .toHaveBeenCalled();
    });


    test("should get all medicines successfully for Pharmacist", async () => {

        medicineService.getAllMedicines.mockResolvedValue({
            status: 200,
            success: true,
            message: "Medicines retrieved successfully.",
            data: [
                {
                    medicine_id: 1,
                    name: "Paracetamol"
                }
            ]
        });

        const response = await request(app)
            .get("/medicines")
            .set("Authorization", `Bearer ${pharmacistToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        expect(medicineService.getAllMedicines)
            .toHaveBeenCalled();
    });

});


// =========================================================
// GET /medicines/:medicineId
// =========================================================

describe("GET /medicines/:medicineId", () => {

    test("should return 401 when token is missing", async () => {

        const response = await request(app)
            .get("/medicines/1");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe(
            "Access token is required."
        );

        expect(medicineService.getMedicineById)
            .not.toHaveBeenCalled();
    });


    test("should return 403 when Customer accesses medicine", async () => {

        const response = await request(app)
            .get("/medicines/1")
            .set("Authorization", `Bearer ${customerToken}`);

        expect(response.status).toBe(403);
        expect(response.body.message).toBe(
            "You are not authorized to access this resource."
        );

        expect(medicineService.getMedicineById)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when medicine ID is invalid", async () => {

        const response = await request(app)
            .get("/medicines/abc")
            .set("Authorization", `Bearer ${adminToken}`);

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Invalid medicine ID."
        );

        expect(medicineService.getMedicineById)
            .not.toHaveBeenCalled();
    });


    test("should get medicine successfully for Admin", async () => {

        medicineService.getMedicineById.mockResolvedValue({
            status: 200,
            success: true,
            message: "Medicine retrieved successfully.",
            data: {
                medicine_id: 1,
                name: "Paracetamol"
            }
        });

        const response = await request(app)
            .get("/medicines/1")
            .set("Authorization", `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe(
            "Medicine retrieved successfully."
        );
        expect(response.body.data).toEqual({
            medicine_id: 1,
            name: "Paracetamol"
        });

        expect(medicineService.getMedicineById)
            .toHaveBeenCalledWith(1);
    });


    test("should get medicine successfully for Pharmacist", async () => {

        medicineService.getMedicineById.mockResolvedValue({
            status: 200,
            success: true,
            message: "Medicine retrieved successfully.",
            data: {
                medicine_id: 1,
                name: "Paracetamol"
            }
        });

        const response = await request(app)
            .get("/medicines/1")
            .set("Authorization", `Bearer ${pharmacistToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        expect(medicineService.getMedicineById)
            .toHaveBeenCalledWith(1);
    });

});


// =========================================================
// GET /medicines/search/name
// =========================================================

describe("GET /medicines/search/name", () => {

    test("should return 401 when token is missing", async () => {

        const response = await request(app)
            .get("/medicines/search/name?name=Paracetamol");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe(
            "Access token is required."
        );

        expect(medicineService.searchMedicineByName)
            .not.toHaveBeenCalled();
    });


    test("should return 403 when Customer searches medicine", async () => {

        const response = await request(app)
            .get("/medicines/search/name?name=Paracetamol")
            .set("Authorization", `Bearer ${customerToken}`);

        expect(response.status).toBe(403);
        expect(response.body.message).toBe(
            "You are not authorized to access this resource."
        );

        expect(medicineService.searchMedicineByName)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when name query parameter is missing", async () => {

        const response = await request(app)
            .get("/medicines/search/name")
            .set("Authorization", `Bearer ${adminToken}`);

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Search failed. The 'name' query parameter is missing or empty (e.g., ?name=paracetamol)."
        );

        expect(medicineService.searchMedicineByName)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when name query parameter is empty", async () => {

        const response = await request(app)
            .get("/medicines/search/name?name=%20%20%20")
            .set("Authorization", `Bearer ${adminToken}`);

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Search failed. The 'name' query parameter is missing or empty (e.g., ?name=paracetamol)."
        );

        expect(medicineService.searchMedicineByName)
            .not.toHaveBeenCalled();
    });


    test("should search medicines by name for Admin", async () => {

        medicineService.searchMedicineByName.mockResolvedValue({
            status: 200,
            success: true,
            message: "Medicines retrieved successfully.",
            data: [
                {
                    medicine_id: 1,
                    name: "Paracetamol"
                }
            ]
        });

        const response = await request(app)
            .get("/medicines/search/name?name=%20Paracetamol%20")
            .set("Authorization", `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);

        expect(medicineService.searchMedicineByName)
            .toHaveBeenCalledWith("Paracetamol");
    });


    test("should search medicines by name for Pharmacist", async () => {

        medicineService.searchMedicineByName.mockResolvedValue({
            status: 200,
            success: true,
            message: "Medicines retrieved successfully.",
            data: [
                {
                    medicine_id: 1,
                    name: "Paracetamol"
                }
            ]
        });

        const response = await request(app)
            .get("/medicines/search/name?name=Paracetamol")
            .set("Authorization", `Bearer ${pharmacistToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        expect(medicineService.searchMedicineByName)
            .toHaveBeenCalledWith("Paracetamol");
    });

});


// =========================================================
// GET /medicines/search/manufacturer
// =========================================================

describe("GET /medicines/search/manufacturer", () => {

    test("should return 401 when token is missing", async () => {

        const response = await request(app)
            .get("/medicines/search/manufacturer?manufacturer=Cipla");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe(
            "Access token is required."
        );

        expect(medicineService.searchMedicineByManufacturerName)
            .not.toHaveBeenCalled();
    });


    test("should return 403 when Customer searches by manufacturer", async () => {

        const response = await request(app)
            .get("/medicines/search/manufacturer?manufacturer=Cipla")
            .set("Authorization", `Bearer ${customerToken}`);

        expect(response.status).toBe(403);
        expect(response.body.message).toBe(
            "You are not authorized to access this resource."
        );

        expect(medicineService.searchMedicineByManufacturerName)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when manufacturer query parameter is missing", async () => {

        const response = await request(app)
            .get("/medicines/search/manufacturer")
            .set("Authorization", `Bearer ${adminToken}`);

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Search failed. The 'manufacturer' query parameter is missing or empty (e.g., ?manufacturer=Micro Labs)."
        );

        expect(medicineService.searchMedicineByManufacturerName)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when manufacturer query parameter is empty", async () => {

        const response = await request(app)
            .get("/medicines/search/manufacturer?manufacturer=%20%20%20")
            .set("Authorization", `Bearer ${adminToken}`);

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Search failed. The 'manufacturer' query parameter is missing or empty (e.g., ?manufacturer=Micro Labs)."
        );

        expect(medicineService.searchMedicineByManufacturerName)
            .not.toHaveBeenCalled();
    });


    test("should search medicines by manufacturer for Admin", async () => {

        medicineService.searchMedicineByManufacturerName.mockResolvedValue({
            status: 200,
            success: true,
            message: "Medicines retrieved successfully.",
            data: [
                {
                    medicine_id: 1,
                    name: "Paracetamol",
                    manufacturer_name: "Cipla"
                }
            ]
        });

        const response = await request(app)
            .get("/medicines/search/manufacturer?manufacturer=%20Cipla%20")
            .set("Authorization", `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);

        expect(medicineService.searchMedicineByManufacturerName)
            .toHaveBeenCalledWith("Cipla");
    });


    test("should search medicines by manufacturer for Pharmacist", async () => {

        medicineService.searchMedicineByManufacturerName.mockResolvedValue({
            status: 200,
            success: true,
            message: "Medicines retrieved successfully.",
            data: [
                {
                    medicine_id: 1,
                    name: "Paracetamol",
                    manufacturer_name: "Cipla"
                }
            ]
        });

        const response = await request(app)
            .get("/medicines/search/manufacturer?manufacturer=Cipla")
            .set("Authorization", `Bearer ${pharmacistToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        expect(medicineService.searchMedicineByManufacturerName)
            .toHaveBeenCalledWith("Cipla");
    });

});


// =========================================================
// PUT /medicines/:medicineId
// =========================================================

describe("PUT /medicines/:medicineId", () => {

    test("should return 401 when token is missing", async () => {

        const response = await request(app)
            .put("/medicines/1")
            .send({
                manufacturer_id: 1,
                name: "Paracetamol",
                category: "Tablet",
                reorder_level: 10
            });

        expect(response.status).toBe(401);
        expect(response.body.message).toBe(
            "Access token is required."
        );

        expect(medicineService.updateMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 403 when Pharmacist updates medicine", async () => {

        const response = await request(app)
            .put("/medicines/1")
            .set("Authorization", `Bearer ${pharmacistToken}`)
            .send({
                manufacturer_id: 1,
                name: "Paracetamol",
                category: "Tablet",
                reorder_level: 10
            });

        expect(response.status).toBe(403);
        expect(response.body.message).toBe(
            "You are not authorized to access this resource."
        );

        expect(medicineService.updateMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when medicine ID is invalid", async () => {

        const response = await request(app)
            .put("/medicines/abc")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                manufacturer_id: 1,
                name: "Paracetamol",
                category: "Tablet",
                reorder_level: 10
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Invalid medicine ID."
        );

        expect(medicineService.updateMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when manufacturer_id is missing", async () => {

        const response = await request(app)
            .put("/medicines/1")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                name: "Paracetamol",
                category: "Tablet",
                reorder_level: 10
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Update failed. Missing required fields: manufacturer_id"
        );

        expect(medicineService.updateMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when name is missing", async () => {

        const response = await request(app)
            .put("/medicines/1")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                manufacturer_id: 1,
                category: "Tablet",
                reorder_level: 10
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Update failed. Missing required fields: name"
        );

        expect(medicineService.updateMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when name is empty", async () => {

        const response = await request(app)
            .put("/medicines/1")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                manufacturer_id: 1,
                name: "   ",
                category: "Tablet",
                reorder_level: 10
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Update failed. Missing required fields: name"
        );

        expect(medicineService.updateMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when category is missing", async () => {

        const response = await request(app)
            .put("/medicines/1")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                manufacturer_id: 1,
                name: "Paracetamol",
                reorder_level: 10
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Update failed. Missing required fields: category"
        );

        expect(medicineService.updateMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when category is empty", async () => {

        const response = await request(app)
            .put("/medicines/1")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                manufacturer_id: 1,
                name: "Paracetamol",
                category: "   ",
                reorder_level: 10
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Update failed. Missing required fields: category"
        );

        expect(medicineService.updateMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when reorder_level is missing", async () => {

        const response = await request(app)
            .put("/medicines/1")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                manufacturer_id: 1,
                name: "Paracetamol",
                category: "Tablet"
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Update failed. Missing required fields: reorder_level"
        );

        expect(medicineService.updateMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when multiple required fields are missing", async () => {

        const response = await request(app)
            .put("/medicines/1")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({});

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Update failed. Missing required fields: manufacturer_id, name, category, reorder_level"
        );

        expect(medicineService.updateMedicine)
            .not.toHaveBeenCalled();
    });


    test("should update medicine successfully for Admin", async () => {

        medicineService.updateMedicine.mockResolvedValue({
            status: 200,
            success: true,
            message: "Medicine updated successfully."
        });

        const response = await request(app)
            .put("/medicines/1")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                manufacturer_id: 1,
                name: "  Paracetamol  ",
                category: "  Tablet  ",
                reorder_level: 10
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe(
            "Medicine updated successfully."
        );

        expect(medicineService.updateMedicine)
            .toHaveBeenCalledWith(
                1,
                {
                    manufacturer_id: 1,
                    name: "Paracetamol",
                    category: "Tablet",
                    reorder_level: 10
                }
            );
    });

});


// =========================================================
// PATCH /medicines/:medicineId/deactivate
// =========================================================

describe("PATCH /medicines/:medicineId/deactivate", () => {

    test("should return 401 when token is missing", async () => {

        const response = await request(app)
            .patch("/medicines/1/deactivate");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe(
            "Access token is required."
        );

        expect(medicineService.deactivateMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 403 when Pharmacist deactivates medicine", async () => {

        const response = await request(app)
            .patch("/medicines/1/deactivate")
            .set("Authorization", `Bearer ${pharmacistToken}`);

        expect(response.status).toBe(403);
        expect(response.body.message).toBe(
            "You are not authorized to access this resource."
        );

        expect(medicineService.deactivateMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when medicine ID is invalid", async () => {

        const response = await request(app)
            .patch("/medicines/abc/deactivate")
            .set("Authorization", `Bearer ${adminToken}`);

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Invalid medicine ID."
        );

        expect(medicineService.deactivateMedicine)
            .not.toHaveBeenCalled();
    });


    test("should deactivate medicine successfully for Admin", async () => {

        medicineService.deactivateMedicine.mockResolvedValue({
            status: 200,
            success: true,
            message: "Medicine deactivated successfully."
        });

        const response = await request(app)
            .patch("/medicines/1/deactivate")
            .set("Authorization", `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe(
            "Medicine deactivated successfully."
        );

        expect(medicineService.deactivateMedicine)
            .toHaveBeenCalledWith(1);
    });

});


// =========================================================
// PATCH /medicines/:medicineId/restore
// =========================================================

describe("PATCH /medicines/:medicineId/restore", () => {

    test("should return 401 when token is missing", async () => {

        const response = await request(app)
            .patch("/medicines/1/restore");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe(
            "Access token is required."
        );

        expect(medicineService.restoreMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 403 when Pharmacist restores medicine", async () => {

        const response = await request(app)
            .patch("/medicines/1/restore")
            .set("Authorization", `Bearer ${pharmacistToken}`);

        expect(response.status).toBe(403);
        expect(response.body.message).toBe(
            "You are not authorized to access this resource."
        );

        expect(medicineService.restoreMedicine)
            .not.toHaveBeenCalled();
    });


    test("should return 400 when medicine ID is invalid", async () => {

        const response = await request(app)
            .patch("/medicines/abc/restore")
            .set("Authorization", `Bearer ${adminToken}`);

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Invalid medicine ID."
        );

        expect(medicineService.restoreMedicine)
            .not.toHaveBeenCalled();
    });


    test("should restore medicine successfully for Admin", async () => {

        medicineService.restoreMedicine.mockResolvedValue({
            status: 200,
            success: true,
            message: "Medicine restored successfully."
        });

        const response = await request(app)
            .patch("/medicines/1/restore")
            .set("Authorization", `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe(
            "Medicine restored successfully."
        );

        expect(medicineService.restoreMedicine)
            .toHaveBeenCalledWith(1);
    });

});