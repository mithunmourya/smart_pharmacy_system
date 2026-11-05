import { ApiError } from "./api";

function normalizePurchase(purchase) {
  return {
    ...purchase,
    sale_id: Number(purchase.sale_id),
    total_amount: Number(purchase.total_amount),
    pharmacist_name: purchase.pharmacist_name || "—",
  };
}

export async function getMyPurchases(authenticatedRequest) {
  const response = await authenticatedRequest("/sales/my-purchases");

  if (!Array.isArray(response.data)) {
    throw new ApiError("Unable to read your purchase history.", 502);
  }

  return response.data.map(normalizePurchase);
}

export async function getMyPurchaseById(
  authenticatedRequest,
  saleId
) {
  const response = await authenticatedRequest(
    `/sales/my-purchases/${saleId}`
  );

  if (
    !response.data ||
    !Array.isArray(response.data.items)
  ) {
    throw new ApiError("Unable to read the purchase details.", 502);
  }

  return {
    ...normalizePurchase(response.data),
    items: response.data.items.map((item) => ({
      ...item,
      sale_item_id: Number(item.sale_item_id),
      quantity: Number(item.quantity),
      selling_price: Number(item.selling_price),
      subtotal: Number(item.subtotal),
    })),
  };
}