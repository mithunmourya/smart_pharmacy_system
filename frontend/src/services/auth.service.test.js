
import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
} from "vitest";

import { loginUser } from "./auth.service";
import { apiRequest, ApiError } from "./api";

// ============================================
// MOCK API DEPENDENCY
// ============================================

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    apiRequest: vi.fn(),
  };
});

// ============================================
// TEST DATA
// ============================================

const user = {
  user_id: 10,
  name: "Ravi Kumar",
  email: "ravi@example.com",
  role: "Pharmacist",
  is_active: true,
};

const token = [
  "header",
  btoa(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + 3600,
  })),
  "signature",
].join(".");

const loginValues = {
  email: "ravi@example.com",
  password: "Password123!",
};

function mockLoginSuccess() {
  apiRequest.mockResolvedValueOnce({
    success: true,
    data: {
      token,
      user,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================
// 1. LOGIN REQUEST
// ============================================

describe("loginUser - Request", () => {
  test("calls the login endpoint", async () => {
    mockLoginSuccess();

    await loginUser(loginValues);

    expect(apiRequest).toHaveBeenCalledWith(
      "/users/login",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  test("sends email and password", async () => {
    mockLoginSuccess();

    await loginUser(loginValues);

    const [, options] = apiRequest.mock.calls[0];

    expect(options.body).toMatchObject({
      email: "ravi@example.com",
      password: "Password123!",
    });
  });

  test("does not modify the original password", async () => {
    mockLoginSuccess();

    await loginUser({
      email: "ravi@example.com",
      password: "  Password123!  ",
    });

    const [, options] = apiRequest.mock.calls[0];

    expect(options.body.password).toBe(
      "  Password123!  "
    );
  });
});

// ============================================
// 2. SUCCESSFUL LOGIN
// ============================================

describe("loginUser - Success", () => {
  test("returns session token", async () => {
    mockLoginSuccess();

    const result = await loginUser(loginValues);

    expect(result.token).toBe(token);
  });

  test("returns authenticated user", async () => {
    mockLoginSuccess();

    const result = await loginUser(loginValues);

    expect(result.user).toMatchObject({
      user_id: 10,
      email: "ravi@example.com",
      role: "Pharmacist",
    });
  });

  test("makes only one login request", async () => {
    mockLoginSuccess();

    await loginUser(loginValues);

    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});

// ============================================
// 3. LOGIN FAILURES
// ============================================

describe("loginUser - Errors", () => {
  test("propagates incorrect password error", async () => {
    const error = new ApiError(
      "Invalid credentials.",
      401
    );

    apiRequest.mockRejectedValueOnce(error);

    await expect(
      loginUser(loginValues)
    ).rejects.toBe(error);
  });

  test("propagates inactive account error", async () => {
    const error = new ApiError(
      "User account is inactive.",
      409
    );

    apiRequest.mockRejectedValueOnce(error);

    await expect(
      loginUser(loginValues)
    ).rejects.toBe(error);
  });

  test("propagates network failure", async () => {
    const error = new ApiError(
      "Unable to connect to the server."
    );

    apiRequest.mockRejectedValueOnce(error);

    await expect(
      loginUser(loginValues)
    ).rejects.toBe(error);
  });
});
