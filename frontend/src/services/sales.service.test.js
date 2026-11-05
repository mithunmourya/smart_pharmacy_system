
import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
} from "vitest";

import {
  PAYMENT_MODES,
  createSale,
  getSales,
  getSaleById,
} from "./sales.service";

import { ApiError } from "./api";

// ============================================
// MOCK REQUEST
// ============================================

const mockRequest = vi.fn();

// ============================================
// TEST DATA
// ============================================

const saleValues = {
  payment_mode: "UPI",
  items: [
    {
      batch_id: "10",
      quantity: "2",
      selling_price: 100,
    },
    {
      batch_id: "20",
      quantity: "3",
    },
  ],
};

const rawSale = {
  sale_id: "41",
  total_amount: "225.50",
  customer_name: null,
  pharmacist_name: "",
  payment_mode: "UPI",
  created_at: "2026-11-01T10:00:00.000Z",
};

const rawSaleItem = {
  sale_item_id: "91",
  sale_id: "41",
  medicine_id: "5",
  batch_id: "10",
  medicine_name: "Paracetamol",
  batch_number: "PAR-101",
  quantity: "2",
  selling_price: "100.25",
  subtotal: "200.50",
};

// ============================================
// HELPERS
// ============================================

function mockSuccess(data) {
  mockRequest.mockResolvedValueOnce({
    success: true,
    data,
  });
}

function mockFailure(
  message,
  status = 500
) {
  const error = new ApiError(
    message,
    status
  );

  mockRequest.mockRejectedValueOnce(error);

  return error;
}

beforeEach(() => {
  mockRequest.mockReset();
});

// ============================================
// PAYMENT MODES
// ============================================

describe("PAYMENT_MODES", () => {
  test("exports supported payment modes", () => {
    expect(PAYMENT_MODES).toEqual([
      "Cash",
      "Card",
      "UPI",
    ]);
  });
});

// ============================================
// CREATE SALE
// ============================================

