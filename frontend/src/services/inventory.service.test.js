
import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
} from "vitest";

import {
  getAvailableInventory,
  getLowStock,
} from "./inventory.service";

// ============================================
// MOCK REQUEST FUNCTION
// ============================================

const mockRequest = vi.fn();

// ============================================
// TEST DATA
// ============================================

function createMedicine(overrides = {}) {
  return {
    medicine_id: 8,
    medicine_name: "Paracetamol",
    manufacturer_id: 3,
    manufacturer_name: "ABC Pharma",
    category: "Tablet",
    reorder_level: "20",
    available_stock: "14",
    batches: [
      {
        batch_id: "20",
        batch_number: "PAR-LATE",
        selling_price: "30.50",
        stock_quantity: "7",
        expiry_date: "2027-09-02",
        days_to_expire: "20",
      },
      {
        batch_id: "9",
        batch_number: "PAR-EARLY-9",
        selling_price: "25.75",
        stock_quantity: "4",
        expiry_date: "2027-08-18",
        days_to_expire: "5",
      },
      {
        batch_id: "4",
        batch_number: "PAR-EARLY-4",
        selling_price: "24.25",
        stock_quantity: "3",
        expiry_date: "2027-08-18",
        days_to_expire: "5",
      },
    ],
    ...overrides,
  };
}

