import { apiRequest, ApiError } from "./api";

export async function loginUser({ email, password }) {
  const response = await apiRequest("/users/login", {
    method: "POST",
    body: {
      email: email.trim(),
      password,
    },
  });

  const session = response.data;

  if (
    typeof session?.token !== "string" ||
    !session.token ||
    !session.user?.user_id ||
    !session.user?.role
  ) {
    throw new ApiError("The server returned incomplete login details.");
  }

  return session;
}