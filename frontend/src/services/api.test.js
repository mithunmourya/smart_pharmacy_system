
import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";

// ============================================
// TEST CONFIGURATION
// ============================================

const TEST_BASE_URL = "https://pharmacy.test/api///";
const EXPECTED_BASE_URL = "https://pharmacy.test/api";

let apiRequest;
let ApiError;

// ============================================
// MOCK API RESPONSE
// ============================================

function mockResponse(
  result = { success: true, data: [] },
  {
    status = 200,
    ok = status >= 200 && status < 300,
    invalidJSON = false,
  } = {}
) {
  const response = {
    ok,
    status,
    json: invalidJSON
      ? vi.fn().mockRejectedValue(
          new SyntaxError("Invalid JSON")
        )
      : vi.fn().mockResolvedValue(result),
  };

  fetch.mockResolvedValueOnce(response);

  return response;
}

function lastFetchCall() {
  expect(fetch).toHaveBeenCalledTimes(1);

  const [url, options] = fetch.mock.calls[0];

  return { url, options };
}

// ============================================
// TEST SETUP
// ============================================

beforeEach(async () => {
  vi.resetModules();

  vi.stubEnv(
    "VITE_API_BASE_URL",
    TEST_BASE_URL
  );

  vi.stubGlobal("fetch", vi.fn());

  // api.js reads VITE_API_BASE_URL
  // when the module is imported.
  ({ apiRequest, ApiError } =
    await import("./api.js"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ============================================
// 1. API CONFIGURATION
// ============================================

describe("API configuration", () => {
  test("removes trailing slashes from base URL", async () => {
    mockResponse();

    await apiRequest("/medicines");

    const { url } = lastFetchCall();

    expect(url).toBe(
      `${EXPECTED_BASE_URL}/medicines`
    );
  });

  test("preserves query parameters in request path", async () => {
    mockResponse();

    await apiRequest(
      "/medicines?status=active&page=2"
    );

    const { url } = lastFetchCall();

    expect(url).toBe(
      `${EXPECTED_BASE_URL}/medicines?status=active&page=2`
    );
  });

  test("throws ApiError when API URL is not configured", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    vi.resetModules();

    const { apiRequest: unconfiguredRequest } =
      await import("./api.js");

    await expect(
      unconfiguredRequest("/medicines")
    ).rejects.toMatchObject({
      name: "ApiError",
      message:
        "VITE_API_BASE_URL is not configured.",
      status: 0,
    });

    expect(fetch).not.toHaveBeenCalled();
  });
});

// ============================================
// 2. API ERROR CLASS
// ============================================

describe("ApiError", () => {
  test("creates an error with default status and data", () => {
    const error = new ApiError(
      "Something went wrong"
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ApiError");
    expect(error.message).toBe(
      "Something went wrong"
    );
    expect(error.status).toBe(0);
    expect(error.data).toBeNull();
  });

  test("supports custom status and data", () => {
    const data = {
      field: "email",
    };

    const error = new ApiError(
      "Invalid email",
      400,
      data
    );

    expect(error.status).toBe(400);
    expect(error.data).toEqual(data);
  });
});

// ============================================
// 3. REQUEST METHODS AND HEADERS
// ============================================

describe("apiRequest request formatting", () => {
  test("uses GET by default", async () => {
    mockResponse();

    await apiRequest("/users");

    const { options } = lastFetchCall();

    expect(options.method).toBe("GET");
  });

  test("sends Accept application/json header", async () => {
    mockResponse();

    await apiRequest("/users");

    const { options } = lastFetchCall();

    expect(options.headers).toEqual({
      Accept: "application/json",
    });
  });

  test("does not send request body for GET", async () => {
    mockResponse();

    await apiRequest("/users");

    const { options } = lastFetchCall();

    expect(options.body).toBeUndefined();

    expect(
      options.headers
    ).not.toHaveProperty("Content-Type");
  });

  test("sends Authorization header with JWT token", async () => {
    mockResponse();

    await apiRequest("/users", {
      token: "sample-jwt-token",
    });

    const { options } = lastFetchCall();

    expect(
      options.headers.Authorization
    ).toBe("Bearer sample-jwt-token");
  });

  test("omits Authorization header when token is absent", async () => {
    mockResponse();

    await apiRequest("/users");

    const { options } = lastFetchCall();

    expect(
      options.headers
    ).not.toHaveProperty("Authorization");
  });

  test("omits Authorization header when token is empty", async () => {
    mockResponse();

    await apiRequest("/users", {
      token: "",
    });

    const { options } = lastFetchCall();

    expect(
      options.headers
    ).not.toHaveProperty("Authorization");
  });

  test.each([
    "POST",
    "PATCH",
    "PUT",
    "DELETE",
  ])(
    "supports %s method",
    async (method) => {
      mockResponse();

      await apiRequest("/users", {
        method,
      });

      const { options } = lastFetchCall();

      expect(options.method).toBe(method);
    }
  );

  test("sends JSON body in POST request", async () => {
    mockResponse();

    const body = {
      name: "Ravi Kumar",
      email: "ravi@example.com",
    };

    await apiRequest("/users", {
      method: "POST",
      body,
    });

    const { options } = lastFetchCall();

    expect(
      options.headers["Content-Type"]
    ).toBe("application/json");

    expect(options.body).toBe(
      JSON.stringify(body)
    );
  });

  test("sends JSON body in PATCH request", async () => {
    mockResponse();

    const body = {
      currentPassword: "Old123!",
      newPassword: "New456!",
    };

    await apiRequest(
      "/users/change-password",
      {
        method: "PATCH",
        body,
        token: "abc123",
      }
    );

    const { url, options } = lastFetchCall();

    expect(url).toBe(
      `${EXPECTED_BASE_URL}/users/change-password`
    );

    expect(options.method).toBe("PATCH");
    expect(options.body).toBe(
      JSON.stringify(body)
    );

    expect(
      options.headers.Authorization
    ).toBe("Bearer abc123");
  });

  test("sends empty object as JSON", async () => {
    mockResponse();

    await apiRequest("/users", {
      method: "POST",
      body: {},
    });

    const { options } = lastFetchCall();

    expect(options.body).toBe("{}");

    expect(
      options.headers["Content-Type"]
    ).toBe("application/json");
  });

  test("sends null body as JSON null", async () => {
    mockResponse();

    await apiRequest("/users", {
      method: "POST",
      body: null,
    });

    const { options } = lastFetchCall();

    expect(options.body).toBe("null");

    expect(
      options.headers["Content-Type"]
    ).toBe("application/json");
  });

  test("supports JSON arrays as request body", async () => {
    mockResponse();

    const body = [
      { batch_id: 1, quantity: 2 },
      { batch_id: 2, quantity: 3 },
    ];

    await apiRequest("/sales", {
      method: "POST",
      body,
    });

    const { options } = lastFetchCall();

    expect(
      JSON.parse(options.body)
    ).toEqual(body);
  });

  test("passes AbortSignal to fetch", async () => {
    mockResponse();

    await apiRequest("/inventory");

    const { options } = lastFetchCall();

    expect(
      options.signal
    ).toBeInstanceOf(AbortSignal);

    expect(
      options.signal.aborted
    ).toBe(false);
  });
});

// ============================================
// 4. SUCCESSFUL API RESPONSES
// ============================================

describe("apiRequest successful responses", () => {
  test("returns successful API response", async () => {
    const responseData = {
      success: true,
      message: "Medicines loaded.",
      data: [
        { medicine_id: 1, name: "Paracetamol" },
      ],
    };

    mockResponse(responseData);

    const result = await apiRequest(
      "/medicines"
    );

    expect(result).toEqual(responseData);
  });

  test("returns the original response object", async () => {
    const responseData = {
      success: true,
      data: { id: 10 },
    };

    mockResponse(responseData);

    const result = await apiRequest(
      "/users/10"
    );

    expect(result).toBe(responseData);
  });

  test("accepts response without success property", async () => {
    const responseData = {
      data: ["A", "B"],
    };

    mockResponse(responseData);

    await expect(
      apiRequest("/example")
    ).resolves.toEqual(responseData);
  });

  test("accepts an empty response object", async () => {
    mockResponse({});

    await expect(
      apiRequest("/example")
    ).resolves.toEqual({});
  });

  test("reads response JSON once", async () => {
    const response = mockResponse({
      success: true,
      data: [],
    });

    await apiRequest("/users");

    expect(
      response.json
    ).toHaveBeenCalledTimes(1);
  });
});

// ============================================
// 5. HTTP ERROR RESPONSES
// ============================================

describe("apiRequest HTTP errors", () => {
  test("throws ApiError for HTTP 400", async () => {
    mockResponse(
      {
        success: false,
        message: "Invalid request.",
      },
      { status: 400 }
    );

    await expect(
      apiRequest("/users", {
        method: "POST",
        body: {},
      })
    ).rejects.toMatchObject({
      name: "ApiError",
      message: "Invalid request.",
      status: 400,
      data: null,
    });
  });

  test("preserves HTTP 401 status and message", async () => {
    mockResponse(
      {
        message: "Unauthorized access.",
      },
      { status: 401 }
    );

    await expect(
      apiRequest("/inventory", {
        token: "expired-token",
      })
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      message: "Unauthorized access.",
    });
  });

  test("preserves HTTP 403 status", async () => {
    mockResponse(
      {
        message: "Access forbidden.",
      },
      { status: 403 }
    );

    await expect(
      apiRequest("/users")
    ).rejects.toMatchObject({
      status: 403,
      message: "Access forbidden.",
    });
  });

  test("includes backend error data", async () => {
    const errorData = {
      field: "email",
      reason: "duplicate",
    };

    mockResponse(
      {
        message: "Email already exists.",
        data: errorData,
      },
      { status: 409 }
    );

    await expect(
      apiRequest("/users")
    ).rejects.toMatchObject({
      status: 409,
      message: "Email already exists.",
      data: errorData,
    });
  });

  test("uses fallback message when HTTP error has no message", async () => {
    mockResponse(
      {},
      { status: 500 }
    );

    await expect(
      apiRequest("/users")
    ).rejects.toMatchObject({
      status: 500,
      message:
        "The request failed. Please try again.",
    });
  });

  test("handles HTTP error with invalid JSON", async () => {
    mockResponse(
      null,
      {
        status: 502,
        invalidJSON: true,
      }
    );

    await expect(
      apiRequest("/users")
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 502,
      message:
        "The request failed. Please try again.",
    });
  });

  test("preserves falsy non-null error data", async () => {
    mockResponse(
      {
        message: "Failed",
        data: 0,
      },
      { status: 400 }
    );

    await expect(
      apiRequest("/users")
    ).rejects.toMatchObject({
      status: 400,
      data: 0,
    });
  });
});

// ============================================
// 6. APPLICATION-LEVEL API ERRORS
// ============================================

describe("apiRequest application errors", () => {
  test("rejects success false even with HTTP 200", async () => {
    mockResponse({
      success: false,
      message: "Operation failed.",
      data: null,
    });

    await expect(
      apiRequest("/users")
    ).rejects.toMatchObject({
      name: "ApiError",
      message: "Operation failed.",
      status: 200,
    });
  });

  test("uses status supplied by response body", async () => {
    mockResponse({
      success: false,
      status: 422,
      message: "Validation failed.",
    });

    await expect(
      apiRequest("/users")
    ).rejects.toMatchObject({
      status: 422,
      message: "Validation failed.",
    });
  });

  test("uses fallback for application error without message", async () => {
    mockResponse({
      success: false,
    });

    await expect(
      apiRequest("/example")
    ).rejects.toMatchObject({
      message: "The request failed.",
      status: 200,
    });
  });

  test("preserves application-level error data", async () => {
    const details = {
      password: "Too short",
    };

    mockResponse({
      success: false,
      status: 400,
      message: "Invalid password.",
      data: details,
    });

    await expect(
      apiRequest("/users/change-password")
    ).rejects.toMatchObject({
      status: 400,
      data: details,
    });
  });
});

// ============================================
// 7. INVALID SUCCESS RESPONSES
// ============================================

describe("apiRequest invalid responses", () => {
  test.each([
    null,
    "unexpected text",
    123,
    false,
  ])(
    "rejects invalid response value %j",
    async (responseValue) => {
      mockResponse(responseValue);

      await expect(
        apiRequest("/example")
      ).rejects.toMatchObject({
        name: "ApiError",
        message:
          "The server returned an invalid response.",
      });
    }
  );

  test("rejects malformed JSON from HTTP 200", async () => {
    mockResponse(
      null,
      { invalidJSON: true }
    );

    await expect(
      apiRequest("/example")
    ).rejects.toMatchObject({
      name: "ApiError",
      message:
        "The server returned an invalid response.",
    });
  });
});

// ============================================
// 8. NETWORK ERRORS
// ============================================

describe("apiRequest network failures", () => {
  test("converts fetch network errors into ApiError", async () => {
    fetch.mockRejectedValueOnce(
      new TypeError("Failed to fetch")
    );

    await expect(
      apiRequest("/medicines")
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 0,
      message:
        "Unable to connect to the server. Check your connection and try again.",
    });
  });

  test("does not expose raw network error details", async () => {
    fetch.mockRejectedValueOnce(
      new Error("Internal network details")
    );

    await expect(
      apiRequest("/users")
    ).rejects.toMatchObject({
      message:
        "Unable to connect to the server. Check your connection and try again.",
    });
  });

  test("converts AbortError into timeout error", async () => {
    const error = new Error("Aborted");
    error.name = "AbortError";

    fetch.mockRejectedValueOnce(error);

    await expect(
      apiRequest("/inventory")
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 0,
      message:
        "The request timed out. Please try again.",
    });
  });

  test("rethrows an existing ApiError unchanged", async () => {
    const originalError = new ApiError(
      "Custom API error",
      418
    );

    fetch.mockRejectedValueOnce(
      originalError
    );

    await expect(
      apiRequest("/example")
    ).rejects.toBe(originalError);
  });
});

