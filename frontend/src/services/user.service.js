export async function getUsers(request) {
  try {
    const response = await request("/users");

    if (!Array.isArray(response.data)) {
      throw new Error("The server returned an invalid users list.");
    }

    return response.data.map((user) => ({
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
      is_active: Number(user.is_active) === 1,
    }));
  } catch (error) {
    if (error.status === 404 && error.message === "No users found.") {
      return [];
    }

    throw error;
  }
}

export function createUser(request, values) {
  return request("/users/register", {
    method: "POST",
    body: {
      name: values.name.trim(),
      email: values.email.trim(),
      password: values.password,
      role: values.role,
    },
  });
}

export function updateUser(request, userId, values) {
  return request(`/users/${userId}`, {
    method: "PUT",
    body: {
      name: values.name.trim(),
      email: values.email.trim(),
    },
  });
}

export function deactivateUser(request, userId) {
  return request(`/users/${userId}/deactivate`, {
    method: "PATCH",
  });
}

export function restoreUser(request, userId) {
  return request(`/users/${userId}/restore`, {
    method: "PATCH",
  });
}