describe("createSale", () => {
  test("creates a walk-in sale without customer ID", async () => {
    mockSuccess({
      sale_id: 51,
      total_amount: 250,
    });

    await createSale(
      mockRequest,
      saleValues
    );

    expect(mockRequest).toHaveBeenCalledWith(
      "/sales",
      {
        method: "POST",
        body: {
          customer_id: null,
          payment_mode: "UPI",
          items: [
            {
              batch_id: 10,
              quantity: 2,
            },
            {
              batch_id: 20,
              quantity: 3,
            },
          ],
        },
      }
    );

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  test("creates sale for selected customer", async () => {
    mockSuccess({
      sale_id: 52,
      total_amount: 300,
    });

    await createSale(
      mockRequest,
      {
        ...saleValues,
        customer_id: 7,
      }
    );

    expect(mockRequest).toHaveBeenCalledWith(
      "/sales",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          customer_id: 7,
        }),
      })
    );
  });

  test("accepts explicit null customer ID", async () => {
    mockSuccess({
      sale_id: 53,
      total_amount: 100,
    });

    await createSale(
      mockRequest,
      {
        ...saleValues,
        customer_id: null,
      }
    );

    expect(
      mockRequest.mock.calls[0][1].body.customer_id
    ).toBeNull();
  });

  test.each([
    ["Cash"],
    ["Card"],
    ["UPI"],
  ])(
    "forwards payment mode %s",
    async (paymentMode) => {
      mockSuccess({
        sale_id: 54,
        total_amount: 100,
      });

      await createSale(mockRequest, {
        ...saleValues,
        payment_mode: paymentMode,
      });

      expect(
        mockRequest.mock.calls[0][1].body.payment_mode
      ).toBe(paymentMode);
    }
  );

  test("converts batch IDs and quantities to numbers", async () => {
    mockSuccess({
      sale_id: 55,
      total_amount: 500,
    });

    await createSale(
      mockRequest,
      saleValues
    );

    const body =
      mockRequest.mock.calls[0][1].body;

    expect(body.items).toEqual([
      { batch_id: 10, quantity: 2 },
      { batch_id: 20, quantity: 3 },
    ]);

    expect(
      typeof body.items[0].batch_id
    ).toBe("number");

    expect(
      typeof body.items[0].quantity
    ).toBe("number");
  });

  test("excludes unnecessary item fields", async () => {
    mockSuccess({
      sale_id: 56,
      total_amount: 100,
    });

    await createSale(
      mockRequest,
      saleValues
    );

    const items =
      mockRequest.mock.calls[0][1].body.items;

    expect(items[0]).not.toHaveProperty(
      "selling_price"
    );

    expect(items[0]).not.toHaveProperty(
      "subtotal"
    );
  });

  test("does not mutate the original sale values", async () => {
    mockSuccess({
      sale_id: 57,
      total_amount: 100,
    });

    await createSale(
      mockRequest,
      saleValues
    );

    expect(
      saleValues.items[0].batch_id
    ).toBe("10");

    expect(
      saleValues.items[0].quantity
    ).toBe("2");
  });

  test.each([
    ["zero", 0],
    ["negative", -5],
    ["decimal", 2.5],
    ["numeric string", "7"],
    ["NaN", Number.NaN],
    ["Infinity", Infinity],
    [
      "unsafe integer",
      Number.MAX_SAFE_INTEGER + 1,
    ],
  ])(
    "rejects %s customer ID before API request",
    async (_description, customerId) => {
      await expect(
        createSale(mockRequest, {
          ...saleValues,
          customer_id: customerId,
        })
      ).rejects.toMatchObject({
        name: "ApiError",
        message:
          "Select a valid customer before checkout.",
        status: 400,
      });

      expect(
        mockRequest
      ).not.toHaveBeenCalled();
    }
  );

  test("returns normalized sale confirmation", async () => {
    mockSuccess({
      sale_id: "61",
      total_amount: "450.75",
    });

    const result = await createSale(
      mockRequest,
      saleValues
    );

    expect(result).toEqual({
      sale_id: 61,
      total_amount: 450.75,
    });
  });

  test("accepts a finite zero total amount", async () => {
    mockSuccess({
      sale_id: "62",
      total_amount: "0",
    });

    const result = await createSale(
      mockRequest,
      saleValues
    );

    expect(result).toEqual({
      sale_id: 62,
      total_amount: 0,
    });
  });

  test.each([
    ["missing sale ID", { total_amount: "100" }],
    ["null sale ID", { sale_id: null, total_amount: "100" }],
    ["zero sale ID", { sale_id: 0, total_amount: "100" }],
    ["negative sale ID", { sale_id: -1, total_amount: "100" }],
    ["decimal sale ID", { sale_id: 1.5, total_amount: "100" }],
    ["invalid sale ID", { sale_id: "abc", total_amount: "100" }],
    [
      "unsafe sale ID",
      {
        sale_id: Number.MAX_SAFE_INTEGER + 1,
        total_amount: "100",
      },
    ],
  ])(
    "rejects confirmation with %s",
    async (_description, data) => {
      mockSuccess(data);

      await expect(
        createSale(
          mockRequest,
          saleValues
        )
      ).rejects.toThrow(
        "The server response could not confirm the sale. Ask an admin to check Sales History."
      );
    }
  );

  test.each([
    ["missing amount", { sale_id: 50 }],
    ["null amount", { sale_id: 50, total_amount: null }],
    ["invalid amount", { sale_id: 50, total_amount: "abc" }],
    ["infinite amount", { sale_id: 50, total_amount: Infinity }],
    ["NaN amount", { sale_id: 50, total_amount: Number.NaN }],
  ])(
    "rejects confirmation with %s",
    async (_description, data) => {
      mockSuccess(data);

      await expect(
        createSale(
          mockRequest,
          saleValues
        )
      ).rejects.toThrow(
        /server response could not confirm the sale/
      );
    }
  );

  test("rejects confirmation with missing response data", async () => {
    mockSuccess(undefined);

    await expect(
      createSale(mockRequest, saleValues)
    ).rejects.toThrow(
      /server response could not confirm the sale/
    );
  });

  test("propagates checkout API errors", async () => {
    const error = mockFailure(
      "Insufficient stock.",
      409
    );

    await expect(
      createSale(
        mockRequest,
        saleValues
      )
    ).rejects.toBe(error);
  });
});

