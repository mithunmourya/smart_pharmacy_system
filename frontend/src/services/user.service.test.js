
import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
} from "vitest";

import {
  getUsers,
  createUser,
  updateUser,
  deactivateUser,
  restoreUser,
} from "./user.service";

// ============================================
// MOCK REQUEST
// ============================================

const mockRequest = vi.fn();

// ============================================
// TEST DATA
// ============================================

const rawUser = {
  user_id: 10,
  name: "Ravi Kumar",
  email: "ravi@example.com",
  role: "Pharmacist",
  created_at: "2026-10-01",
  is_active: 1,
};

const formValues = {
  name: "  Anita Sharma  ",
  email: "  anita@example.com  ",
  password: "SecurePassword123!",
  role: "Customer",
};

// ============================================
// HELPERS
// ============================================

// No default argument here: passing
// undefined must remain undefined.
// This avoids the issue we previously
// encountered in medicine/manufacturer tests.

function mockUsers(data) {
  mockRequest.mockResolvedValueOnce({
    success: true,
    data,
  });
}

function mockSuccess(response = { success: true }) {
  mockRequest.mockResolvedValueOnce(response);
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
// 1. GET USERS
// ============================================

describe("getUsers", () => {
  test("calls the correct API endpoint", async () => {
    mockUsers([rawUser]);

    await getUsers(mockRequest);

    expect(mockRequest).toHaveBeenCalledWith(
      "/users"
    );

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  test("returns normalized user information", async () => {
    mockUsers([rawUser]);

    const result = await getUsers(mockRequest);

    expect(result).toEqual([
      {
        user_id: 10,
        name: "Ravi Kumar",
        email: "ravi@example.com",
        role: "Pharmacist",
        created_at: "2026-10-01",
        is_active: true,
      },
    ]);
  });

  test.each([
    [1, true],
    ["1", true],
    [true, true],
    [0, false],
    ["0", false],
    [false, false],
    [2, false],
    ["true", false],
  ])(
    "converts is_active %s to %s",
    async (value, expected) => {
      mockUsers([
        {
          ...rawUser,
          is_active: value,
        },
      ]);

      const result = await getUsers(mockRequest);

      expect(result[0].is_active).toBe(expected);
    }
  );

  test("normalizes multiple users independently", async () => {
    mockUsers([
      rawUser,
      {
        ...rawUser,
        user_id: 11,
        name: "Anita Sharma",
        role: "Customer",
        is_active: "0",
      },
    ]);

    const result = await getUsers(mockRequest);

    expect(result).toHaveLength(2);

    expect(result[0]).toMatchObject({
      user_id: 10,
      role: "Pharmacist",
      is_active: true,
    });

    expect(result[1]).toMatchObject({
      user_id: 11,
      name: "Anita Sharma",
      role: "Customer",
      is_active: false,
    });
  });

  test("preserves the order returned by API", async () => {
    mockUsers([
      {
        ...rawUser,
        user_id: 20,
        name: "Zara",
      },
      {
        ...rawUser,
        user_id: 5,
        name: "Anita",
      },
    ]);

    const result = await getUsers(mockRequest);

    expect(
      result.map((user) => user.name)
    ).toEqual(["Zara", "Anita"]);
  });

  test("does not expose unexpected properties", async () => {
    mockUsers([
      {
        ...rawUser,
        password_hash: "secret-hash",
        internal_note: "Private",
      },
    ]);

    const result = await getUsers(mockRequest);

    expect(result[0]).not.toHaveProperty(
      "password_hash"
    );

    expect(result[0]).not.toHaveProperty(
      "internal_note"
    );
  });

  test("does not mutate original API data", async () => {
    const user = { ...rawUser };

    mockUsers([user]);

    await getUsers(mockRequest);

    expect(user.is_active).toBe(1);
    expect(rawUser.is_active).toBe(1);
  });

  test("returns empty array when no users exist", async () => {
    mockUsers([]);

    const result = await getUsers(mockRequest);

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
      mockUsers(data);

      await expect(
        getUsers(mockRequest)
      ).rejects.toThrow(
        "The server returned an invalid users list."
      );
    }
  );

  test("returns empty array for expected 404 response", async () => {
    mockError("No users found.", 404);

    const result = await getUsers(mockRequest);

    expect(result).toEqual([]);
  });

  test("rethrows unexpected 404 errors", async () => {
    const error = mockError(
      "User endpoint not found.",
      404
    );

    await expect(
      getUsers(mockRequest)
    ).rejects.toBe(error);
  });

  test("does not swallow expected message with status 500", async () => {
    const error = mockError(
      "No users found.",
      500
    );

    await expect(
      getUsers(mockRequest)
    ).rejects.toBe(error);
  });

  test("propagates server errors", async () => {
    const error = mockError(
      "Database unavailable.",
      500
    );

    await expect(
      getUsers(mockRequest)
    ).rejects.toBe(error);
  });

  test("propagates authentication errors", async () => {
    const error = mockError(
      "Please sign in again.",
      401
    );

    await expect(
      getUsers(mockRequest)
    ).rejects.toBe(error);
  });
});

// ============================================
// 2. CREATE USER
// ============================================

describe("createUser", () => {
  test("sends POST request with user information", async () => {
    mockSuccess();

    await createUser(mockRequest, formValues);

    expect(mockRequest).toHaveBeenCalledWith(
      "/users/register",
      {
        method: "POST",
        body: {
          name: "Anita Sharma",
          email: "anita@example.com",
          password: "SecurePassword123!",
          role: "Customer",
        },
      }
    );

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  test("trims name and email values", async () => {
    mockSuccess();

    await createUser(mockRequest, {
      ...formValues,
      name: "  Ravi Kumar  ",
      email: "  RAVI@EXAMPLE.COM  ",
    });

    const body =
      mockRequest.mock.calls[0][1].body;

    expect(body.name).toBe("Ravi Kumar");

    expect(body.email).toBe(
      "RAVI@EXAMPLE.COM"
    );
  });

  test("preserves password and selected role", async () => {
    mockSuccess();

    await createUser(mockRequest, {
      ...formValues,
      password: "  Password123!  ",
      role: "Admin",
    });

    const body =
      mockRequest.mock.calls[0][1].body;

    // The real service does not trim passwords.
    expect(body.password).toBe(
      "  Password123!  "
    );

    expect(body.role).toBe("Admin");
  });

  test("returns the original API response", async () => {
    const response = {
      success: true,
      message: "User created.",
      data: {
        user_id: 21,
      },
    };

    mockSuccess(response);

    const result = await createUser(
      mockRequest,
      formValues
    );

    expect(result).toBe(response);
  });

  test("propagates duplicate email errors", async () => {
    const error = mockError(
      "Email already exists.",
      409
    );

    await expect(
      createUser(mockRequest, formValues)
    ).rejects.toBe(error);
  });
});

// ============================================
// 3. UPDATE USER
// ============================================

describe("updateUser", () => {
  test("sends PUT request to correct user endpoint", async () => {
    mockSuccess();

    await updateUser(
      mockRequest,
      10,
      formValues
    );

    expect(mockRequest).toHaveBeenCalledWith(
      "/users/10",
      {
        method: "PUT",
        body: {
          name: "Anita Sharma",
          email: "anita@example.com",
        },
      }
    );
  });

  test("uses the specified user ID", async () => {
    mockSuccess();

    await updateUser(
      mockRequest,
      42,
      formValues
    );

    expect(
      mockRequest.mock.calls[0][0]
    ).toBe("/users/42");
  });

  test("trims name and email during updates", async () => {
    mockSuccess();

    await updateUser(
      mockRequest,
      10,
      {
        ...formValues,
        name: "  Updated Name  ",
        email: "  updated@example.com  ",
      }
    );

    const body =
      mockRequest.mock.calls[0][1].body;

    expect(body).toEqual({
      name: "Updated Name",
      email: "updated@example.com",
    });
  });

  test("does not send password or role during update", async () => {
    mockSuccess();

    await updateUser(
      mockRequest,
      10,
      formValues
    );

    const body =
      mockRequest.mock.calls[0][1].body;

    expect(body).not.toHaveProperty(
      "password"
    );

    expect(body).not.toHaveProperty(
      "role"
    );

    expect(body).not.toHaveProperty(
      "user_id"
    );
  });

  test("returns the API response", async () => {
    const response = {
      success: true,
      message: "User updated.",
    };

    mockSuccess(response);

    const result = await updateUser(
      mockRequest,
      10,
      formValues
    );

    expect(result).toBe(response);
  });

  test("propagates update errors", async () => {
    const error = mockError(
      "User not found.",
      404
    );

    await expect(
      updateUser(
        mockRequest,
        999,
        formValues
      )
    ).rejects.toBe(error);
  });
});

// ============================================
// 4. DEACTIVATE USER
// ============================================

describe("deactivateUser", () => {
  test("sends PATCH request to deactivate endpoint", async () => {
    mockSuccess();

    await deactivateUser(mockRequest, 10);

    expect(mockRequest).toHaveBeenCalledWith(
      "/users/10/deactivate",
      {
        method: "PATCH",
      }
    );
  });

  test("returns the API response", async () => {
    const response = {
      success: true,
      message: "User deactivated.",
    };

    mockSuccess(response);

    const result = await deactivateUser(
      mockRequest,
      10
    );

    expect(result).toBe(response);
  });

  test("propagates deactivation errors", async () => {
    const error = mockError(
      "User already inactive.",
      409
    );

    await expect(
      deactivateUser(mockRequest, 10)
    ).rejects.toBe(error);
  });
});

// ============================================
// 5. RESTORE USER
// ============================================

describe("restoreUser", () => {
  test("sends PATCH request to restore endpoint", async () => {
    mockSuccess();

    await restoreUser(mockRequest, 10);

    expect(mockRequest).toHaveBeenCalledWith(
      "/users/10/restore",
      {
        method: "PATCH",
      }
    );
  });

  test("returns API response", async () => {
    const response = {
      success: true,
      message: "User restored.",
    };

    mockSuccess(response);

    const result = await restoreUser(
      mockRequest,
      10
    );

    expect(result).toBe(response);
  });

  test("propagates restoration errors", async () => {
    const error = mockError(
      "Unable to restore user.",
      500
    );

    await expect(
      restoreUser(mockRequest, 10)
    ).rejects.toBe(error);
  });
});
