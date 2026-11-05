export const MEDICINE_CATEGORIES = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Injection",
  "Ointment",
  "Drops",
  "Powder",
  "Other",
];

export async function getMedicines(request) {
  try {
    const response = await request("/medicines");

    if (!Array.isArray(response.data)) {
      throw new Error("The server returned an invalid medicines list.");
    }

    return response.data.map((medicine) => ({
      medicine_id: medicine.medicine_id,
      name: medicine.name,
      manufacturer_id: medicine.manufacturer_id,
      manufacturer: medicine.manufacturer,
      manufacturer_is_active:
        Number(medicine.manufacturer_is_active) === 1,
      category: medicine.category,
      reorder_level: Number(medicine.reorder_level),
      created_at: medicine.created_at,
      medicine_is_active: Number(medicine.medicine_is_active) === 1,
    }));
  } catch (error) {
    if (error.status === 404 && error.message === "No medicines found.") {
      return [];
    }

    throw error;
  }
}

function medicineBody(values) {
  return {
    name: values.name.trim(),
    manufacturer_id: Number(values.manufacturer_id),
    category: values.category,
    reorder_level: Number(values.reorder_level),
  };
}

export function createMedicine(request, values) {
  return request("/medicines", {
    method: "POST",
    body: medicineBody(values),
  });
}

export function updateMedicine(request, medicineId, values) {
  return request(`/medicines/${medicineId}`, {
    method: "PUT",
    body: medicineBody(values),
  });
}

export function deactivateMedicine(request, medicineId) {
  return request(`/medicines/${medicineId}/deactivate`, {
    method: "PATCH",
  });
}

export function restoreMedicine(request, medicineId) {
  return request(`/medicines/${medicineId}/restore`, {
    method: "PATCH",
  });
}