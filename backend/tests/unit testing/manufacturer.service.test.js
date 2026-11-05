const manufacturerService = require("../../services/manufacturer.service");

jest.mock("../../models/manufacturer.model");

const manufacturerModel = require("../../models/manufacturer.model");


describe("Manufacturer Service", () => {

    // =========================================================
    // ADD MANUFACTURER
    // =========================================================

    describe("addManufacturer", () => {

        test("should return 409 when manufacturer already exists", async () => {

            // Arrange
            manufacturerModel.getManufacturerByName.mockResolvedValue({
                manufacturer_id: 1,
                name: "Cipla",
                is_active: 1
            });

            // Act
            const result =
                await manufacturerService.addManufacturer("Cipla");

            // Assert
            expect(result.status).toBe(409);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Manufacturer already exists."
            );
        });


        test("should return 409 when existing manufacturer is inactive", async () => {

            // Arrange
            manufacturerModel.getManufacturerByName.mockResolvedValue({
                manufacturer_id: 1,
                name: "Cipla",
                is_active: 0
            });

            // Act
            const result =
                await manufacturerService.addManufacturer("Cipla");

            // Assert
            expect(result.status).toBe(409);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Manufacturer is inactive. Do you want to restore it?"
            );

            expect(result.data).toEqual({
                requiresConfirmation: true,
                manufacturerId: 1
            });
        });


        test("should add manufacturer successfully", async () => {

            // Arrange
            manufacturerModel.getManufacturerByName.mockResolvedValue(null);

            manufacturerModel.createManufacturer.mockResolvedValue(10);

            // Act
            const result =
                await manufacturerService.addManufacturer("Cipla");

            // Assert
            expect(result.status).toBe(201);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Manufacturer added successfully."
            );

            expect(result.data).toEqual({
                manufacturerId: 10
            });
        });

    });



    // =========================================================
    // GET ALL MANUFACTURERS
    // =========================================================

    describe("getAllManufacturers", () => {

        test("should return 404 when no manufacturers are found", async () => {

            // Arrange
            manufacturerModel.getAllManufacturers.mockResolvedValue([]);

            // Act
            const result =
                await manufacturerService.getAllManufacturers();

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "No manufacturers found."
            );
        });


        test("should return 200 with manufacturers when manufacturers exist", async () => {

            // Arrange
            const manufacturers = [
                {
                    manufacturer_id: 1,
                    name: "Cipla",
                    is_active: 1
                },
                {
                    manufacturer_id: 2,
                    name: "Sun Pharma",
                    is_active: 1
                }
            ];

            manufacturerModel.getAllManufacturers
                .mockResolvedValue(manufacturers);

            // Act
            const result =
                await manufacturerService.getAllManufacturers();

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Manufacturers retrieved successfully."
            );
            expect(result.data).toEqual(manufacturers);
        });

    });



    // =========================================================
    // GET MANUFACTURER BY ID
    // =========================================================

    describe("getManufacturerById", () => {

        test("should return 404 when manufacturer does not exist", async () => {

            // Arrange
            manufacturerModel.getManufacturerById
                .mockResolvedValue(null);

            // Act
            const result =
                await manufacturerService.getManufacturerById(999);

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Manufacturer not found."
            );
        });


        test("should return 200 when manufacturer exists", async () => {

            // Arrange
            const manufacturer = {
                manufacturer_id: 1,
                name: "Cipla",
                is_active: 1
            };

            manufacturerModel.getManufacturerById
                .mockResolvedValue(manufacturer);

            // Act
            const result =
                await manufacturerService.getManufacturerById(1);

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Manufacturer retrieved successfully."
            );
            expect(result.data).toEqual(manufacturer);
        });

    });



    // =========================================================
    // UPDATE MANUFACTURER
    // =========================================================

    describe("updateManufacturer", () => {

        test("should return 404 when manufacturer does not exist", async () => {

            // Arrange
            manufacturerModel.getManufacturerById
                .mockResolvedValue(null);

            // Act
            const result =
                await manufacturerService.updateManufacturer(
                    999,
                    "New Manufacturer"
                );

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Manufacturer not found."
            );
        });


        test("should return 409 when manufacturer is inactive", async () => {

            // Arrange
            manufacturerModel.getManufacturerById
                .mockResolvedValue({
                    manufacturer_id: 1,
                    name: "Cipla",
                    is_active: 0
                });

            // Act
            const result =
                await manufacturerService.updateManufacturer(
                    1,
                    "Cipla New"
                );

            // Assert
            expect(result.status).toBe(409);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Manufacturer is inactive. Restore it before updating."
            );
        });


        test("should return 409 when manufacturer name already exists", async () => {

            // Arrange
            manufacturerModel.getManufacturerById
                .mockResolvedValue({
                    manufacturer_id: 1,
                    name: "Cipla",
                    is_active: 1
                });

            manufacturerModel.getManufacturerByName
                .mockResolvedValue({
                    manufacturer_id: 2,
                    name: "Sun Pharma",
                    is_active: 1
                });

            // Act
            const result =
                await manufacturerService.updateManufacturer(
                    1,
                    "Sun Pharma"
                );

            // Assert
            expect(result.status).toBe(409);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Manufacturer already exists."
            );
        });


        test("should update manufacturer successfully", async () => {

            // Arrange
            manufacturerModel.getManufacturerById
                .mockResolvedValue({
                    manufacturer_id: 1,
                    name: "Cipla",
                    is_active: 1
                });

            manufacturerModel.getManufacturerByName
                .mockResolvedValue(null);

            manufacturerModel.updateManufacturer
                .mockResolvedValue(1);

            // Act
            const result =
                await manufacturerService.updateManufacturer(
                    1,
                    "Cipla New"
                );

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Manufacturer updated successfully."
            );
        });

    });



    // =========================================================
    // DEACTIVATE MANUFACTURER
    // =========================================================

    describe("deactivateManufacturer", () => {

        test("should return 404 when manufacturer does not exist", async () => {

            // Arrange
            manufacturerModel.getManufacturerById
                .mockResolvedValue(null);

            // Act
            const result =
                await manufacturerService.deactivateManufacturer(999);

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Manufacturer not found."
            );
        });


        test("should return 400 when manufacturer is already inactive", async () => {

            // Arrange
            manufacturerModel.getManufacturerById
                .mockResolvedValue({
                    manufacturer_id: 1,
                    name: "Cipla",
                    is_active: 0
                });

            // Act
            const result =
                await manufacturerService.deactivateManufacturer(1);

            // Assert
            expect(result.status).toBe(400);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Manufacturer is already inactive."
            );
        });


        test("should deactivate manufacturer successfully", async () => {

            // Arrange
            manufacturerModel.getManufacturerById
                .mockResolvedValue({
                    manufacturer_id: 1,
                    name: "Cipla",
                    is_active: 1
                });

            manufacturerModel.deactivateManufacturer
                .mockResolvedValue(1);

            // Act
            const result =
                await manufacturerService.deactivateManufacturer(1);

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Manufacturer deactivated successfully."
            );
        });

    });



    // =========================================================
    // RESTORE MANUFACTURER
    // =========================================================

    describe("restoreManufacturer", () => {

        test("should return 404 when manufacturer does not exist", async () => {

            // Arrange
            manufacturerModel.getManufacturerById
                .mockResolvedValue(null);

            // Act
            const result =
                await manufacturerService.restoreManufacturer(999);

            // Assert
            expect(result.status).toBe(404);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Manufacturer not found."
            );
        });


        test("should return 400 when manufacturer is already active", async () => {

            // Arrange
            manufacturerModel.getManufacturerById
                .mockResolvedValue({
                    manufacturer_id: 1,
                    name: "Cipla",
                    is_active: 1
                });

            // Act
            const result =
                await manufacturerService.restoreManufacturer(1);

            // Assert
            expect(result.status).toBe(400);
            expect(result.success).toBe(false);
            expect(result.message).toBe(
                "Manufacturer is already active."
            );
        });


        test("should restore manufacturer successfully", async () => {

            // Arrange
            manufacturerModel.getManufacturerById
                .mockResolvedValue({
                    manufacturer_id: 1,
                    name: "Cipla",
                    is_active: 0
                });

            manufacturerModel.restoreManufacturer
                .mockResolvedValue(1);

            // Act
            const result =
                await manufacturerService.restoreManufacturer(1);

            // Assert
            expect(result.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.message).toBe(
                "Manufacturer restored successfully."
            );
        });

    });

});