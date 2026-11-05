
import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
} from "vitest";

import {
  MEDICINE_CATEGORIES,
  getMedicines,
  createMedicine,
  updateMedicine,
  deactivateMedicine,
  restoreMedicine,
} from "./medicine.service";

// ============================================
// MOCK REQUEST FUNCTION
// ============================================

const mockRequest = vi.fn();

// ============================================
// TEST DATA
// ============================================

const rawMedicine = {
  medicine_id: 10,
  name: "Paracetamol 500mg",
  manufacturer_id: 3,
  manufacturer: "ABC Pharma",
  manufacturer_is_active: "1",
  category: "Tablet",
  reorder_level: "20",
  created_at: "2026-10-01",
  medicine_is_active: 1,
};

const formValues = {
  name: "  Ibuprofen 400mg  ",
  manufacturer_id: "5",
  category: "Tablet",
  reorder_level: "30",
};

function mockList(data = [rawMedicine]) {
  mockRequest.mockResolvedValueOnce({
    success: true,
    data,
  });
}

function mockError(message, status = 500) {
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
// 1. MEDICINE CATEGORIES
// ============================================

describe("MEDICINE_CATEGORIES", () => {
  test("exports the supported categories", () => {
    expect(MEDICINE_CATEGORIES).toEqual([
      "Tablet",
      "Capsule",
      "Syrup",
      "Injection",
      "Ointment",
      "Drops",
      "Powder",
      "Other",
    ]);
  });
});

// ============================================
// 2. GET MEDICINES
// ============================================

describe("getMedicines", () => {
  test("calls the correct API endpoint", async () => {
    mockList();

    await getMedicines(mockRequest);

    expect(mockRequest).toHaveBeenCalledWith(
      "/medicines"
    );

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  test("returns normalized medicine data", async () => {
    mockList();

    const result = await getMedicines(
      mockRequest
    );

    expect(result).toEqual([
      {
        medicine_id: 10,
        name: "Paracetamol 500mg",
        manufacturer_id: 3,
        manufacturer: "ABC Pharma",
        manufacturer_is_active: true,
        category: "Tablet",
        reorder_level: 20,
        created_at: "2026-10-01",
        medicine_is_active: true,
      },
    ]);
  });

  test("converts reorder_level into a number", async () => {
    mockList();

    const result = await getMedicines(
      mockRequest
    );

    expect(result[0].reorder_level).toBe(20);

    expect(
      typeof result[0].reorder_level
    ).toBe("number");
  });

  test.each([
    ["20", 20],
    ["0", 0],
    ["12.5", 12.5],
  ])(
    "converts reorder_level %s to %s",
    async (input, expected) => {
      mockList([
        {
          ...rawMedicine,
          reorder_level: input,
        },
      ]);

      const result = await getMedicines(
        mockRequest
      );

      expect(
        result[0].reorder_level
      ).toBe(expected);
    }
  );

  test.each([
    [1, true],
    ["1", true],
    [true, true],
    [0, false],
    ["0", false],
    [2, false],
    ["true", false],
  ])(
    "normalizes medicine_is_active %s to %s",
    async (input, expected) => {
      mockList([
        {
          ...rawMedicine,
          medicine_is_active: input,
        },
      ]);

      const result = await getMedicines(
        mockRequest
      );

      expect(
        result[0].medicine_is_active
      ).toBe(expected);
    }
  );

  test.each([
    [1, true],
    ["1", true],
    [true, true],
    [0, false],
    ["0", false],
  ])(
    "normalizes manufacturer_is_active %s to %s",
    async (input, expected) => {
      mockList([
        {
          ...rawMedicine,
          manufacturer_is_active: input,
        },
      ]);

      const result = await getMedicines(
        mockRequest
      );

      expect(
        result[0].manufacturer_is_active
      ).toBe(expected);
    }
  );

  test("normalizes multiple medicines independently", async () => {
    mockList([
      rawMedicine,
      {
        ...rawMedicine,
        medicine_id: 11,
        name: "Amoxicillin",
        category: "Capsule",
        reorder_level: "10",
        medicine_is_active: 0,
        manufacturer_is_active: 0,
      },
    ]);

    const result = await getMedicines(
      mockRequest
    );

    expect(result).toHaveLength(2);

    expect(result[0]).toMatchObject({
      medicine_id: 10,
      medicine_is_active: true,
      manufacturer_is_active: true,
    });

    expect(result[1]).toMatchObject({
      medicine_id: 11,
      name: "Amoxicillin",
      category: "Capsule",
      reorder_level: 10,
      medicine_is_active: false,
      manufacturer_is_active: false,
    });
  });

  test("preserves order returned by API", async () => {
    mockList([
      {
        ...rawMedicine,
        medicine_id: 2,
        name: "Zinc",
      },
      {
        ...rawMedicine,
        medicine_id: 1,
        name: "Aspirin",
      },
    ]);

    const result = await getMedicines(
      mockRequest
    );

    expect(
      result.map((medicine) => medicine.name)
    ).toEqual(["Zinc", "Aspirin"]);
  });

  test("returns an empty array when no medicines exist", async () => {
    mockList([]);

    const result = await getMedicines(
      mockRequest
    );

    expect(result).toEqual([]);
  });

  
test.each([
  ["missing data", undefined],
  ["null data", null],
  ["object data", {}],
  ["string data", "invalid"],
])(
  "rejects %s",
  async (_description, data) => {
    // Set response directly to avoid
    // the mockList default parameter.
    mockRequest.mockResolvedValueOnce({
      success: true,
      data,
    });

    await expect(
      getMedicines(mockRequest)
    ).rejects.toThrow(
      "The server returned an invalid medicines list."
    );
  }
);


  test("returns empty array for expected no-medicines 404", async () => {
    mockError(
      "No medicines found.",
      404
    );

    const result = await getMedicines(
      mockRequest
    );

    expect(result).toEqual([]);
  });

  test("rethrows unexpected 404 errors", async () => {
    const error = mockError(
      "Resource not found.",
      404
    );

    await expect(
      getMedicines(mockRequest)
    ).rejects.toBe(error);
  });

  test("does not swallow matching message with different status", async () => {
    const error = mockError(
      "No medicines found.",
      500
    );

    await expect(
      getMedicines(mockRequest)
    ).rejects.toBe(error);
  });

  test("rethrows server errors", async () => {
    const error = mockError(
      "Database unavailable.",
      500
    );

    await expect(
      getMedicines(mockRequest)
    ).rejects.toBe(error);
  });
});

// ============================================
// 3. CREATE MEDICINE
// ============================================

describe("createMedicine", () => {
  test("sends POST request with normalized values", async () => {
    mockRequest.mockResolvedValue({
      success: true,
    });

    await createMedicine(
      mockRequest,
      formValues
    );

    expect(mockRequest).toHaveBeenCalledWith(
      "/medicines",
      {
        method: "POST",
        body: {
          name: "Ibuprofen 400mg",
          manufacturer_id: 5,
          category: "Tablet",
          reorder_level: 30,
        },
      }
    );

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  test("trims medicine name without changing case", async () => {
    mockRequest.mockResolvedValue({
      success: true,
    });

    await createMedicine(mockRequest, {
      ...formValues,
      name: "  paRaCETamol  ",
    });

    const [, options] =
      mockRequest.mock.calls[0];

    expect(options.body.name).toBe(
      "paRaCETamol"
    );
  });

  test("converts manufacturer ID to a number", async () => {
    mockRequest.mockResolvedValue({
      success: true,
    });

    await createMedicine(
      mockRequest,
      formValues
    );

    const [, options] =
      mockRequest.mock.calls[0];

    expect(
      options.body.manufacturer_id
    ).toBe(5);
  });

  test("converts reorder level to a number", async () => {
    mockRequest.mockResolvedValue({
      success: true,
    });

    await createMedicine(
      mockRequest,
      formValues
    );

    const [, options] =
      mockRequest.mock.calls[0];

    expect(
      options.body.reorder_level
    ).toBe(30);
  });

  test("preserves selected category", async () => {
    mockRequest.mockResolvedValue({
      success: true,
    });

    await createMedicine(mockRequest, {
      ...formValues,
      category: "Syrup",
    });

    const [, options] =
      mockRequest.mock.calls[0];

    expect(options.body.category).toBe(
      "Syrup"
    );
  });

  test("returns the API response", async () => {
    const response = {
      success: true,
      message: "Medicine created.",
      data: {
        medicine_id: 20,
      },
    };

    mockRequest.mockResolvedValue(response);

    const result = await createMedicine(
      mockRequest,
      formValues
    );

    expect(result).toBe(response);
  });

  test("propagates creation errors", async () => {
    const error = mockError(
      "Medicine already exists.",
      409
    );

    await expect(
      createMedicine(
        mockRequest,
        formValues
      )
    ).rejects.toBe(error);
  });
});

// ============================================
// 4. UPDATE MEDICINE
// ============================================

describe("updateMedicine", () => {
  test("sends PUT request to correct endpoint", async () => {
    mockRequest.mockResolvedValue({
      success: true,
    });

    await updateMedicine(
      mockRequest,
      10,
      formValues
    );

    expect(mockRequest).toHaveBeenCalledWith(
      "/medicines/10",
      {
        method: "PUT",
        body: {
          name: "Ibuprofen 400mg",
          manufacturer_id: 5,
          category: "Tablet",
          reorder_level: 30,
        },
      }
    );
  });

  test("uses the specified medicine ID", async () => {
    mockRequest.mockResolvedValue({
      success: true,
    });

    await updateMedicine(
      mockRequest,
      42,
      formValues
    );

    expect(
      mockRequest.mock.calls[0][0]
    ).toBe("/medicines/42");
  });

  test("does not include medicine ID or status in request body", async () => {
    mockRequest.mockResolvedValue({
      success: true,
    });

    await updateMedicine(
      mockRequest,
      10,
      {
        ...formValues,
        medicine_id: 99,
        medicine_is_active: 0,
      }
    );

    const [, options] =
      mockRequest.mock.calls[0];

    expect(options.body).not.toHaveProperty(
      "medicine_id"
    );

    expect(options.body).not.toHaveProperty(
      "medicine_is_active"
    );
  });

  test("returns the API response", async () => {
    const response = {
      success: true,
      message: "Medicine updated.",
    };

    mockRequest.mockResolvedValue(response);

    const result = await updateMedicine(
      mockRequest,
      10,
      formValues
    );

    expect(result).toBe(response);
  });

  test("propagates update errors", async () => {
    const error = mockError(
      "Medicine cannot be updated.",
      400
    );

    await expect(
      updateMedicine(
        mockRequest,
        10,
        formValues
      )
    ).rejects.toBe(error);
  });
});

// ============================================
// 5. DEACTIVATE MEDICINE
// ============================================

describe("deactivateMedicine", () => {
  test("sends PATCH request to deactivate endpoint", async () => {
    mockRequest.mockResolvedValue({
      success: true,
    });

    await deactivateMedicine(
      mockRequest,
      10
    );

    expect(mockRequest).toHaveBeenCalledWith(
      "/medicines/10/deactivate",
      {
        method: "PATCH",
      }
    );
  });

  test("returns API response", async () => {
    const response = {
      success: true,
      message: "Medicine deactivated.",
    };

    mockRequest.mockResolvedValue(response);

    const result = await deactivateMedicine(
      mockRequest,
      10
    );

    expect(result).toBe(response);
  });

  test("propagates deactivation errors", async () => {
    const error = mockError(
      "Medicine already inactive.",
      409
    );

    await expect(
      deactivateMedicine(
        mockRequest,
        10
      )
    ).rejects.toBe(error);
  });
});

// ============================================
// 6. RESTORE MEDICINE
// ============================================

describe("restoreMedicine", () => {
  test("sends PATCH request to restore endpoint", async () => {
    mockRequest.mockResolvedValue({
      success: true,
    });

    await restoreMedicine(
      mockRequest,
      10
    );

    expect(mockRequest).toHaveBeenCalledWith(
      "/medicines/10/restore",
      {
        method: "PATCH",
      }
    );
  });

  test("returns API response", async () => {
    const response = {
      success: true,
      message: "Medicine restored.",
    };

    mockRequest.mockResolvedValue(response);

    const result = await restoreMedicine(
      mockRequest,
      10
    );

    expect(result).toBe(response);
  });

  test("propagates restoration errors", async () => {
    const error = mockError(
      "Unable to restore medicine.",
      500
    );

    await expect(
      restoreMedicine(
        mockRequest,
        10
      )
    ).rejects.toBe(error);
  });
});
