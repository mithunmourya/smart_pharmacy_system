function normalizeBatch(batch) {
  return {
    batch_id: batch.batch_id,
    medicine_id: batch.medicine_id,
    batch_number: batch.batch_number,
    purchase_price: batch.purchase_price,
    selling_price: batch.selling_price,
    stock_quantity: Number(batch.stock_quantity),
    expiry_date: batch.expiry_date,
    is_active: Number(batch.is_active) === 1,
    created_at: batch.created_at,
  };
}

export async function getBatchesByMedicine(request, medicineId) {
  try {
    const response = await request(`/batches/medicine/${medicineId}`);

    if (!Array.isArray(response.data)) {
      throw new Error("The server returned an invalid batches list.");
    }

    return response.data.map(normalizeBatch);
  } catch (error) {
    if (
      error.status === 404 &&
      error.message === "No batches found for this medicine."
    ) {
      return [];
    }

    throw error;
  }
}

export async function getBatch(request, batchId) {
  const response = await request(`/batches/${batchId}`);

  if (!response.data?.batch_id) {
    throw new Error("The server returned invalid batch details.");
  }

  return normalizeBatch(response.data);
}

function batchDetails(values) {
  return {
    batch_number: values.batch_number.trim(),
    purchase_price: Number(values.purchase_price),
    selling_price: Number(values.selling_price),
    expiry_date: values.expiry_date,
  };
}

export function createBatch(request, medicineId, values) {
  return request("/batches", {
    method: "POST",
    body: {
      ...batchDetails(values),
      medicine_id: Number(medicineId),
      stock_quantity: Number(values.stock_quantity),
    },
  });
}

export function updateBatch(request, batchId, values) {
  return request(`/batches/${batchId}`, {
    method: "PUT",
    body: batchDetails(values),
  });
}

export function adjustBatchStock(request, batchId, quantity) {
  return request(`/batches/${batchId}/stock`, {
    method: "PATCH",
    body: {
      quantity: Number(quantity),
    },
  });
}

export function deactivateBatch(request, batchId) {
  return request(`/batches/${batchId}/deactivate`, {
    method: "PATCH",
  });
}

export function restoreBatch(request, batchId) {
  return request(`/batches/${batchId}/restore`, {
    method: "PATCH",
  });
}