// ============================================
// 9. REQUEST TIMEOUT AND CLEANUP
// ============================================

describe("apiRequest timeout", () => {
  test("aborts a pending request after 15 seconds", async () => {
    vi.useFakeTimers();

    let requestSignal;

    fetch.mockImplementationOnce(
      (_url, options) => {
        requestSignal = options.signal;

        // Simulate fetch remaining pending until
        // its AbortSignal is aborted.
        return new Promise((_resolve, reject) => {
          requestSignal.addEventListener(
            "abort",
            () => {
              const error = new Error(
                "Request aborted"
              );
              error.name = "AbortError";
              reject(error);
            },
            { once: true }
          );
        });
      }
    );

    const promise = apiRequest("/slow-request");

    // Attach the rejection assertion before
    // advancing timers to avoid unhandled errors.
    const assertion = expect(
      promise
    ).rejects.toMatchObject({
      name: "ApiError",
      message:
        "The request timed out. Please try again.",
    });

    expect(requestSignal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(14999);

    expect(requestSignal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);

    expect(requestSignal.aborted).toBe(true);

    await assertion;
  });

  test("clears timeout after successful request", async () => {
    vi.useFakeTimers();

    mockResponse({
      success: true,
      data: [],
    });

    await apiRequest("/inventory");

    const { options } = lastFetchCall();

    expect(options.signal.aborted).toBe(false);

    // If the timer wasn't cleared, the
    // AbortSignal would become aborted.
    await vi.advanceTimersByTimeAsync(15000);

    expect(options.signal.aborted).toBe(false);
  });

  test("clears timeout after API error", async () => {
    vi.useFakeTimers();

    mockResponse(
      { message: "Server error" },
      { status: 500 }
    );

    await expect(
      apiRequest("/inventory")
    ).rejects.toMatchObject({
      status: 500,
    });

    const { options } = lastFetchCall();

    await vi.advanceTimersByTimeAsync(15000);

    expect(options.signal.aborted).toBe(false);
  });

  test("clears timeout after network failure", async () => {
    vi.useFakeTimers();

    fetch.mockRejectedValueOnce(
      new TypeError("Network disconnected")
    );

    await expect(
      apiRequest("/inventory")
    ).rejects.toBeInstanceOf(ApiError);

    const { options } = lastFetchCall();

    await vi.advanceTimersByTimeAsync(15000);

    expect(options.signal.aborted).toBe(false);
  });
});
