
import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
} from "vitest";

import {
  getBatchesByMedicine,
  getBatch,
  createBatch,
  updateBatch,
  adjustBatchStock,
  deactivateBatch,
  restoreBatch,
} from "./batch.service";

// ============================================
// MOCK API REQUEST
// ============================================

const mockRequest = vi.fn();

// ============================================
// TEST DATA
// ============================================

const rawBatch = {
  batch_id: 11,
  medicine_id: 3,
  batch_number: "PAR-101",
  purchase_price: "8.50",
  selling_price: "12.75",
  stock_quantity: "42",
  expiry_date: "2027-03-15",
  is_active: 1,
  created_at: "2026-05-01",
};

const batchValues = {
  batch_number: "  PAR-202  ",
  purchase_price: "9.50",
  selling_price: "15.75",
  stock_quantity: "100",
  expiry_date: "2027-12-31",
};

function mockBatchList(batches = [rawBatch]) {
  mockRequest.mockResolvedValueOnce({
    success: true,
    data: batches,
  });
}

function mockApiError(message, status = 404) {
  const error = Object.assign(
    new Error(message),
    { status }
  );

  mockRequest.mockRejectedValueOnce(error);

  return error;
}

beforeEach(() => {
  mockRequest.mockReset();
});

// ============================================
// 1. GET BATCHES BY MEDICINE
// ============================================