// ============================================
// GET SALES
// ============================================

describe("getSales", () => {
  test("calls sales history endpoint", async () => {
    mockSuccess([]);

    await getSales(mockRequest);

    expect(mockRequest).toHaveBeenCalledWith(
      "/sales"
    );

    expect(
      mockRequest
    ).toHaveBeenCalledTimes(1);
  });

  test("normalizes sale ID and total amount", async () => {
    mockSuccess([rawSale]);

    const result = await getSales(
      mockRequest
    );

    expect(result[0]).toMatchObject({
      sale_id: 41,
      total_amount: 225.5,
    });

    expect(
      typeof result[0].sale_id
    ).toBe("number");

    expect(
      typeof result[0].total_amount
    ).toBe("number");
  });

  test("uses fallback customer and pharmacist names", async () => {
    mockSuccess([rawSale]);

    const result = await getSales(
      mockRequest
    );

    expect(result[0].customer_name).toBe(
      "Walk-in customer"
    );

    expect(result[0].pharmacist_name).toBe(
      "—"
    );
  });

  test("preserves real customer and pharmacist names", async () => {
    mockSuccess([
      {
        ...rawSale,
        customer_name: "Anita Sharma",
        pharmacist_name: "Ravi Kumar",
      },
    ]);

    const result = await getSales(
      mockRequest
    );

    expect(result[0].customer_name).toBe(
      "Anita Sharma"
    );

    expect(result[0].pharmacist_name).toBe(
      "Ravi Kumar"
    );
  });

  test("preserves payment mode and creation date", async () => {
    mockSuccess([rawSale]);

    const result = await getSales(
      mockRequest
    );

    expect(result[0].payment_mode).toBe(
      "UPI"
    );

    expect(result[0].created_at).toBe(
      "2026-11-01T10:00:00.000Z"
    );
  });

  test("normalizes multiple sales independently", async () => {
    mockSuccess([
      rawSale,
      {
        ...rawSale,
        sale_id: "42",
        total_amount: "500.25",
        customer_name: "Customer B",
      },
    ]);

    const result = await getSales(
      mockRequest
    );

    expect(result).toHaveLength(2);

    expect(result[0].sale_id).toBe(41);
    expect(result[1].sale_id).toBe(42);
    expect(result[1].total_amount).toBe(
      500.25
    );
  });

  test("preserves original sales order", async () => {
    mockSuccess([
      { ...rawSale, sale_id: "99" },
      { ...rawSale, sale_id: "2" },
    ]);

    const result = await getSales(
      mockRequest
    );

    expect(
      result.map((sale) => sale.sale_id)
    ).toEqual([99, 2]);
  });

  test("does not mutate original API sale", async () => {
    const sale = { ...rawSale };

    mockSuccess([sale]);

    await getSales(mockRequest);

    expect(sale.sale_id).toBe("41");
    expect(sale.total_amount).toBe(
      "225.50"
    );
    expect(sale.customer_name).toBeNull();
  });

  test("returns empty array for empty sales list", async () => {
    mockSuccess([]);

    expect(
      await getSales(mockRequest)
    ).toEqual([]);
  });

  test.each([
    ["missing data", undefined],
    ["null data", null],
    ["object data", {}],
    ["string data", "invalid"],
  ])(
    "rejects %s",
    async (_description, data) => {
      // No default argument in mockSuccess:
      // undefined remains undefined.
      mockSuccess(data);

      await expect(
        getSales(mockRequest)
      ).rejects.toMatchObject({
        name: "ApiError",
        message:
          "Unable to read sales history.",
        status: 502,
      });
    }
  );

  test("returns empty list for expected HTTP 404", async () => {
    mockFailure("No sales found.", 404);

    expect(
      await getSales(mockRequest)
    ).toEqual([]);
  });

  test("rethrows unrelated HTTP 404 errors", async () => {
    const error = mockFailure(
      "Sales endpoint not found.",
      404
    );

    await expect(
      getSales(mockRequest)
    ).rejects.toBe(error);
  });

  test("does not swallow expected message with status 500", async () => {
    const error = mockFailure(
      "No sales found.",
      500
    );

    await expect(
      getSales(mockRequest)
    ).rejects.toBe(error);
  });

  test("propagates authentication errors", async () => {
    const error = mockFailure(
      "Please sign in again.",
      401
    );

    await expect(
      getSales(mockRequest)
    ).rejects.toBe(error);
  });
});

