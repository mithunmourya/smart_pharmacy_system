import { ApiError } from "./api";

export const PAYMENT_MODES = ["Cash", "Card", "UPI"];

function normalizeSale(sale) {
  return {
    ...sale,
    sale_id: Number(sale.sale_id),
    total_amount: Number(sale.total_amount),
    customer_name: sale.customer_name || "Walk-in customer",
    pharmacist_name: sale.pharmacist_name || "—",
  };
}

function normalizeSaleItem(item) {
  return {
    ...item,
    sale_item_id: Number(item.sale_item_id),
    sale_id: Number(item.sale_id),
    medicine_id: Number(item.medicine_id),
    batch_id: Number(item.batch_id),
    quantity: Number(item.quantity),
    selling_price: Number(item.selling_price),
    subtotal: Number(item.subtotal),
  };
}

export async function createSale(authenticatedRequest, values) {
  const customerId = values.customer_id ?? null;

  if (
    customerId !== null &&
    (!Number.isSafeInteger(customerId) || customerId <= 0)
  ) {
    throw new ApiError(
      "Select a valid customer before checkout.",
      400
    );
  }

  const response = await authenticatedRequest("/sales", {
    method: "POST",
    body: {
      customer_id: customerId,
      payment_mode: values.payment_mode,
      items: values.items.map((item) => ({
        batch_id: Number(item.batch_id),
        quantity: Number(item.quantity),
      })),
    },
  });

  const saleId = Number(response.data?.sale_id);
  const totalAmount = Number(response.data?.total_amount);

  if (
    !Number.isSafeInteger(saleId) ||
    saleId <= 0 ||
    response.data?.total_amount == null ||
    !Number.isFinite(totalAmount)
  ) {
    throw new Error(
      "The server response could not confirm the sale. Ask an admin to check Sales History."
    );
  }

  return {
    sale_id: saleId,
    total_amount: totalAmount,
  };
}

export async function getSales(authenticatedRequest) {
  try {
    const response = await authenticatedRequest("/sales");

    if (!Array.isArray(response.data)) {
      throw new ApiError("Unable to read sales history.", 502);
    }

    return response.data.map(normalizeSale);
  } catch (error) {
    if (
      error.status === 404 &&
      error.message === "No sales found."
    ) {
      return [];
    }

    throw error;
  }
}

export async function getSaleById(authenticatedRequest, saleId) {
  const response = await authenticatedRequest(`/sales/${saleId}`);

  if (
    !response.data ||
    !Array.isArray(response.data.items)
  ) {
    throw new ApiError(
      "Medicine details were not returned. Check that the backend sale-details update is installed.",
      502
    );
  }

  return {
    ...normalizeSale(response.data),
    items: response.data.items.map(normalizeSaleItem),
  };
}