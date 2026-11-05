const medicineService = require("../../services/medicine.service");

jest.mock("../../models/medicine.model");
jest.mock("../../models/manufacturer.model");

const medicineModel = require("../../models/medicine.model");
const manufacturerModel = require("../../models/manufacturer.model");

describe("Medicine Service", () => {

    // =========================================================
    // addMedicine
    // =========================================================

    describe("addMedicine", () => {

        test("should return 404 when manufacturer does not exist", async () => {

            // Arrange
            const medicine = {
                name: "Paracetamol",
                category: "Tablet",
                manufacturer_id: 1
            };

            manufacturerModel.getManufacturerById.mockResolvedValue(null);

            // Act
            const result = await medicineService.addMedicine(medicine);

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe("Manufacturer not found.");
        });


        test("should return 409 when manufacturer is inactive", async () => {

            // Arrange
            const medicine = {
                name: "Paracetamol",
                category: "Tablet",
                manufacturer_id: 1
            };

            manufacturerModel.getManufacturerById.mockResolvedValue({
                manufacturer_id: 1,
                is_active: 0
            });

            // Act
            const result = await medicineService.addMedicine(medicine);

            // Assert
            expect(result.status).toBe(409);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Manufacturer is inactive. Restore it before adding medicines."
            );
        });


        test("should return 409 when medicine already exists and is active", async () => {

            // Arrange
            const medicine = {
                name: "Paracetamol",
                category: "Tablet",
                manufacturer_id: 1
            };

            manufacturerModel.getManufacturerById.mockResolvedValue({
                manufacturer_id: 1,
                is_active: 1
            });

            medicineModel.getMedicineByNameAndManufacturerId.mockResolvedValue({
                medicine_id: 10,
                medicine_is_active: 1
            });

            // Act
            const result = await medicineService.addMedicine(medicine);

            // Assert
            expect(result.status).toBe(409);
            expect(result.success).toBe(false);
            expect(result.message).toBe("Medicine already exists.");
        });


        test("should return 409 when medicine exists but is inactive", async () => {

            // Arrange
            const medicine = {
                name: "Paracetamol",
                category: "Tablet",
                manufacturer_id: 1
            };

            manufacturerModel.getManufacturerById.mockResolvedValue({
                manufacturer_id: 1,
                is_active: 1
            });

            medicineModel.getMedicineByNameAndManufacturerId.mockResolvedValue({
                medicine_id: 10,
                medicine_is_active: 0
            });

            // Act
            const result = await medicineService.addMedicine(medicine);

            // Assert
            expect(result.status).toBe(409);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Medicine is inactive. Do you want to restore it?"
            );
            expect(result.data).toEqual({
                requiresConfirmation: true,
                medicineId: 10
            });
        });


        test("should create medicine successfully", async () => {

            // Arrange
            const medicine = {
                name: "  Paracetamol  ",
                category: "  Tablet  ",
                manufacturer_id: 1
            };

            manufacturerModel.getManufacturerById.mockResolvedValue({
                manufacturer_id: 1,
                is_active: 1
            });

            medicineModel.getMedicineByNameAndManufacturerId.mockResolvedValue(null);

            medicineModel.createMedicine.mockResolvedValue(10);

            // Act
            const result = await medicineService.addMedicine(medicine);

            // Assert
            expect(result.status).toBe(201);
            expect(result.success).toBe(true);
            expect(result.message).toBe("Medicine added successfully.");
            expect(result.data).toEqual({
                medicineId: 10
            });
        });

    });


    // =========================================================
    // getAllMedicines
    // =========================================================

    describe("getAllMedicines", () => {

        test("should return 404 when no medicines are found", async () => {

            // Arrange
            medicineModel.getAllMedicines.mockResolvedValue([]);

            // Act
            const result = await medicineService.getAllMedicines();

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe("No medicines found.");
        });


        test("should return all medicines successfully", async () => {

            // Arrange
            const medicines = [
                {
                    medicine_id: 1,
                    name: "Paracetamol"
                },
                {
                    medicine_id: 2,
                    name: "Amoxicillin"
                }
            ];

            medicineModel.getAllMedicines.mockResolvedValue(medicines);

            // Act
            const result = await medicineService.getAllMedicines();

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Medicines retrieved successfully."
            );
            expect(result.data).toEqual(medicines);
        });

    });


    // =========================================================
    // getMedicineById
    // =========================================================

    describe("getMedicineById", () => {

        test("should return 404 when medicine is not found", async () => {

            // Arrange
            medicineModel.getMedicineById.mockResolvedValue(null);

            // Act
            const result = await medicineService.getMedicineById(1);

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe("Medicine not found.");
        });


        test("should return medicine successfully", async () => {

            // Arrange
            const medicine = {
                medicine_id: 1,
                name: "Paracetamol"
            };

            medicineModel.getMedicineById.mockResolvedValue(medicine);

            // Act
            const result = await medicineService.getMedicineById(1);

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Medicine retrieved successfully."
            );
            expect(result.data).toEqual(medicine);
        });

    });


    // =========================================================
    // searchMedicineByName
    // =========================================================

    describe("searchMedicineByName", () => {

        test("should return 404 when no medicines are found", async () => {

            // Arrange
            medicineModel.searchMedicineByName.mockResolvedValue([]);

            // Act
            const result =
                await medicineService.searchMedicineByName("Paracetamol");

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe("No medicines found.");
        });


        test("should return medicines successfully", async () => {

            // Arrange
            const medicines = [
                {
                    medicine_id: 1,
                    name: "Paracetamol"
                }
            ];

            medicineModel.searchMedicineByName.mockResolvedValue(medicines);

            // Act
            const result =
                await medicineService.searchMedicineByName("Paracetamol");

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Medicines retrieved successfully."
            );
            expect(result.data).toEqual(medicines);
        });

    });


    // =========================================================
    // searchMedicineByManufacturerName
    // =========================================================

    describe("searchMedicineByManufacturerName", () => {

        test("should return 404 when no medicines are found", async () => {

            // Arrange
            medicineModel.searchMedicineByManufacturerName
                .mockResolvedValue([]);

            // Act
            const result =
                await medicineService.searchMedicineByManufacturerName(
                    "Cipla"
                );

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe("No medicines found.");
        });


        test("should return medicines successfully", async () => {

            // Arrange
            const medicines = [
                {
                    medicine_id: 1,
                    name: "Paracetamol",
                    manufacturer_name: "Cipla"
                }
            ];

            medicineModel.searchMedicineByManufacturerName
                .mockResolvedValue(medicines);

            // Act
            const result =
                await medicineService.searchMedicineByManufacturerName(
                    "Cipla"
                );

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Medicines retrieved successfully."
            );
            expect(result.data).toEqual(medicines);
        });

    });


    // =========================================================
    // updateMedicine
    // =========================================================

    describe("updateMedicine", () => {

        test("should return 404 when medicine does not exist", async () => {

            // Arrange
            medicineModel.getMedicineById.mockResolvedValue(null);

            const medicine = {
                name: "Paracetamol",
                category: "Tablet",
                manufacturer_id: 1
            };

            // Act
            const result =
                await medicineService.updateMedicine(1, medicine);

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe("Medicine not found.");
        });


        test("should return 409 when medicine is inactive", async () => {

            // Arrange
            medicineModel.getMedicineById.mockResolvedValue({
                medicine_id: 1,
                medicine_is_active: 0
            });

            const medicine = {
                name: "Paracetamol",
                category: "Tablet",
                manufacturer_id: 1
            };

            // Act
            const result =
                await medicineService.updateMedicine(1, medicine);

            // Assert
            expect(result.status).toBe(409);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Medicine is inactive. Restore it before updating."
            );
        });


        test("should return 404 when manufacturer does not exist", async () => {

            // Arrange
            medicineModel.getMedicineById.mockResolvedValue({
                medicine_id: 1,
                medicine_is_active: 1
            });

            manufacturerModel.getManufacturerById.mockResolvedValue(null);

            const medicine = {
                name: "Paracetamol",
                category: "Tablet",
                manufacturer_id: 1
            };

            // Act
            const result =
                await medicineService.updateMedicine(1, medicine);

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe("Manufacturer not found.");
        });


        test("should return 409 when manufacturer is inactive", async () => {

            // Arrange
            medicineModel.getMedicineById.mockResolvedValue({
                medicine_id: 1,
                medicine_is_active: 1
            });

            manufacturerModel.getManufacturerById.mockResolvedValue({
                manufacturer_id: 1,
                is_active: 0
            });

            const medicine = {
                name: "Paracetamol",
                category: "Tablet",
                manufacturer_id: 1
            };

            // Act
            const result =
                await medicineService.updateMedicine(1, medicine);

            // Assert
            expect(result.status).toBe(409);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Manufacturer is inactive."
            );
        });


        test("should return 409 when another medicine with same name and manufacturer exists", async () => {

            // Arrange
            medicineModel.getMedicineById.mockResolvedValue({
                medicine_id: 1,
                medicine_is_active: 1
            });

            manufacturerModel.getManufacturerById.mockResolvedValue({
                manufacturer_id: 1,
                is_active: 1
            });

            medicineModel.getMedicineByNameAndManufacturerId
                .mockResolvedValue({
                    medicine_id: 2,
                    medicine_is_active: 1
                });

            const medicine = {
                name: "Paracetamol",
                category: "Tablet",
                manufacturer_id: 1
            };

            // Act
            const result =
                await medicineService.updateMedicine(1, medicine);

            // Assert
            expect(result.status).toBe(409);
            expect(result.success).toBe(false);
            expect(result.message).toBe("Medicine already exists.");
        });


        test("should update medicine successfully", async () => {

            // Arrange
            medicineModel.getMedicineById.mockResolvedValue({
                medicine_id: 1,
                medicine_is_active: 1
            });

            manufacturerModel.getManufacturerById.mockResolvedValue({
                manufacturer_id: 1,
                is_active: 1
            });

            medicineModel.getMedicineByNameAndManufacturerId
                .mockResolvedValue(null);

            medicineModel.updateMedicine.mockResolvedValue();

            const medicine = {
                name: "  Paracetamol  ",
                category: "  Tablet  ",
                manufacturer_id: 1
            };

            // Act
            const result =
                await medicineService.updateMedicine(1, medicine);

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Medicine updated successfully."
            );
        });

    });


    // =========================================================
    // deactivateMedicine
    // =========================================================

    describe("deactivateMedicine", () => {

        test("should return 404 when medicine does not exist", async () => {

            // Arrange
            medicineModel.getMedicineById.mockResolvedValue(null);

            // Act
            const result =
                await medicineService.deactivateMedicine(1);

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe("Medicine not found.");
        });


        test("should return 400 when medicine is already inactive", async () => {

            // Arrange
            medicineModel.getMedicineById.mockResolvedValue({
                medicine_id: 1,
                medicine_is_active: 0
            });

            // Act
            const result =
                await medicineService.deactivateMedicine(1);

            // Assert
            expect(result.status).toBe(400);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Medicine is already inactive."
            );
        });


        test("should deactivate medicine successfully", async () => {

            // Arrange
            medicineModel.getMedicineById.mockResolvedValue({
                medicine_id: 1,
                medicine_is_active: 1
            });

            medicineModel.deactivateMedicine.mockResolvedValue();

            // Act
            const result =
                await medicineService.deactivateMedicine(1);

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Medicine deactivated successfully."
            );
        });

    });


    // =========================================================
    // restoreMedicine
    // =========================================================

    describe("restoreMedicine", () => {

        test("should return 404 when medicine does not exist", async () => {

            // Arrange
            medicineModel.getMedicineById.mockResolvedValue(null);

            // Act
            const result =
                await medicineService.restoreMedicine(1);

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe("Medicine not found.");
        });


        test("should return 400 when medicine is already active", async () => {

            // Arrange
            medicineModel.getMedicineById.mockResolvedValue({
                medicine_id: 1,
                medicine_is_active: 1
            });

            // Act
            const result =
                await medicineService.restoreMedicine(1);

            // Assert
            expect(result.status).toBe(400);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Medicine is already active."
            );
        });


        test("should return 409 when manufacturer is inactive", async () => {

            // Arrange
            medicineModel.getMedicineById.mockResolvedValue({
                medicine_id: 1,
                medicine_is_active: 0,
                manufacturer_id: 2
            });

            manufacturerModel.getManufacturerById.mockResolvedValue({
                manufacturer_id: 2,
                is_active: 0
            });

            // Act
            const result =
                await medicineService.restoreMedicine(1);

            // Assert
            expect(result.status).toBe(409);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Manufacturer is inactive. Restore the manufacturer first."
            );
        });


        test("should restore medicine successfully", async () => {

            // Arrange
            medicineModel.getMedicineById.mockResolvedValue({
                medicine_id: 1,
                medicine_is_active: 0,
                manufacturer_id: 2
            });

            manufacturerModel.getManufacturerById.mockResolvedValue({
                manufacturer_id: 2,
                is_active: 1
            });

            medicineModel.restoreMedicine.mockResolvedValue();

            // Act
            const result =
                await medicineService.restoreMedicine(1);

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Medicine restored successfully."
            );
        });

    });

});