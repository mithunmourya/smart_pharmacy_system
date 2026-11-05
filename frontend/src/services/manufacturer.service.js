export async function getManufacturers(request) {
  try {
    const response = await request("/manufacturers");

    if (!Array.isArray(response.data)) {
      throw new Error("The server returned an invalid manufacturers list.");
    }

    return response.data.map((manufacturer) => ({
      manufacturer_id: manufacturer.manufacturer_id,
      name: manufacturer.name,
      created_at: manufacturer.created_at,
      is_active: Number(manufacturer.is_active) === 1,
    }));
  } catch (error) {
    if (
      error.status === 404 &&
      error.message === "No manufacturers found."
    ) {
      return [];
    }

    throw error;
  }
}

export function createManufacturer(request, name) {
  return request("/manufacturers", {
    method: "POST",
    body: { name: name.trim() },
  });
}

export function updateManufacturer(request, manufacturerId, name) {
  return request(`/manufacturers/${manufacturerId}`, {
    method: "PUT",
    body: { name: name.trim() },
  });
}

export function deactivateManufacturer(request, manufacturerId) {
  return request(`/manufacturers/${manufacturerId}/deactivate`, {
    method: "PATCH",
  });
}

export function restoreManufacturer(request, manufacturerId) {
  return request(`/manufacturers/${manufacturerId}/restore`, {
    method: "PATCH",
  });
}