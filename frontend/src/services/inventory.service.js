function normalizeMedicine(item) {
  return {
    medicine_id: item.medicine_id,
    medicine_name: item.medicine_name,
    manufacturer_id: item.manufacturer_id,
    manufacturer_name: item.manufacturer_name,
    category: item.category,
    reorder_level: Number(item.reorder_level),
    available_stock: Number(item.available_stock),
  };
}

export async function getAvailableInventory(request) {
  try {
    const response = await request("/batches/inventory");

    if (!Array.isArray(response.data)) {
      throw new Error("The server returned an invalid inventory list.");
    }

    return response.data.map((item) => {
      if (!Array.isArray(item.batches)) {
        throw new Error("The server returned invalid inventory batches.");
      }

      const batches = item.batches
        .map((batch) => ({
          batch_id: batch.batch_id,
          batch_number: batch.batch_number,
          selling_price: Number(batch.selling_price),
          stock_quantity: Number(batch.stock_quantity),
          expiry_date: batch.expiry_date,
          days_to_expire: Number(batch.days_to_expire),
        }))
        .sort(
          (first, second) =>
            first.days_to_expire - second.days_to_expire ||
            Number(first.batch_id) - Number(second.batch_id)
        );

      return {
        ...normalizeMedicine(item),
        batches,
        earliest_expiry_days: batches.length
          ? batches[0].days_to_expire
          : null,
        earliest_expiry_date: batches[0]?.expiry_date ?? null,
      };
    });
  } catch (error) {
    if (error.status === 404 && error.message === "No inventory found.") {
      return [];
    }

    throw error;
  }
}

export async function getLowStock(request) {
  try {
    const response = await request("/batches/low-stock");

    if (!Array.isArray(response.data)) {
      throw new Error("The server returned an invalid low-stock list.");
    }

    return response.data.map((item) => {
      const medicine = normalizeMedicine(item);

      return {
        ...medicine,
        stock_status:
          medicine.available_stock === 0 ? "Out of stock" : "Low stock",
        units_to_threshold: Math.max(
          0,
          medicine.reorder_level - medicine.available_stock
        ),
      };
    });
  } catch (error) {
    if (
      error.status === 404 &&
      error.message === "No low stock medicines found."
    ) {
      return [];
    }

    throw error;
  }
}