function createLowStockMedicine(overrides = {}) {
  return {
    medicine_id: 8,
    medicine_name: "Paracetamol",
    manufacturer_id: 3,
    manufacturer_name: "ABC Pharma",
    category: "Tablet",
    reorder_level: "20",
    available_stock: "14",
    ...overrides,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function mockSuccess(data) {
  mockRequest.mockResolvedValueOnce({
    success: true,
    data,
  });
}

function createApiError(message, status = 500) {
  return Object.assign(new Error(message), {
    status,
  });
}

function mockFailure(message, status = 500) {
  const error = createApiError(message, status);

  mockRequest.mockRejectedValueOnce(error);

  return error;
}

beforeEach(() => {
  mockRequest.mockReset();
});

// ============================================
// 1. AVAILABLE INVENTORY TESTS
// ============================================

describe("getAvailableInventory", () => {
  // ==========================================
  // 1. API ENDPOINT
  // ==========================================

  test("calls the correct inventory API endpoint", async () => {
    mockSuccess([]);

    await getAvailableInventory(mockRequest);

    expect(mockRequest).toHaveBeenCalledWith(
      "/batches/inventory"
    );

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 2. MEDICINE DATA
  // ==========================================

  test("returns normalized medicine information", async () => {
    mockSuccess([createMedicine()]);

    const result = await getAvailableInventory(
      mockRequest
    );

    expect(result).toHaveLength(1);

    expect(result[0]).toMatchObject({
      medicine_id: 8,
      medicine_name: "Paracetamol",
      manufacturer_id: 3,
      manufacturer_name: "ABC Pharma",
      category: "Tablet",
      reorder_level: 20,
      available_stock: 14,
    });
  });

  // ==========================================
  // 3. NUMERIC MEDICINE FIELDS
  // ==========================================

  test("converts medicine stock fields into numbers", async () => {
    mockSuccess([createMedicine()]);

    const result = await getAvailableInventory(
      mockRequest
    );

    expect(
      typeof result[0].reorder_level
    ).toBe("number");

    expect(
      typeof result[0].available_stock
    ).toBe("number");

    expect(result[0].reorder_level).toBe(20);
    expect(result[0].available_stock).toBe(14);
  });

  // ==========================================
  // 4. BATCH NORMALIZATION
  // ==========================================

  test("converts batch numeric fields", async () => {
    mockSuccess([createMedicine()]);

    const result = await getAvailableInventory(
      mockRequest
    );

    const firstBatch = result[0].batches[0];

    expect(firstBatch).toMatchObject({
      batch_id: "4",
      batch_number: "PAR-EARLY-4",
      selling_price: 24.25,
      stock_quantity: 3,
      expiry_date: "2027-08-18",
      days_to_expire: 5,
    });

    expect(
      typeof firstBatch.selling_price
    ).toBe("number");

    expect(
      typeof firstBatch.stock_quantity
    ).toBe("number");

    expect(
      typeof firstBatch.days_to_expire
    ).toBe("number");
  });

  // ==========================================
  // 5. SORTING BY EXPIRY
  // ==========================================

  test("sorts batches by days to expiry ascending", async () => {
    mockSuccess([createMedicine()]);

    const result = await getAvailableInventory(
      mockRequest
    );

    expect(
      result[0].batches.map(
        (batch) => batch.days_to_expire
      )
    ).toEqual([5, 5, 20]);
  });

  // ==========================================
  // 6. BATCH ID TIE-BREAKER
  // ==========================================

  test("sorts batches with equal expiry by numeric batch ID", async () => {
    mockSuccess([createMedicine()]);

    const result = await getAvailableInventory(
      mockRequest
    );

    expect(
      result[0].batches.map(
        (batch) => batch.batch_id
      )
    ).toEqual(["4", "9", "20"]);
  });

  // ==========================================
  // 7. EARLIEST EXPIRY DAYS
  // ==========================================

  test("calculates earliest expiry days", async () => {
    mockSuccess([createMedicine()]);

    const result = await getAvailableInventory(
      mockRequest
    );

    expect(
      result[0].earliest_expiry_days
    ).toBe(5);
  });

  // ==========================================
  // 8. EARLIEST EXPIRY DATE
  // ==========================================

  test("returns earliest batch expiry date", async () => {
    mockSuccess([createMedicine()]);

    const result = await getAvailableInventory(
      mockRequest
    );

    expect(
      result[0].earliest_expiry_date
    ).toBe("2027-08-18");
  });

  // ==========================================
  // 9. EMPTY BATCHES
  // ==========================================

  test("handles medicines without batches", async () => {
    mockSuccess([
      createMedicine({
        batches: [],
      }),
    ]);

    const result = await getAvailableInventory(
      mockRequest
    );

    expect(result[0].batches).toEqual([]);

    expect(
      result[0].earliest_expiry_days
    ).toBeNull();

    expect(
      result[0].earliest_expiry_date
    ).toBeNull();
  });

  // ==========================================
  // 10. MISSING EXPIRY DATE
  // ==========================================

  test("uses null for missing earliest expiry date", async () => {
    mockSuccess([
      createMedicine({
        batches: [
          {
            batch_id: 1,
            batch_number: "B-1",
            selling_price: "10",
            stock_quantity: "5",
            days_to_expire: "3",
          },
        ],
      }),
    ]);

    const result = await getAvailableInventory(
      mockRequest
    );

    expect(
      result[0].earliest_expiry_days
    ).toBe(3);

    expect(
      result[0].earliest_expiry_date
    ).toBeNull();
  });

  // ==========================================
  // 11. EXPIRED BATCHES
  // ==========================================

  test("keeps expired batches and sorts them first", async () => {
    mockSuccess([
      createMedicine({
        batches: [
          {
            batch_id: 1,
            batch_number: "VALID",
            selling_price: "10",
            stock_quantity: "5",
            expiry_date: "2027-01-20",
            days_to_expire: "12",
          },
          {
            batch_id: 2,
            batch_number: "EXPIRED",
            selling_price: "8",
            stock_quantity: "2",
            expiry_date: "2026-12-20",
            days_to_expire: "-4",
          },
        ],
      }),
    ]);

    const result = await getAvailableInventory(
      mockRequest
    );

    expect(
      result[0].batches.map(
        (batch) => batch.batch_number
      )
    ).toEqual(["EXPIRED", "VALID"]);

    expect(
      result[0].earliest_expiry_days
    ).toBe(-4);
  });

  // ==========================================
  // 12. ZERO STOCK
  // ==========================================

  test("converts zero stock to numeric zero", async () => {
    mockSuccess([
      createMedicine({
        available_stock: "0",
        batches: [],
      }),
    ]);

    const result = await getAvailableInventory(
      mockRequest
    );

    expect(
      result[0].available_stock
    ).toBe(0);
  });

  // ==========================================
  // 13. ZERO BATCH STOCK
  // ==========================================

  test("converts zero batch quantity correctly", async () => {
    mockSuccess([
      createMedicine({
        batches: [
          {
            batch_id: 1,
            batch_number: "EMPTY",
            selling_price: "10",
            stock_quantity: "0",
            expiry_date: "2027-05-01",
            days_to_expire: "30",
          },
        ],
      }),
    ]);

    const result = await getAvailableInventory(
      mockRequest
    );

    expect(
      result[0].batches[0].stock_quantity
    ).toBe(0);
  });

  // ==========================================
  // 14. MULTIPLE MEDICINES
  // ==========================================

  test("handles multiple medicines independently", async () => {
    mockSuccess([
      createMedicine(),
      createMedicine({
        medicine_id: 9,
        medicine_name: "Ibuprofen",
        reorder_level: "10",
        available_stock: "6",
        batches: [],
      }),
    ]);

    const result = await getAvailableInventory(
      mockRequest
    );

    expect(result).toHaveLength(2);

    expect(result[0].medicine_name).toBe(
      "Paracetamol"
    );

    expect(result[1].medicine_name).toBe(
      "Ibuprofen"
    );

    expect(
      result[0].earliest_expiry_days
    ).toBe(5);

    expect(
      result[1].earliest_expiry_days
    ).toBeNull();
  });

  // ==========================================
  // 15. MEDICINE ORDER
  // ==========================================

  test("preserves medicine order returned by API", async () => {
    mockSuccess([
      createMedicine({
        medicine_id: 2,
        medicine_name: "Zinc",
      }),
      createMedicine({
        medicine_id: 1,
        medicine_name: "Aspirin",
      }),
    ]);

    const result = await getAvailableInventory(
      mockRequest
    );

    expect(
      result.map((item) => item.medicine_name)
    ).toEqual(["Zinc", "Aspirin"]);
  });

  // ==========================================
  // 16. INPUT IMMUTABILITY
  // ==========================================

  test("does not mutate original API batch order", async () => {
    const medicine = createMedicine();

    const originalOrder = medicine.batches.map(
      (batch) => batch.batch_id
    );

    mockSuccess([medicine]);

    await getAvailableInventory(mockRequest);

    expect(
      medicine.batches.map(
        (batch) => batch.batch_id
      )
    ).toEqual(originalOrder);
  });

  // ==========================================
  // 17. EMPTY INVENTORY
  // ==========================================

  test("returns empty array when inventory list is empty", async () => {
    mockSuccess([]);

    const result = await getAvailableInventory(
      mockRequest
    );

    expect(result).toEqual([]);
  });

  // ==========================================
  // 18-21. INVALID INVENTORY RESPONSES
  // ==========================================

  test.each([
    ["missing data", undefined],
    ["null data", null],
    ["object data", {}],
    ["string data", "invalid"],
  ])(
    "rejects %s",
    async (_description, data) => {
      mockSuccess(data);

      await expect(
        getAvailableInventory(mockRequest)
      ).rejects.toThrow(
        "The server returned an invalid inventory list."
      );
    }
  );

  // ==========================================
  // 22-25. INVALID BATCH LISTS
  // ==========================================

  test.each([
    ["missing batches", undefined],
    ["null batches", null],
    ["object batches", {}],
    ["string batches", "invalid"],
  ])(
    "rejects %s",
    async (_description, batches) => {
      mockSuccess([
        createMedicine({ batches }),
      ]);

      await expect(
        getAvailableInventory(mockRequest)
      ).rejects.toThrow(
        "The server returned invalid inventory batches."
      );
    }
  );

  // ==========================================
  // 26. EXPECTED 404
  // ==========================================

  test("returns empty array for expected no-inventory 404", async () => {
    mockFailure(
      "No inventory found.",
      404
    );

    const result = await getAvailableInventory(
      mockRequest
    );

    expect(result).toEqual([]);
  });

  // ==========================================
  // 27. UNEXPECTED 404
  // ==========================================

  test("rethrows unexpected HTTP 404 errors", async () => {
    const error = mockFailure(
      "Resource not found.",
      404
    );

    await expect(
      getAvailableInventory(mockRequest)
    ).rejects.toBe(error);
  });

  // ==========================================
  // 28. SERVER ERROR
  // ==========================================

  test("rethrows HTTP 500 errors", async () => {
    const error = mockFailure(
      "Database unavailable.",
      500
    );

    await expect(
      getAvailableInventory(mockRequest)
    ).rejects.toBe(error);
  });

  // ==========================================
  // 29. AUTHENTICATION ERROR
  // ==========================================

  test("rethrows HTTP 401 errors", async () => {
    const error = mockFailure(
      "Please sign in again.",
      401
    );

    await expect(
      getAvailableInventory(mockRequest)
    ).rejects.toBe(error);
  });
});

// ============================================
// 2. LOW STOCK TESTS
// ============================================

describe("getLowStock", () => {
  // ==========================================
  // 30. API ENDPOINT
  // ==========================================

  test("calls correct low-stock API endpoint", async () => {
    mockSuccess([]);

    await getLowStock(mockRequest);

    expect(mockRequest).toHaveBeenCalledWith(
      "/batches/low-stock"
    );

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 31. MEDICINE NORMALIZATION
  // ==========================================

  test("normalizes low-stock medicine information", async () => {
    mockSuccess([
      createLowStockMedicine(),
    ]);

    const result = await getLowStock(
      mockRequest
    );

    expect(result).toEqual([
      {
        medicine_id: 8,
        medicine_name: "Paracetamol",
        manufacturer_id: 3,
        manufacturer_name: "ABC Pharma",
        category: "Tablet",
        reorder_level: 20,
        available_stock: 14,
        stock_status: "Low stock",
        units_to_threshold: 6,
      },
    ]);
  });

  // ==========================================
  // 32. LOW STOCK STATUS
  // ==========================================

  test("labels positive stock as Low stock", async () => {
    mockSuccess([
      createLowStockMedicine({
        available_stock: "5",
      }),
    ]);

    const result = await getLowStock(
      mockRequest
    );

    expect(result[0].stock_status).toBe(
      "Low stock"
    );
  });

  // ==========================================
  // 33. OUT-OF-STOCK STATUS
  // ==========================================

  test("labels zero stock as Out of stock", async () => {
    mockSuccess([
      createLowStockMedicine({
        available_stock: "0",
      }),
    ]);

    const result = await getLowStock(
      mockRequest
    );

    expect(result[0].stock_status).toBe(
      "Out of stock"
    );

    expect(result[0].available_stock).toBe(0);
  });

  // ==========================================
  // 34. UNITS TO THRESHOLD
  // ==========================================

  test("calculates units required to reach reorder level", async () => {
    mockSuccess([
      createLowStockMedicine({
        reorder_level: "25",
        available_stock: "10",
      }),
    ]);

    const result = await getLowStock(
      mockRequest
    );

    expect(
      result[0].units_to_threshold
    ).toBe(15);
  });

  // ==========================================
  // 35. ZERO AVAILABLE STOCK
  // ==========================================

  test("requires full reorder amount when stock is zero", async () => {
    mockSuccess([
      createLowStockMedicine({
        reorder_level: "30",
        available_stock: "0",
      }),
    ]);

    const result = await getLowStock(
      mockRequest
    );

    expect(
      result[0].units_to_threshold
    ).toBe(30);
  });

  // ==========================================
  // 36. STOCK EQUALS THRESHOLD
  // ==========================================

  test("returns zero units when stock equals reorder level", async () => {
    mockSuccess([
      createLowStockMedicine({
        reorder_level: "15",
        available_stock: "15",
      }),
    ]);

    const result = await getLowStock(
      mockRequest
    );

    expect(
      result[0].units_to_threshold
    ).toBe(0);
  });

  // ==========================================
  // 37. STOCK ABOVE THRESHOLD
  // ==========================================

  test("never returns negative units to threshold", async () => {
    mockSuccess([
      createLowStockMedicine({
        reorder_level: "10",
        available_stock: "25",
      }),
    ]);

    const result = await getLowStock(
      mockRequest
    );

    expect(
      result[0].units_to_threshold
    ).toBe(0);
  });

  // ==========================================
  // 38. FRACTIONAL VALUES
  // ==========================================

  test("supports numeric decimal values", async () => {
    mockSuccess([
      createLowStockMedicine({
        reorder_level: "10.5",
        available_stock: "3.5",
      }),
    ]);

    const result = await getLowStock(
      mockRequest
    );

    expect(
      result[0].units_to_threshold
    ).toBe(7);
  });

  // ==========================================
  // 39. NEGATIVE STOCK
  // ==========================================

  test("calculates threshold for negative stock without changing service rules", async () => {
    mockSuccess([
      createLowStockMedicine({
        reorder_level: "10",
        available_stock: "-2",
      }),
    ]);

    const result = await getLowStock(
      mockRequest
    );

    // The current implementation checks
    // stock === 0 for Out of stock.
    expect(result[0].stock_status).toBe(
      "Low stock"
    );

    expect(
      result[0].units_to_threshold
    ).toBe(12);
  });

  // ==========================================
  // 40. MULTIPLE MEDICINES
  // ==========================================

  test("calculates status separately for multiple medicines", async () => {
    mockSuccess([
      createLowStockMedicine({
        medicine_id: 1,
        medicine_name: "Paracetamol",
        reorder_level: "20",
        available_stock: "5",
      }),
      createLowStockMedicine({
        medicine_id: 2,
        medicine_name: "Insulin",
        reorder_level: "10",
        available_stock: "0",
      }),
    ]);

    const result = await getLowStock(
      mockRequest
    );

    expect(result).toHaveLength(2);

    expect(result[0]).toMatchObject({
      medicine_name: "Paracetamol",
      stock_status: "Low stock",
      units_to_threshold: 15,
    });

    expect(result[1]).toMatchObject({
      medicine_name: "Insulin",
      stock_status: "Out of stock",
      units_to_threshold: 10,
    });
  });

  // ==========================================
  // 41. PRESERVE MEDICINE ORDER
  // ==========================================

  test("preserves API medicine order", async () => {
    mockSuccess([
      createLowStockMedicine({
        medicine_name: "Zinc",
      }),
      createLowStockMedicine({
        medicine_name: "Aspirin",
      }),
    ]);

    const result = await getLowStock(
      mockRequest
    );

    expect(
      result.map((item) => item.medicine_name)
    ).toEqual(["Zinc", "Aspirin"]);
  });

  // ==========================================
  // 42. EMPTY LOW-STOCK LIST
  // ==========================================

  test("returns empty array when no low-stock medicines exist", async () => {
    mockSuccess([]);

    const result = await getLowStock(
      mockRequest
    );

    expect(result).toEqual([]);
  });

  // ==========================================
  // 43-46. INVALID RESPONSES
  // ==========================================

  test.each([
    ["missing data", undefined],
    ["null data", null],
    ["object data", {}],
    ["string data", "invalid"],
  ])(
    "rejects %s",
    async (_description, data) => {
      mockSuccess(data);

      await expect(
        getLowStock(mockRequest)
      ).rejects.toThrow(
        "The server returned an invalid low-stock list."
      );
    }
  );

  // ==========================================
  // 47. EXPECTED LOW-STOCK 404
  // ==========================================

  test("returns empty array for expected no-low-stock 404", async () => {
    mockFailure(
      "No low stock medicines found.",
      404
    );

    const result = await getLowStock(
      mockRequest
    );

    expect(result).toEqual([]);
  });

  // ==========================================
  // 48. UNEXPECTED 404
  // ==========================================

  test("rethrows unexpected HTTP 404 errors", async () => {
    const error = mockFailure(
      "Medicine not found.",
      404
    );

    await expect(
      getLowStock(mockRequest)
    ).rejects.toBe(error);
  });

  // ==========================================
  // 49. SERVER ERROR
  // ==========================================

  test("rethrows HTTP 500 errors", async () => {
    const error = mockFailure(
      "Internal server error.",
      500
    );

    await expect(
      getLowStock(mockRequest)
    ).rejects.toBe(error);
  });

  // ==========================================
  // 50. AUTHENTICATION ERROR
  // ==========================================

  test("rethrows HTTP 401 errors", async () => {
    const error = mockFailure(
      "Unauthorized.",
      401
    );

    await expect(
      getLowStock(mockRequest)
    ).rejects.toBe(error);
  });
});
