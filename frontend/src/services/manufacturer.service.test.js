
import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
} from "vitest";

import {
  getManufacturers,
  createManufacturer,
  updateManufacturer,
  deactivateManufacturer,
  restoreManufacturer,
} from "./manufacturer.service";

// ============================================
// MOCK REQUEST FUNCTION
// ============================================

const mockRequest = vi.fn();

// ============================================
// TEST DATA
// ============================================

const rawManufacturer = {
  manufacturer_id: 5,
  name: "ABC Pharma",
  created_at: "2026-08-01",
  is_active: 1,
};

function mockList(data = [rawManufacturer]) {
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
// 1. GET MANUFACTURERS
// ============================================

describe("getManufacturers", () => {
  test("calls the correct API endpoint", async () => {
    mockList();

    await getManufacturers(mockRequest);

    expect(mockRequest).toHaveBeenCalledWith(
      "/manufacturers"
    );

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  test("returns normalized manufacturer data", async () => {
    mockList();

    const result = await getManufacturers(
      mockRequest
    );

    expect(result).toEqual([
      {
        manufacturer_id: 5,
        name: "ABC Pharma",
        created_at: "2026-08-01",
        is_active: true,
      },
    ]);
  });

 
test.each([
  ["missing data", undefined],
  ["null data", null],
  ["object data", {}],
  ["string data", "invalid"],
])(
  "rejects %s",
  async (_description, data) => {
    // Directly mock the API response.
    // This preserves undefined for missing data.
    mockRequest.mockResolvedValueOnce({
      success: true,
      data,
    });

    await expect(
      getManufacturers(mockRequest)
    ).rejects.toThrow(
      "The server returned an invalid manufacturers list."
    );
  }
);


  test("preserves manufacturer ID and name", async () => {
    mockList([
      {
        ...rawManufacturer,
        manufacturer_id: 42,
        name: "XYZ Laboratories",
      },
    ]);

    const result = await getManufacturers(
      mockRequest
    );

    expect(result[0].manufacturer_id).toBe(42);

    expect(result[0].name).toBe(
      "XYZ Laboratories"
    );
  });

  test("normalizes multiple manufacturers", async () => {
    mockList([
      rawManufacturer,
      {
        manufacturer_id: 6,
        name: "XYZ Pharma",
        created_at: "2026-09-01",
        is_active: "0",
      },
    ]);

    const result = await getManufacturers(
      mockRequest
    );

    expect(result).toHaveLength(2);

    expect(result[0].is_active).toBe(true);
    expect(result[1].is_active).toBe(false);
  });

  test("preserves manufacturer order from API", async () => {
    mockList([
      {
        ...rawManufacturer,
        name: "Zeta Pharma",
      },
      {
        ...rawManufacturer,
        manufacturer_id: 6,
        name: "Alpha Pharma",
      },
    ]);

    const result = await getManufacturers(
      mockRequest
    );

    expect(
      result.map(
        (manufacturer) => manufacturer.name
      )
    ).toEqual([
      "Zeta Pharma",
      "Alpha Pharma",
    ]);
  });

  test("returns empty array for empty manufacturer list", async () => {
    mockList([]);

    const result = await getManufacturers(
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
    mockRequest.mockResolvedValueOnce({
      success: true,
      data,
    });

    await expect(
      getManufacturers(mockRequest)
    ).rejects.toThrow(
      "The server returned an invalid manufacturers list."
    );
  }
);


  test("returns empty array for expected 404 response", async () => {
    mockError(
      "No manufacturers found.",
      404
    );

    const result = await getManufacturers(
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
      getManufacturers(mockRequest)
    ).rejects.toBe(error);
  });

  test("does not swallow matching message with status 500", async () => {
    const error = mockError(
      "No manufacturers found.",
      500
    );

    await expect(
      getManufacturers(mockRequest)
    ).rejects.toBe(error);
  });

  test("rethrows server errors", async () => {
    const error = mockError(
      "Internal server error.",
      500
    );

    await expect(
      getManufacturers(mockRequest)
    ).rejects.toBe(error);
  });
});

// ============================================
// 2. CREATE MANUFACTURER
// ============================================

describe("createManufacturer", () => {
  test("sends POST request to correct endpoint", async () => {
    mockRequest.mockResolvedValue({
      success: true,
    });

    await createManufacturer(
      mockRequest,
      "ABC Pharma"
    );

    expect(mockRequest).toHaveBeenCalledWith(
      "/manufacturers",
      {
        method: "POST",
        body: {
          name: "ABC Pharma",
        },
      }
    );

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  test("trims leading and trailing spaces", async () => {
    mockRequest.mockResolvedValue({
      success: true,
    });

    await createManufacturer(
      mockRequest,
      "   XYZ Laboratories   "
    );

    const [, options] =
      mockRequest.mock.calls[0];

    expect(options.body.name).toBe(
      "XYZ Laboratories"
    );
  });

  test("preserves capitalization", async () => {
    mockRequest.mockResolvedValue({
      success: true,
    });

    await createManufacturer(
      mockRequest,
      "  aBc PHARMA  "
    );

    const [, options] =
      mockRequest.mock.calls[0];

    expect(options.body.name).toBe(
      "aBc PHARMA"
    );
  });

  test("returns original API response", async () => {
    const response = {
      success: true,
      message: "Manufacturer created.",
      data: {
        manufacturer_id: 15,
      },
    };

    mockRequest.mockResolvedValue(response);

    const result = await createManufacturer(
      mockRequest,
      "New Pharma"
    );

    expect(result).toBe(response);
  });

  test("propagates duplicate manufacturer error", async () => {
    const error = mockError(
      "Manufacturer already exists.",
      409
    );

    await expect(
      createManufacturer(
        mockRequest,
        "ABC Pharma"
      )
    ).rejects.toBe(error);
  });
});

// ============================================
// 3. UPDATE MANUFACTURER
// ============================================

describe("updateManufacturer", () => {
  test("sends PUT request with manufacturer ID", async () => {
    mockRequest.mockResolvedValue({
      success: true,
    });

    await updateManufacturer(
      mockRequest,
      5,
      "Updated Pharma"
    );

    expect(mockRequest).toHaveBeenCalledWith(
      "/manufacturers/5",
      {
        method: "PUT",
        body: {
          name: "Updated Pharma",
        },
      }
    );
  });

  test("trims updated manufacturer name", async () => {
    mockRequest.mockResolvedValue({
      success: true,
    });

    await updateManufacturer(
      mockRequest,
      5,
      "  Updated Pharma  "
    );

    const [, options] =
      mockRequest.mock.calls[0];

    expect(options.body.name).toBe(
      "Updated Pharma"
    );
  });

  test("uses provided manufacturer ID in URL", async () => {
    mockRequest.mockResolvedValue({
      success: true,
    });

    await updateManufacturer(
      mockRequest,
      42,
      "XYZ Pharma"
    );

    expect(
      mockRequest.mock.calls[0][0]
    ).toBe("/manufacturers/42");
  });

  test("returns API response", async () => {
    const response = {
      success: true,
      message: "Manufacturer updated.",
    };

    mockRequest.mockResolvedValue(response);

    const result = await updateManufacturer(
      mockRequest,
      5,
      "Updated Pharma"
    );

    expect(result).toBe(response);
  });

  test("propagates update errors", async () => {
    const error = mockError(
      "Manufacturer not found.",
      404
    );

    await expect(
      updateManufacturer(
        mockRequest,
        999,
        "Unknown Pharma"
      )
    ).rejects.toBe(error);
  });
});

// ============================================
// 4. DEACTIVATE MANUFACTURER
// ============================================

describe("deactivateManufacturer", () => {
  test("sends PATCH to deactivate endpoint", async () => {
    mockRequest.mockResolvedValue({
      success: true,
    });

    await deactivateManufacturer(
      mockRequest,
      5
    );

    expect(mockRequest).toHaveBeenCalledWith(
      "/manufacturers/5/deactivate",
      {
        method: "PATCH",
      }
    );
  });

  test("returns API response", async () => {
    const response = {
      success: true,
      message: "Manufacturer deactivated.",
    };

    mockRequest.mockResolvedValue(response);

    const result = await deactivateManufacturer(
      mockRequest,
      5
    );

    expect(result).toBe(response);
  });

  test("propagates deactivation errors", async () => {
    const error = mockError(
      "Manufacturer already inactive.",
      409
    );

    await expect(
      deactivateManufacturer(
        mockRequest,
        5
      )
    ).rejects.toBe(error);
  });
});

// ============================================
// 5. RESTORE MANUFACTURER
// ============================================

describe("restoreManufacturer", () => {
  test("sends PATCH to restore endpoint", async () => {
    mockRequest.mockResolvedValue({
      success: true,
    });

    await restoreManufacturer(
      mockRequest,
      5
    );

    expect(mockRequest).toHaveBeenCalledWith(
      "/manufacturers/5/restore",
      {
        method: "PATCH",
      }
    );
  });

  test("returns API response", async () => {
    const response = {
      success: true,
      message: "Manufacturer restored.",
    };

    mockRequest.mockResolvedValue(response);

    const result = await restoreManufacturer(
      mockRequest,
      5
    );

    expect(result).toBe(response);
  });

  test("propagates restoration errors", async () => {
    const error = mockError(
      "Unable to restore manufacturer.",
      500
    );

    await expect(
      restoreManufacturer(
        mockRequest,
        5
      )
    ).rejects.toBe(error);
  });
});