describe("getBatchesByMedicine", () => {
  test("calls the correct batches endpoint", async () => {
    mockBatchList();

    await getBatchesByMedicine(mockRequest, 3);

    expect(mockRequest).toHaveBeenCalledWith(
      "/batches/medicine/3"
    );

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  test("normalizes batch stock and active status", async () => {
    mockBatchList();

    const batches =
      await getBatchesByMedicine(
        mockRequest,
        3
      );

    expect(batches).toEqual([
      {
        batch_id: 11,
        medicine_id: 3,
        batch_number: "PAR-101",
        purchase_price: "8.50",
        selling_price: "12.75",
        stock_quantity: 42,
        expiry_date: "2027-03-15",
        is_active: true,
        created_at: "2026-05-01",
      },
    ]);

    expect(
      typeof batches[0].stock_quantity
    ).toBe("number");

    expect(
      typeof batches[0].is_active
    ).toBe("boolean");
  });

  test("preserves purchase and selling prices", async () => {
    mockBatchList();

    const batches =
      await getBatchesByMedicine(
        mockRequest,
        3
      );

    // Your current service does not convert
    // purchase_price or selling_price.
    expect(batches[0].purchase_price).toBe(
      "8.50"
    );

    expect(batches[0].selling_price).toBe(
      "12.75"
    );
  });

  test("returns empty array for empty batches list", async () => {
    mockBatchList([]);

    const result =
      await getBatchesByMedicine(
        mockRequest,
        3
      );

    expect(result).toEqual([]);
  });

  test("preserves the order of batches", async () => {
    mockBatchList([
      rawBatch,
      {
        ...rawBatch,
        batch_id: 12,
        batch_number: "PAR-102",
      },
    ]);

    const result =
      await getBatchesByMedicine(
        mockRequest,
        3
      );

    expect(result).toHaveLength(2);

    expect(
      result.map((batch) => batch.batch_id)
    ).toEqual([11, 12]);
  });

  test.each([
    [1, true],
    ["1", true],
    [true, true],
    [0, false],
    ["0", false],
    [2, false],
  ])(
    "converts is_active %s to %s",
    async (rawStatus, expectedStatus) => {
      mockBatchList([
        {
          ...rawBatch,
          is_active: rawStatus,
        },
      ]);

      const result =
        await getBatchesByMedicine(
          mockRequest,
          3
        );

      expect(result[0].is_active).toBe(
        expectedStatus
      );
    }
  );

  test.each([
    undefined,
    null,
    {},
    "invalid data",
  ])(
    "rejects invalid batch list: %s",
    async (data) => {
      mockRequest.mockResolvedValueOnce({
        data,
      });

      await expect(
        getBatchesByMedicine(
          mockRequest,
          3
        )
      ).rejects.toThrow(
        "The server returned an invalid batches list."
      );
    }
  );

  test("returns empty array for expected 404 no-batches response", async () => {
    mockApiError(
      "No batches found for this medicine.",
      404
    );

    const result =
      await getBatchesByMedicine(
        mockRequest,
        3
      );

    expect(result).toEqual([]);
  });

  test("rethrows 404 with a different message", async () => {
    const error = mockApiError(
      "Medicine not found.",
      404
    );

    await expect(
      getBatchesByMedicine(
        mockRequest,
        3
      )
    ).rejects.toBe(error);
  });

  test("rethrows unexpected API errors", async () => {
    const error = mockApiError(
      "Database unavailable.",
      500
    );

    await expect(
      getBatchesByMedicine(
        mockRequest,
        3
      )
    ).rejects.toBe(error);
  });
});

// ============================================
// 2. GET A SINGLE BATCH
// ============================================

describe("getBatch", () => {
  test("calls the correct endpoint", async () => {
    mockRequest.mockResolvedValueOnce({
      data: rawBatch,
    });

    await getBatch(mockRequest, 11);

    expect(mockRequest).toHaveBeenCalledWith(
      "/batches/11"
    );
  });

  test("returns normalized batch details", async () => {
    mockRequest.mockResolvedValueOnce({
      data: rawBatch,
    });

    const result =
      await getBatch(mockRequest, 11);

    expect(result).toMatchObject({
      batch_id: 11,
      medicine_id: 3,
      batch_number: "PAR-101",
      stock_quantity: 42,
      is_active: true,
    });
  });

  test.each([
    undefined,
    null,
    { batch_id: 0 },
    { batch_number: "PAR-101" },
  ])(
    "rejects invalid batch details: %s",
    async (data) => {
      mockRequest.mockResolvedValueOnce({
        data,
      });

      await expect(
        getBatch(mockRequest, 11)
      ).rejects.toThrow(
        "The server returned invalid batch details."
      );
    }
  );

  test("propagates API errors", async () => {
    const error = mockApiError(
      "Batch not found.",
      404
    );

    await expect(
      getBatch(mockRequest, 99)
    ).rejects.toBe(error);
  });
});

// ============================================
// 3. CREATE BATCH
// ============================================

describe("createBatch", () => {
  test("sends POST request with normalized batch values", async () => {
    mockRequest.mockResolvedValueOnce({
      success: true,
    });

    await createBatch(
      mockRequest,
      "3",
      batchValues
    );

    expect(mockRequest).toHaveBeenCalledWith(
      "/batches",
      {
        method: "POST",
        body: {
          batch_number: "PAR-202",
          purchase_price: 9.5,
          selling_price: 15.75,
          expiry_date: "2027-12-31",
          medicine_id: 3,
          stock_quantity: 100,
        },
      }
    );

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  test("returns the API response", async () => {
    const apiResponse = {
      success: true,
      message: "Batch created.",
      data: {
        batch_id: 15,
      },
    };

    mockRequest.mockResolvedValueOnce(
      apiResponse
    );

    const result = await createBatch(
      mockRequest,
      3,
      batchValues
    );

    expect(result).toBe(apiResponse);
  });

  test("propagates errors from API request", async () => {
    const error = mockApiError(
      "Duplicate batch number.",
      409
    );

    await expect(
      createBatch(
        mockRequest,
        3,
        batchValues
      )
    ).rejects.toBe(error);
  });
});

// ============================================
// 4. UPDATE BATCH
// ============================================

describe("updateBatch", () => {
  test("sends PUT request with normalized values", async () => {
    mockRequest.mockResolvedValueOnce({
      success: true,
    });

    await updateBatch(
      mockRequest,
      11,
      batchValues
    );

    expect(mockRequest).toHaveBeenCalledWith(
      "/batches/11",
      {
        method: "PUT",
        body: {
          batch_number: "PAR-202",
          purchase_price: 9.5,
          selling_price: 15.75,
          expiry_date: "2027-12-31",
        },
      }
    );
  });

  test("does not send medicine ID or stock during update", async () => {
    mockRequest.mockResolvedValueOnce({
      success: true,
    });

    await updateBatch(
      mockRequest,
      11,
      batchValues
    );

    const [, options] =
      mockRequest.mock.calls[0];

    expect(
      options.body
    ).not.toHaveProperty("medicine_id");

    expect(
      options.body
    ).not.toHaveProperty("stock_quantity");
  });

  test("returns the response from the API", async () => {
    const response = {
      success: true,
      message: "Batch updated.",
    };

    mockRequest.mockResolvedValueOnce(
      response
    );

    const result = await updateBatch(
      mockRequest,
      11,
      batchValues
    );

    expect(result).toBe(response);
  });

  test("propagates API errors", async () => {
    const error = mockApiError(
      "Batch cannot be updated.",
      400
    );

    await expect(
      updateBatch(
        mockRequest,
        11,
        batchValues
      )
    ).rejects.toBe(error);
  });
});

// ============================================
// 5. ADJUST BATCH STOCK
// ============================================

describe("adjustBatchStock", () => {
  test("sends PATCH request to stock endpoint", async () => {
    mockRequest.mockResolvedValueOnce({
      success: true,
    });

    await adjustBatchStock(
      mockRequest,
      11,
      "25"
    );

    expect(mockRequest).toHaveBeenCalledWith(
      "/batches/11/stock",
      {
        method: "PATCH",
        body: {
          quantity: 25,
        },
      }
    );
  });

  test.each([
    ["10", 10],
    ["-5", -5],
    ["0", 0],
    ["2.5", 2.5],
  ])(
    "converts quantity %s to number %s",
    async (input, expected) => {
      mockRequest.mockResolvedValueOnce({
        success: true,
      });

      await adjustBatchStock(
        mockRequest,
        11,
        input
      );

      const [, options] =
        mockRequest.mock.calls[0];

      expect(options.body.quantity).toBe(
        expected
      );
    }
  );

  test("returns the API response", async () => {
    const response = {
      success: true,
      message: "Stock adjusted.",
    };

    mockRequest.mockResolvedValueOnce(
      response
    );

    const result = await adjustBatchStock(
      mockRequest,
      11,
      5
    );

    expect(result).toBe(response);
  });

  test("propagates stock adjustment errors", async () => {
    const error = mockApiError(
      "Insufficient stock.",
      400
    );

    await expect(
      adjustBatchStock(
        mockRequest,
        11,
        -100
      )
    ).rejects.toBe(error);
  });
});

// ============================================
// 6. DEACTIVATE BATCH
// ============================================

describe("deactivateBatch", () => {
  test("sends PATCH request to deactivate endpoint", async () => {
    mockRequest.mockResolvedValueOnce({
      success: true,
    });

    await deactivateBatch(
      mockRequest,
      11
    );

    expect(mockRequest).toHaveBeenCalledWith(
      "/batches/11/deactivate",
      {
        method: "PATCH",
      }
    );
  });

  test("returns the API response", async () => {
    const response = {
      success: true,
      message: "Batch deactivated.",
    };

    mockRequest.mockResolvedValueOnce(
      response
    );

    const result = await deactivateBatch(
      mockRequest,
      11
    );

    expect(result).toBe(response);
  });

  test("propagates deactivation errors", async () => {
    const error = mockApiError(
      "Batch already inactive.",
      409
    );

    await expect(
      deactivateBatch(
        mockRequest,
        11
      )
    ).rejects.toBe(error);
  });
});

// ============================================
// 7. RESTORE BATCH
// ============================================

describe("restoreBatch", () => {
  test("sends PATCH request to restore endpoint", async () => {
    mockRequest.mockResolvedValueOnce({
      success: true,
    });

    await restoreBatch(
      mockRequest,
      11
    );

    expect(mockRequest).toHaveBeenCalledWith(
      "/batches/11/restore",
      {
        method: "PATCH",
      }
    );
  });

  test("returns the API response", async () => {
    const response = {
      success: true,
      message: "Batch restored.",
    };

    mockRequest.mockResolvedValueOnce(
      response
    );

    const result = await restoreBatch(
      mockRequest,
      11
    );

    expect(result).toBe(response);
  });

  test("propagates restoration errors", async () => {
    const error = mockApiError(
      "Unable to restore batch.",
      500
    );

    await expect(
      restoreBatch(
        mockRequest,
        11
      )
    ).rejects.toBe(error);
  });
});