// ============================================
// GET SALE BY ID
// ============================================

describe("getSaleById", () => {
  test("calls the correct sale details endpoint", async () => {
    mockSuccess({
      ...rawSale,
      items: [],
    });

    await getSaleById(
      mockRequest,
      41
    );

    expect(mockRequest).toHaveBeenCalledWith(
      "/sales/41"
    );
  });

  test("normalizes sale details and medicine items", async () => {
    mockSuccess({
      ...rawSale,
      items: [rawSaleItem],
    });

    const result = await getSaleById(
      mockRequest,
      41
    );

    expect(result).toMatchObject({
      sale_id: 41,
      total_amount: 225.5,
      customer_name: "Walk-in customer",
      pharmacist_name: "—",
      payment_mode: "UPI",
    });

    expect(result.items).toHaveLength(1);

    expect(result.items[0]).toEqual({
      sale_item_id: 91,
      sale_id: 41,
      medicine_id: 5,
      batch_id: 10,
      medicine_name: "Paracetamol",
      batch_number: "PAR-101",
      quantity: 2,
      selling_price: 100.25,
      subtotal: 200.5,
    });
  });

  test("converts every numeric sale-item field", async () => {
    mockSuccess({
      ...rawSale,
      items: [rawSaleItem],
    });

    const result = await getSaleById(
      mockRequest,
      41
    );

    const item = result.items[0];

    for (const key of [
      "sale_item_id",
      "sale_id",
      "medicine_id",
      "batch_id",
      "quantity",
      "selling_price",
      "subtotal",
    ]) {
      expect(
        typeof item[key]
      ).toBe("number");
    }
  });

  test("accepts sale details with empty item list", async () => {
    mockSuccess({
      ...rawSale,
      items: [],
    });

    const result = await getSaleById(
      mockRequest,
      41
    );

    expect(result.sale_id).toBe(41);
    expect(result.items).toEqual([]);
  });

  test("preserves extra sale-item fields", async () => {
    mockSuccess({
      ...rawSale,
      items: [
        {
          ...rawSaleItem,
          extra_note: "Prescription item",
        },
      ],
    });

    const result = await getSaleById(
      mockRequest,
      41
    );

    expect(
      result.items[0].extra_note
    ).toBe("Prescription item");
  });

  test.each([
    ["missing details", undefined],
    ["null details", null],
    ["missing items", { ...rawSale }],
    ["null items", { ...rawSale, items: null }],
    ["object items", { ...rawSale, items: {} }],
    ["string items", { ...rawSale, items: "invalid" }],
  ])(
    "rejects %s",
    async (_description, data) => {
      mockSuccess(data);

      await expect(
        getSaleById(mockRequest, 41)
      ).rejects.toMatchObject({
        name: "ApiError",
        status: 502,
        message:
          "Medicine details were not returned. Check that the backend sale-details update is installed.",
      });
    }
  );

  test("propagates sale not found error", async () => {
    const error = mockFailure(
      "Sale not found.",
      404
    );

    await expect(
      getSaleById(
        mockRequest,
        999
      )
    ).rejects.toBe(error);
  });

  test("propagates server errors", async () => {
    const error = mockFailure(
      "Internal server error.",
      500
    );

    await expect(
      getSaleById(
        mockRequest,
        41
      )
    ).rejects.toBe(error);
  });
});
