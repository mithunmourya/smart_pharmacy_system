
import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
} from "vitest";

import {
  getMyPurchases,
  getMyPurchaseById,
} from "./purchase.service";

import { ApiError } from "./api";

// ============================================
// MOCK REQUEST
// ============================================

const mockRequest = vi.fn();

// ============================================
// TEST DATA
// ============================================

const rawPurchase = {
  sale_id: "51",
  total_amount: "350.75",
  pharmacist_name: null,
  payment_mode: "Cash",
  created_at: "2026-11-01T12:00:00.000Z",
};

const rawItem = {
  sale_item_id: "101",
  sale_id: "51",
  medicine_id: "8",
  batch_id: "12",
  medicine_name: "Paracetamol",
  batch_number: "PAR-101",
  quantity: "3",
  selling_price: "50.25",
  subtotal: "150.75",
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
// GET MY PURCHASES
// ============================================

describe("getMyPurchases", () => {
  test("calls the customer purchase history endpoint", async () => {
    mockSuccess([]);

    await getMyPurchases(
      mockRequest
    );

    expect(mockRequest).toHaveBeenCalledWith(
      "/sales/my-purchases"
    );

    expect(
      mockRequest
    ).toHaveBeenCalledTimes(1);
  });

  test("normalizes purchase ID and amount", async () => {
    mockSuccess([rawPurchase]);

    const result = await getMyPurchases(
      mockRequest
    );

    expect(result[0]).toMatchObject({
      sale_id: 51,
      total_amount: 350.75,
    });

    expect(
      typeof result[0].sale_id
    ).toBe("number");

    expect(
      typeof result[0].total_amount
    ).toBe("number");
  });

  test("uses fallback for missing pharmacist name", async () => {
    mockSuccess([rawPurchase]);

    const result = await getMyPurchases(
      mockRequest
    );

    expect(
      result[0].pharmacist_name
    ).toBe("—");
  });

  test("preserves actual pharmacist name", async () => {
    mockSuccess([
      {
        ...rawPurchase,
        pharmacist_name: "Ravi Kumar",
      },
    ]);

    const result = await getMyPurchases(
      mockRequest
    );

    expect(
      result[0].pharmacist_name
    ).toBe("Ravi Kumar");
  });

  test("preserves payment mode and purchase date", async () => {
    mockSuccess([rawPurchase]);

    const result = await getMyPurchases(
      mockRequest
    );

    expect(
      result[0].payment_mode
    ).toBe("Cash");

    expect(
      result[0].created_at
    ).toBe("2026-11-01T12:00:00.000Z");
  });

  test("preserves additional purchase fields", async () => {
    mockSuccess([
      {
        ...rawPurchase,
        customer_id: 7,
        customer_name: "Anita",
      },
    ]);

    const result = await getMyPurchases(
      mockRequest
    );

    expect(result[0]).toMatchObject({
      customer_id: 7,
      customer_name: "Anita",
    });
  });

  test("normalizes multiple purchases", async () => {
    mockSuccess([
      rawPurchase,
      {
        ...rawPurchase,
        sale_id: "52",
        total_amount: "100.50",
        payment_mode: "UPI",
        pharmacist_name: "Ravi",
      },
    ]);

    const result = await getMyPurchases(
      mockRequest
    );

    expect(result).toHaveLength(2);

    expect(result[0]).toMatchObject({
      sale_id: 51,
      total_amount: 350.75,
      pharmacist_name: "—",
    });

    expect(result[1]).toMatchObject({
      sale_id: 52,
      total_amount: 100.5,
      pharmacist_name: "Ravi",
      payment_mode: "UPI",
    });
  });

  test("preserves order returned by backend", async () => {
    mockSuccess([
      { ...rawPurchase, sale_id: "99" },
      { ...rawPurchase, sale_id: "2" },
    ]);

    const result = await getMyPurchases(
      mockRequest
    );

    expect(
      result.map(
        (purchase) => purchase.sale_id
      )
    ).toEqual([99, 2]);
  });

  test("does not mutate original purchase data", async () => {
    const purchase = { ...rawPurchase };

    mockSuccess([purchase]);

    await getMyPurchases(
      mockRequest
    );

    expect(purchase.sale_id).toBe("51");

    expect(
      purchase.total_amount
    ).toBe("350.75");

    expect(
      purchase.pharmacist_name
    ).toBeNull();
  });

  test("returns empty array when purchase list is empty", async () => {
    mockSuccess([]);

    const result = await getMyPurchases(
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
      mockSuccess(data);

      await expect(
        getMyPurchases(mockRequest)
      ).rejects.toMatchObject({
        name: "ApiError",
        status: 502,
        message:
          "Unable to read your purchase history.",
      });
    }
  );

  test("propagates HTTP 404 instead of returning empty array", async () => {
    const error = mockFailure(
      "No purchases found.",
      404
    );

    await expect(
      getMyPurchases(mockRequest)
    ).rejects.toBe(error);
  });

  test("propagates authentication errors", async () => {
    const error = mockFailure(
      "Please sign in again.",
      401
    );

    await expect(
      getMyPurchases(mockRequest)
    ).rejects.toBe(error);
  });

  test("propagates server errors", async () => {
    const error = mockFailure(
      "Database unavailable.",
      500
    );

    await expect(
      getMyPurchases(mockRequest)
    ).rejects.toBe(error);
  });
});

// ============================================
// GET MY PURCHASE BY ID
// ============================================

describe("getMyPurchaseById", () => {
  test("calls the correct purchase details endpoint", async () => {
    mockSuccess({
      ...rawPurchase,
      items: [],
    });

    await getMyPurchaseById(
      mockRequest,
      51
    );

    expect(mockRequest).toHaveBeenCalledWith(
      "/sales/my-purchases/51"
    );

    expect(
      mockRequest
    ).toHaveBeenCalledTimes(1);
  });

  test("normalizes purchase details", async () => {
    mockSuccess({
      ...rawPurchase,
      items: [rawItem],
    });

    const result = await getMyPurchaseById(
      mockRequest,
      51
    );

    expect(result).toMatchObject({
      sale_id: 51,
      total_amount: 350.75,
      pharmacist_name: "—",
      payment_mode: "Cash",
    });

    expect(result.items).toHaveLength(1);
  });

  test("normalizes numeric purchase item fields", async () => {
    mockSuccess({
      ...rawPurchase,
      items: [rawItem],
    });

    const result = await getMyPurchaseById(
      mockRequest,
      51
    );

    expect(result.items[0]).toMatchObject({
      sale_item_id: 101,
      quantity: 3,
      selling_price: 50.25,
      subtotal: 150.75,
      medicine_name: "Paracetamol",
    });
  });

  test("preserves item IDs not explicitly normalized by service", async () => {
    mockSuccess({
      ...rawPurchase,
      items: [rawItem],
    });

    const result = await getMyPurchaseById(
      mockRequest,
      51
    );

    // Unlike sales.service.js, this service
    // converts only sale_item_id, quantity,
    // selling_price and subtotal in each item.
    expect(result.items[0].sale_id).toBe(
      "51"
    );

    expect(
      result.items[0].medicine_id
    ).toBe("8");

    expect(
      result.items[0].batch_id
    ).toBe("12");
  });

  test("preserves medicine names and batch numbers", async () => {
    mockSuccess({
      ...rawPurchase,
      items: [rawItem],
    });

    const result = await getMyPurchaseById(
      mockRequest,
      51
    );

    expect(
      result.items[0].medicine_name
    ).toBe("Paracetamol");

    expect(
      result.items[0].batch_number
    ).toBe("PAR-101");
  });

  test("handles multiple purchase items", async () => {
    mockSuccess({
      ...rawPurchase,
      items: [
        rawItem,
        {
          ...rawItem,
          sale_item_id: "102",
          medicine_name: "Ibuprofen",
          quantity: "2",
          subtotal: "100.50",
        },
      ],
    });

    const result = await getMyPurchaseById(
      mockRequest,
      51
    );

    expect(result.items).toHaveLength(2);

    expect(
      result.items.map(
        (item) => item.sale_item_id
      )
    ).toEqual([101, 102]);

    expect(
      result.items[1].quantity
    ).toBe(2);

    expect(
      result.items[1].subtotal
    ).toBe(100.5);
  });

  test("accepts an empty purchase items array", async () => {
    mockSuccess({
      ...rawPurchase,
      items: [],
    });

    const result = await getMyPurchaseById(
      mockRequest,
      51
    );

    expect(result.items).toEqual([]);
  });

  test("does not mutate original purchase items", async () => {
    const item = { ...rawItem };

    mockSuccess({
      ...rawPurchase,
      items: [item],
    });

    await getMyPurchaseById(
      mockRequest,
      51
    );

    expect(item.quantity).toBe("3");

    expect(
      item.selling_price
    ).toBe("50.25");

    expect(item.subtotal).toBe(
      "150.75"
    );
  });

  test.each([
    ["missing response data", undefined],
    ["null response data", null],
    ["missing items", { ...rawPurchase }],
    ["null items", { ...rawPurchase, items: null }],
    ["object items", { ...rawPurchase, items: {} }],
    ["string items", { ...rawPurchase, items: "invalid" }],
  ])(
    "rejects %s",
    async (_description, data) => {
      mockSuccess(data);

      await expect(
        getMyPurchaseById(
          mockRequest,
          51
        )
      ).rejects.toMatchObject({
        name: "ApiError",
        status: 502,
        message:
          "Unable to read the purchase details.",
      });
    }
  );

  test("propagates purchase not found errors", async () => {
    const error = mockFailure(
      "Purchase not found.",
      404
    );

    await expect(
      getMyPurchaseById(
        mockRequest,
        999
      )
    ).rejects.toBe(error);
  });

  test("propagates forbidden access errors", async () => {
    const error = mockFailure(
      "Access forbidden.",
      403
    );

    await expect(
      getMyPurchaseById(
        mockRequest,
        51
      )
    ).rejects.toBe(error);
  });

  test("propagates server errors", async () => {
    const error = mockFailure(
      "Internal server error.",
      500
    );

    await expect(
      getMyPurchaseById(
        mockRequest,
        51
      )
    ).rejects.toBe(error);
  });
});
