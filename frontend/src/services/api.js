const BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export async function apiRequest(
  path,
  { method = "GET", body, token } = {}
) {
  if (!BASE_URL) {
    throw new ApiError("VITE_API_BASE_URL is not configured.");
  }

  const headers = {
    Accept: "application/json",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      throw new ApiError(
        result?.message || "The request failed. Please try again.",
        response.status,
        result?.data ?? null
      );
    }

    if (!result || typeof result !== "object") {
      throw new ApiError("The server returned an invalid response.");
    }

    if (result.success === false) {
      throw new ApiError(
        result.message || "The request failed.",
        result.status || response.status,
        result.data ?? null
      );
    }

    return result;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error.name === "AbortError") {
      throw new ApiError("The request timed out. Please try again.");
    }

    throw new ApiError(
      "Unable to connect to the server. Check your connection and try again."
    );
  } finally {
    window.clearTimeout(timeoutId);
  }
}