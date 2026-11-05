import { ApiError } from "./api";

function normalizeCustomer(data) {
  const userId = Number(data?.user_id);

  if (
    !Number.isSafeInteger(userId) ||
    userId <= 0 ||
    typeof data?.name !== "string" ||
    typeof data?.email !== "string"
  ) {
    throw new ApiError(
      "The server returned incomplete customer details.",
      502
    );
  }

  return {
    user_id: userId,
    name: data.name,
    email: data.email,
  };
}

export async function lookupCustomer(authenticatedRequest, email) {
  const query = new URLSearchParams({
    email: email.trim(),
  });

  const response = await authenticatedRequest(
    `/users/customers/lookup?${query.toString()}`
  );

  return normalizeCustomer(response.data);
}

export async function createCustomer(authenticatedRequest, values) {
  const response = await authenticatedRequest("/users/customers", {
    method: "POST",
    body: {
      name: values.name.trim(),
      email: values.email.trim(),
    },
  });

  return normalizeCustomer(response.data);
}