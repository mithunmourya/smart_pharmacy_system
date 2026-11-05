
import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
} from "vitest";

import {
  lookupCustomer,
  createCustomer,
} from "./customer.service";

// ============================================
// MOCK AUTHENTICATED REQUEST
// ============================================

const mockRequest = vi.fn();

// ============================================
// TEST DATA
// ============================================

const customer = {
  user_id: 21,
  name: "Anita Sharma",
  email: "anita@example.com",
  role: "Customer",
};

function mockCustomerSuccess(data = customer) {
  mockRequest.mockResolvedValueOnce({
    success: true,
    data,
  });
}

function mockError(message, status) {
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
// 1. LOOKUP CUSTOMER
// ============================================

describe("lookupCustomer", () => {
  test("makes an authenticated lookup request", async () => {
    mockCustomerSuccess();

    await lookupCustomer(
      mockRequest,
      "anita@example.com"
    );

    expect(mockRequest).toHaveBeenCalled();
    expect(
      mockRequest.mock.calls[0][0]
    ).toEqual(expect.any(String));
  });

  test("returns customer name and email", async () => {
    mockCustomerSuccess();

    const result = await lookupCustomer(
      mockRequest,
      "anita@example.com"
    );

    expect(result).toMatchObject({
      name: "Anita Sharma",
      email: "anita@example.com",
    });
  });

  test("preserves the customer identifier", async () => {
    mockCustomerSuccess();

    const result = await lookupCustomer(
      mockRequest,
      "anita@example.com"
    );

    expect(result.user_id).toBe(21);
  });

  test("propagates customer-not-found errors", async () => {
    const error = mockError(
      "No customer account found for this email.",
      404
    );

    await expect(
      lookupCustomer(
        mockRequest,
        "missing@example.com"
      )
    ).rejects.toBe(error);
  });

  test("propagates authentication errors", async () => {
    const error = mockError(
      "Unauthorized.",
      401
    );

    await expect(
      lookupCustomer(
        mockRequest,
        "anita@example.com"
      )
    ).rejects.toBe(error);
  });

  test("propagates server errors", async () => {
    const error = mockError(
      "Server unavailable.",
      500
    );

    await expect(
      lookupCustomer(
        mockRequest,
        "anita@example.com"
      )
    ).rejects.toBe(error);
  });
});

// ============================================
// 2. CREATE CUSTOMER
// ============================================

describe("createCustomer", () => {
  const values = {
    name: "Anita Sharma",
    email: "anita@example.com",
  };

  test("sends a create request", async () => {
    mockCustomerSuccess();

    await createCustomer(
      mockRequest,
      values
    );

    expect(mockRequest).toHaveBeenCalled();

    const [, options] =
      mockRequest.mock.calls[0];

    expect(options.method).toBe("POST");
  });

  test("sends customer name and email", async () => {
    mockCustomerSuccess();

    await createCustomer(
      mockRequest,
      values
    );

    const [, options] =
      mockRequest.mock.calls[0];

    expect(options.body).toMatchObject({
      name: "Anita Sharma",
      email: "anita@example.com",
    });
  });

  test("returns the created customer", async () => {
    mockCustomerSuccess();

    const result = await createCustomer(
      mockRequest,
      values
    );

    expect(result).toMatchObject({
      user_id: 21,
      name: "Anita Sharma",
      email: "anita@example.com",
    });
  });

  test("propagates duplicate email errors", async () => {
    const error = mockError(
      "Email already exists.",
      409
    );

    await expect(
      createCustomer(
        mockRequest,
        values
      )
    ).rejects.toBe(error);
  });

  test("propagates network failures", async () => {
    const error = mockError(
      "Unable to connect to server.",
      0
    );

    await expect(
      createCustomer(
        mockRequest,
        values
      )
    ).rejects.toBe(error);
  });

  test("propagates internal server errors", async () => {
    const error = mockError(
      "Internal server error.",
      500
    );

    await expect(
      createCustomer(
        mockRequest,
        values
      )
    ).rejects.toBe(error);
  });
});
