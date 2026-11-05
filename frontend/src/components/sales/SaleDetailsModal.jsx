import { useEffect, useState } from "react";
import Modal from "../Modal";
import useAuth from "../../hooks/useAuth";
import { getSaleById } from "../../services/sales.service";
import { getMyPurchaseById } from "../../services/purchase.service";
import { formatPrice } from "../../utils/batch";

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function SaleDetailsModal({
  saleId,
  audience = "admin",
  onClose,
}) {
  const { authenticatedRequest } = useAuth();

  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const isCustomer = audience === "customer";

  useEffect(() => {
    let ignore = false;

    async function loadDetails() {
      setLoading(true);
      setError("");

      try {
        const data = isCustomer
          ? await getMyPurchaseById(authenticatedRequest, saleId)
          : await getSaleById(authenticatedRequest, saleId);

        if (!ignore) {
          setSale(data);
        }
      } catch (requestError) {
        if (!ignore) {
          setError(
            requestError.message || "Unable to load medicine details."
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadDetails();

    return () => {
      ignore = true;
    };
  }, [authenticatedRequest, saleId, isCustomer, reloadKey]);

  const totalUnits =
    sale?.items.reduce(
      (total, item) => total + item.quantity,
      0
    ) ?? 0;

  return (
    <Modal
      title={isCustomer ? "Purchased medicines" : "Sale details"}
      onClose={onClose}
    >
      <div
        id={isCustomer ? "purchase-details" : "admin-sale-details"}
        aria-busy={loading}
        className="space-y-5"
      >
        {loading ? (
          <p
            role="status"
            className="py-6 text-center text-sm text-text-secondary"
          >
            Loading medicine details...
          </p>
        ) : error ? (
          <div className="space-y-3">
            <p
              role="alert"
              className="rounded-xl border border-danger/40
                         bg-danger/10 px-4 py-3 text-sm"
            >
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                setReloadKey((previous) => previous + 1)
              }
              className="min-h-11 rounded-lg border border-border
                         px-4 py-2 text-sm font-medium
                         hover:bg-surface-hover
                         focus-visible:outline-2
                         focus-visible:outline-primary"
            >
              Retry
            </button>
          </div>
        ) : sale ? (
          <>
            <div>
              <h3 className="font-semibold">
                {isCustomer ? "Purchase" : "Sale"} #{sale.sale_id}
              </h3>

              <p className="mt-1 text-sm text-text-secondary">
                {formatDateTime(sale.created_at)}
              </p>
            </div>

            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {!isCustomer && (
                <div className="min-w-0">
                  <dt className="text-xs text-text-secondary">
                    Customer
                  </dt>
                  <dd className="mt-1 break-words text-sm font-medium">
                    {sale.customer_name}
                  </dd>
                </div>
              )}

              <div className="min-w-0">
                <dt className="text-xs text-text-secondary">
                  {isCustomer ? "Served by" : "Pharmacist"}
                </dt>
                <dd className="mt-1 break-words text-sm font-medium">
                  {sale.pharmacist_name}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-text-secondary">
                  Payment mode
                </dt>
                <dd className="mt-1 text-sm font-medium">
                  {sale.payment_mode}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-text-secondary">
                  Total units
                </dt>
                <dd className="mt-1 text-sm font-medium tabular-nums">
                  {totalUnits}
                </dd>
              </div>
            </dl>

            <p className="text-xs leading-5 text-text-secondary">
              Quantities and prices recorded at the time of purchase.
              A medicine may appear in more than one batch.
            </p>

            {sale.items.length === 0 ? (
              <p className="rounded-xl border border-border p-4 text-sm text-text-secondary">
                No medicine details are available for this sale.
              </p>
            ) : (
              <div
                role="region"
                aria-label={`Medicines for sale ${sale.sale_id}`}
                tabIndex={0}
                className="overflow-x-auto rounded-xl border border-border
                           focus-visible:outline-2
                           focus-visible:outline-primary"
              >
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="bg-background text-xs text-text-secondary">
                    <tr>
                      <th
                        scope="col"
                        className="px-4 py-3 font-medium"
                      >
                        Medicine
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 font-medium"
                      >
                        Batch
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-right font-medium"
                      >
                        Qty
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-right font-medium"
                      >
                        Unit price
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-right font-medium"
                      >
                        Subtotal
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-border">
                    {sale.items.map((item) => (
                      <tr key={item.sale_item_id}>
                        <td className="max-w-56 break-words px-4 py-4">
                          <p className="font-medium">
                            {item.medicine_name}
                          </p>
                          <p className="mt-1 text-xs text-text-secondary">
                            {item.manufacturer_name}
                          </p>
                        </td>

                        <td className="max-w-40 break-words px-4 py-4">
                          {item.batch_number}
                        </td>

                        <td className="px-4 py-4 text-right tabular-nums">
                          {item.quantity}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums">
                          {formatPrice(item.selling_price)}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-right font-medium tabular-nums">
                          {formatPrice(item.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3">
              <span className="text-sm font-semibold">
                Total amount
              </span>
              <span className="text-lg font-bold tabular-nums">
                {formatPrice(sale.total_amount)}
              </span>
            </div>
          </>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="min-h-12 w-full rounded-xl border border-border
                     px-5 py-3 text-sm font-semibold
                     hover:bg-surface-hover
                     focus-visible:outline-2
                     focus-visible:outline-primary"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}