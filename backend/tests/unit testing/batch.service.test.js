const batchService = require("../../services/batch.service");

jest.mock("../../models/batch.model");
jest.mock("../../models/medicine.model");

const batchModel = require("../../models/batch.model");
const medicineModel = require("../../models/medicine.model");

describe("Batch Service", () => {

    // =========================================================
    // createBatch
    // =========================================================

    describe("createBatch", () => {

        test("should return 404 when medicine does not exist", async () => {

            // Arrange
            const batch = {
                medicine_id: 1,
                batch_number: "B001",
                purchase_price: 50,
                selling_price: 60,
                expiry_date: "2030-12-31"
            };

            medicineModel.getMedicineById.mockResolvedValue(null);

            // Act
            const result = await batchService.createBatch(batch);

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe("Medicine not found.");
        });


        test("should return 400 when medicine is inactive", async () => {

            // Arrange
            const batch = {
                medicine_id: 1,
                batch_number: "B001",
                purchase_price: 50,
                selling_price: 60,
                expiry_date: "2030-12-31"
            };

            medicineModel.getMedicineById.mockResolvedValue({
                medicine_id: 1,
                medicine_is_active: 0
            });

            // Act
            const result = await batchService.createBatch(batch);

            // Assert
            expect(result.status).toBe(400);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Cannot create batch for an inactive medicine."
            );
        });


        test("should return 400 when selling price is less than purchase price", async () => {

            // Arrange
            const batch = {
                medicine_id: 1,
                batch_number: "B001",
                purchase_price: 100,
                selling_price: 80,
                expiry_date: "2030-12-31"
            };

            medicineModel.getMedicineById.mockResolvedValue({
                medicine_id: 1,
                medicine_is_active: 1
            });

            // Act
            const result = await batchService.createBatch(batch);

            // Assert
            expect(result.status).toBe(400);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Selling price cannot be less than purchase price."
            );
        });


        test("should return 400 when expiry date is not in the future", async () => {

            // Arrange
            const batch = {
                medicine_id: 1,
                batch_number: "B001",
                purchase_price: 50,
                selling_price: 60,
                expiry_date: "2020-01-01"
            };

            medicineModel.getMedicineById.mockResolvedValue({
                medicine_id: 1,
                medicine_is_active: 1
            });

            // Act
            const result = await batchService.createBatch(batch);

            // Assert
            expect(result.status).toBe(400);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Expiry date must be a future date."
            );
        });


        test("should return 409 when batch already exists", async () => {

            // Arrange
            const batch = {
                medicine_id: 1,
                batch_number: "B001",
                purchase_price: 50,
                selling_price: 60,
                expiry_date: "2030-12-31"
            };

            medicineModel.getMedicineById.mockResolvedValue({
                medicine_id: 1,
                medicine_is_active: 1
            });

            batchModel.getBatchByMedicineIdAndBatchNumber
                .mockResolvedValue({
                    batch_id: 10,
                    batch_number: "B001"
                });

            // Act
            const result = await batchService.createBatch(batch);

            // Assert
            expect(result.status).toBe(409);
            expect(result.success).toBe(false);
            expect(result.message).toBe("Batch already exists.");
        });


        test("should create batch successfully", async () => {

            // Arrange
            const batch = {
                medicine_id: 1,
                batch_number: "B001",
                purchase_price: 50,
                selling_price: 60,
                expiry_date: "2030-12-31"
            };

            medicineModel.getMedicineById.mockResolvedValue({
                medicine_id: 1,
                medicine_is_active: 1
            });

            batchModel.getBatchByMedicineIdAndBatchNumber
                .mockResolvedValue(null);

            batchModel.createBatch.mockResolvedValue();

            // Act
            const result = await batchService.createBatch(batch);

            // Assert
            expect(result.status).toBe(201);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Batch created successfully."
            );
        });

    });


    // =========================================================
    // getInventory
    // =========================================================

    describe("getInventory", () => {

        test("should return 404 when no inventory is found", async () => {

            // Arrange
            batchModel.getInventory.mockResolvedValue([]);

            // Act
            const result = await batchService.getInventory();

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe("No inventory found.");
        });


        test("should retrieve inventory and group batches by medicine", async () => {

            // Arrange
            const rows = [
                {
                    medicine_id: 1,
                    medicine_name: "Paracetamol",
                    manufacturer_id: 10,
                    manufacturer_name: "Cipla",
                    category: "Tablet",
                    reorder_level: 20,
                    batch_id: 101,
                    batch_number: "B001",
                    selling_price: 60,
                    stock_quantity: 50,
                    expiry_date: "2030-12-31",
                    days_to_expire: 100
                },
                {
                    medicine_id: 1,
                    medicine_name: "Paracetamol",
                    manufacturer_id: 10,
                    manufacturer_name: "Cipla",
                    category: "Tablet",
                    reorder_level: 20,
                    batch_id: 102,
                    batch_number: "B002",
                    selling_price: 65,
                    stock_quantity: 30,
                    expiry_date: "2027-01-01",
                    days_to_expire: 5
                }
            ];

            batchModel.getInventory.mockResolvedValue(rows);

            // Act
            const result = await batchService.getInventory();

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Inventory retrieved successfully."
            );

            expect(result.data).toEqual([
                {
                    medicine_id: 1,
                    medicine_name: "Paracetamol",
                    manufacturer_id: 10,
                    manufacturer_name: "Cipla",
                    category: "Tablet",
                    reorder_level: 20,
                    available_stock: 80,
                    batches: [
                        {
                            batch_id: 101,
                            batch_number: "B001",
                            selling_price: 60,
                            stock_quantity: 50,
                            expiry_date: "2030-12-31",
                            days_to_expire: 100,
                            is_expiring_soon: false
                        },
                        {
                            batch_id: 102,
                            batch_number: "B002",
                            selling_price: 65,
                            stock_quantity: 30,
                            expiry_date: "2027-01-01",
                            days_to_expire: 5,
                            is_expiring_soon: true
                        }
                    ]
                }
            ]);
        });

    });


    // =========================================================
    // getBatchById
    // =========================================================

    describe("getBatchById", () => {

        test("should return 404 when batch does not exist", async () => {

            // Arrange
            batchModel.getBatchById.mockResolvedValue(null);

            // Act
            const result = await batchService.getBatchById(1);

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe("Batch not found.");
        });


        test("should return batch successfully", async () => {

            // Arrange
            const batch = {
                batch_id: 1,
                batch_number: "B001",
                stock_quantity: 50
            };

            batchModel.getBatchById.mockResolvedValue(batch);

            // Act
            const result = await batchService.getBatchById(1);

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Batch retrieved successfully."
            );
            expect(result.data).toEqual(batch);
        });

    });


    // =========================================================
    // getBatchByMedicineId
    // =========================================================

    describe("getBatchByMedicineId", () => {

        test("should return 404 when medicine does not exist", async () => {

            // Arrange
            medicineModel.getMedicineById.mockResolvedValue(null);

            // Act
            const result =
                await batchService.getBatchByMedicineId(1);

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe("Medicine not found.");
        });


        test("should return 404 when no batches are found for medicine", async () => {

            // Arrange
            medicineModel.getMedicineById.mockResolvedValue({
                medicine_id: 1,
                medicine_is_active: 1
            });

            batchModel.getBatchByMedicineId.mockResolvedValue([]);

            // Act
            const result =
                await batchService.getBatchByMedicineId(1);

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "No batches found for this medicine."
            );
        });


        test("should return batches successfully", async () => {

            // Arrange
            const batches = [
                {
                    batch_id: 1,
                    batch_number: "B001"
                },
                {
                    batch_id: 2,
                    batch_number: "B002"
                }
            ];

            medicineModel.getMedicineById.mockResolvedValue({
                medicine_id: 1,
                medicine_is_active: 1
            });

            batchModel.getBatchByMedicineId
                .mockResolvedValue(batches);

            // Act
            const result =
                await batchService.getBatchByMedicineId(1);

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Batches retrieved successfully."
            );
            expect(result.data).toEqual(batches);
        });

    });


    // =========================================================
    // searchInventory
    // =========================================================

    describe("searchInventory", () => {

        test("should return 404 when no matching inventory is found", async () => {

            // Arrange
            batchModel.searchInventory.mockResolvedValue([]);

            // Act
            const result =
                await batchService.searchInventory("Paracetamol");

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "No inventory found matching the search."
            );
        });


        test("should return matching inventory successfully", async () => {

            // Arrange
            const inventory = [
                {
                    medicine_id: 1,
                    medicine_name: "Paracetamol"
                }
            ];

            batchModel.searchInventory
                .mockResolvedValue(inventory);

            // Act
            const result =
                await batchService.searchInventory("Paracetamol");

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Inventory retrieved successfully."
            );
            expect(result.data).toEqual(inventory);
        });

    });


    // =========================================================
    // getLowStockMedicines
    // =========================================================

    describe("getLowStockMedicines", () => {

        test("should return 404 when no low stock medicines are found", async () => {

            // Arrange
            batchModel.getLowStockMedicines
                .mockResolvedValue([]);

            // Act
            const result =
                await batchService.getLowStockMedicines();

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "No low stock medicines found."
            );
        });


        test("should return Critical severity when available stock is zero", async () => {

            // Arrange
            const medicines = [
                {
                    medicine_id: 1,
                    medicine_name: "Paracetamol",
                    available_stock: 0
                }
            ];

            batchModel.getLowStockMedicines
                .mockResolvedValue(medicines);

            // Act
            const result =
                await batchService.getLowStockMedicines();

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Low stock medicines retrieved successfully."
            );
            expect(result.data).toEqual([
                {
                    medicine_id: 1,
                    medicine_name: "Paracetamol",
                    available_stock: 0,
                    severity: "Critical"
                }
            ]);
        });


        test("should return Warning severity when available stock is greater than zero", async () => {

            // Arrange
            const medicines = [
                {
                    medicine_id: 2,
                    medicine_name: "Amoxicillin",
                    available_stock: 5
                }
            ];

            batchModel.getLowStockMedicines
                .mockResolvedValue(medicines);

            // Act
            const result =
                await batchService.getLowStockMedicines();

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Low stock medicines retrieved successfully."
            );
            expect(result.data).toEqual([
                {
                    medicine_id: 2,
                    medicine_name: "Amoxicillin",
                    available_stock: 5,
                    severity: "Warning"
                }
            ]);
        });

    });


    // =========================================================
    // updateBatch
    // =========================================================

    describe("updateBatch", () => {

        test("should return 404 when batch does not exist", async () => {

            // Arrange
            batchModel.getBatchById.mockResolvedValue(null);

            const batch = {
                batch_number: "B002",
                purchase_price: 50,
                selling_price: 60,
                expiry_date: "2030-12-31"
            };

            // Act
            const result =
                await batchService.updateBatch(1, batch);

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe("Batch not found.");
        });


        test("should return 400 when batch is inactive", async () => {

            // Arrange
            batchModel.getBatchById.mockResolvedValue({
                batch_id: 1,
                medicine_id: 10,
                is_active: 0
            });

            const batch = {
                batch_number: "B002",
                purchase_price: 50,
                selling_price: 60,
                expiry_date: "2030-12-31"
            };

            // Act
            const result =
                await batchService.updateBatch(1, batch);

            // Assert
            expect(result.status).toBe(400);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Cannot update an inactive batch."
            );
        });


        test("should return 400 when selling price is less than purchase price", async () => {

            // Arrange
            batchModel.getBatchById.mockResolvedValue({
                batch_id: 1,
                medicine_id: 10,
                is_active: 1
            });

            const batch = {
                batch_number: "B002",
                purchase_price: 100,
                selling_price: 80,
                expiry_date: "2030-12-31"
            };

            // Act
            const result =
                await batchService.updateBatch(1, batch);

            // Assert
            expect(result.status).toBe(400);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Selling price cannot be less than purchase price."
            );
        });


        test("should return 400 when expiry date is not in the future", async () => {

            // Arrange
            batchModel.getBatchById.mockResolvedValue({
                batch_id: 1,
                medicine_id: 10,
                is_active: 1
            });

            const batch = {
                batch_number: "B002",
                purchase_price: 50,
                selling_price: 60,
                expiry_date: "2020-01-01"
            };

            // Act
            const result =
                await batchService.updateBatch(1, batch);

            // Assert
            expect(result.status).toBe(400);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Expiry date must be a future date."
            );
        });


        test("should return 409 when another batch has the same batch number", async () => {

            // Arrange
            batchModel.getBatchById.mockResolvedValue({
                batch_id: 1,
                medicine_id: 10,
                is_active: 1
            });

            batchModel.getBatchByMedicineIdAndBatchNumber
                .mockResolvedValue({
                    batch_id: 2,
                    batch_number: "B002"
                });

            const batch = {
                batch_number: "B002",
                purchase_price: 50,
                selling_price: 60,
                expiry_date: "2030-12-31"
            };

            // Act
            const result =
                await batchService.updateBatch(1, batch);

            // Assert
            expect(result.status).toBe(409);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Batch number already exists for this medicine."
            );
        });


        test("should update batch successfully", async () => {

            // Arrange
            batchModel.getBatchById.mockResolvedValue({
                batch_id: 1,
                medicine_id: 10,
                is_active: 1
            });

            batchModel.getBatchByMedicineIdAndBatchNumber
                .mockResolvedValue(null);

            batchModel.updateBatch.mockResolvedValue();

            const batch = {
                batch_number: "B002",
                purchase_price: 50,
                selling_price: 60,
                expiry_date: "2030-12-31"
            };

            // Act
            const result =
                await batchService.updateBatch(1, batch);

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Batch updated successfully."
            );
        });

    });


    // =========================================================
    // updateBatchStock
    // =========================================================

    describe("updateBatchStock", () => {

        test("should return 404 when batch does not exist", async () => {

            // Arrange
            batchModel.getBatchById.mockResolvedValue(null);

            // Act
            const result =
                await batchService.updateBatchStock(1, 10);

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe("Batch not found.");
        });


        test("should return 400 when batch is inactive", async () => {

            // Arrange
            batchModel.getBatchById.mockResolvedValue({
                batch_id: 1,
                is_active: 0,
                stock_quantity: 50
            });

            // Act
            const result =
                await batchService.updateBatchStock(1, 10);

            // Assert
            expect(result.status).toBe(400);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Cannot update an inactive batch."
            );
        });


        test("should return 400 when updated stock becomes negative", async () => {

            // Arrange
            batchModel.getBatchById.mockResolvedValue({
                batch_id: 1,
                is_active: 1,
                stock_quantity: 10
            });

            // Act
            const result =
                await batchService.updateBatchStock(1, -20);

            // Assert
            expect(result.status).toBe(400);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Insufficient stock."
            );
        });


        test("should update batch stock successfully", async () => {

            // Arrange
            batchModel.getBatchById.mockResolvedValue({
                batch_id: 1,
                is_active: 1,
                stock_quantity: 10
            });

            batchModel.updateBatchStock.mockResolvedValue();

            // Act
            const result =
                await batchService.updateBatchStock(1, 20);

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Batch stock updated successfully."
            );
        });

    });


    // =========================================================
    // deactivateBatch
    // =========================================================

    describe("deactivateBatch", () => {

        test("should return 404 when batch does not exist", async () => {

            // Arrange
            batchModel.getBatchById.mockResolvedValue(null);

            // Act
            const result =
                await batchService.deactivateBatch(1);

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe("Batch not found.");
        });


        test("should return 400 when batch is already inactive", async () => {

            // Arrange
            batchModel.getBatchById.mockResolvedValue({
                batch_id: 1,
                is_active: 0
            });

            // Act
            const result =
                await batchService.deactivateBatch(1);

            // Assert
            expect(result.status).toBe(400);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Batch is already inactive."
            );
        });


        test("should deactivate batch successfully", async () => {

            // Arrange
            batchModel.getBatchById.mockResolvedValue({
                batch_id: 1,
                is_active: 1
            });

            batchModel.deactivateBatch.mockResolvedValue();

            // Act
            const result =
                await batchService.deactivateBatch(1);

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Batch deactivated successfully."
            );
        });

    });


    // =========================================================
    // restoreBatch
    // =========================================================

    describe("restoreBatch", () => {

        test("should return 404 when batch does not exist", async () => {

            // Arrange
            batchModel.getBatchById.mockResolvedValue(null);

            // Act
            const result =
                await batchService.restoreBatch(1);

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe("Batch not found.");
        });


        test("should return 400 when batch is already active", async () => {

            // Arrange
            batchModel.getBatchById.mockResolvedValue({
                batch_id: 1,
                is_active: 1
            });

            // Act
            const result =
                await batchService.restoreBatch(1);

            // Assert
            expect(result.status).toBe(400);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Batch is already active."
            );
        });


        test("should restore batch successfully", async () => {

            // Arrange
            batchModel.getBatchById.mockResolvedValue({
                batch_id: 1,
                is_active: 0
            });

            batchModel.restoreBatch.mockResolvedValue();

            // Act
            const result =
                await batchService.restoreBatch(1);

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Batch restored successfully."
            );
        });

    });

});