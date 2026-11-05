import { useEffect, useRef, useState } from "react";
import Button from "../../components/Button";
import CustomerSelector from "../../components/sales/CustomerSelector";
import {
  CompactHeader,
  FilterField,
  SummaryBadge,
} from "../../components/CompactInventoryUI";
import useAuth from "../../hooks/useAuth";
import { getAvailableInventory } from "../../services/inventory.service";
import {
  createSale,
  PAYMENT_MODES,
} from "../../services/sales.service";
import {
  formatBatchDate,
  formatPrice,
} from "../../utils/batch";

const actionClass = `
  inline-flex min-h-11 items-center justify-center rounded-lg
  border border-border px-3 py-2 text-sm font-medium
  text-text-primary transition-colors hover:bg-surface-hover
  focus-visible:outline-2 focus-visible:outline-offset-2
  focus-visible:outline-primary
  disabled:cursor-not-allowed disabled:opacity-50
`;

function toMinorUnits(value) {
  return Math.round(Number(value) * 100);
}

export default function NewSale() {
  const { authenticatedRequest } = useAuth();

  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");

  const [customerSelection, setCustomerSelection] = useState({
    mode: "walk-in",
    customer: null,
  });
  const [customerBusy, setCustomerBusy] = useState(false);
  const [customerResetKey, setCustomerResetKey] = useState(0);

  const [cart, setCart] = useState([]);
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [submitting, setSubmitting] = useState(false);
  const [saleError, setSaleError] = useState("");
  const [result, setResult] = useState(null);

  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [checkedWithAdmin, setCheckedWithAdmin] = useState(false);

  const submittingRef = useRef(false);

  useEffect(() => {
    let ignore = false;

    async function loadInventory() {
      setLoading(true);
      setInventoryError("");

      try {
        const data = await getAvailableInventory(authenticatedRequest);

        if (!ignore) {
          setInventory(data);
        }
      } catch (error) {
        if (!ignore) {
          setInventoryError(
            error.message || "Unable to load available inventory."
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadInventory();

    return () => {
      ignore = true;
    };
  }, [authenticatedRequest, reloadKey]);

  const batches = inventory
    .flatMap((medicine) =>
      medicine.batches.map((batch) => ({
        ...batch,
        batch_id: Number(batch.batch_id),
        stock_quantity: Number(batch.stock_quantity),
        selling_price: Number(batch.selling_price),
        medicine_name: medicine.medicine_name,
        manufacturer_name: medicine.manufacturer_name,
        category: medicine.category,
      }))
    )
    .sort(
      (a, b) =>
        Number(a.days_to_expire) - Number(b.days_to_expire) ||
        a.medicine_name.localeCompare(b.medicine_name) ||
        a.batch_id - b.batch_id
    );

  const batchMap = new Map(
    batches.map((batch) => [batch.batch_id, batch])
  );

  const searchTerm = search.trim().toLowerCase();

  const visibleBatches = batches.filter((batch) =>
    [
      batch.medicine_name,
      batch.manufacturer_name,
      batch.batch_number,
      batch.category,
    ].some((value) =>
      String(value || "").toLowerCase().includes(searchTerm)
    )
  );

  const cartRows = cart.map((item) => {
    const batch = batchMap.get(item.batch_id);
    const quantity = Number(item.quantity);
    let error = "";

    if (!batch) {
      error = "This batch is no longer available. Remove it.";
    } else if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      error = "Enter a whole number greater than zero.";
    } else if (quantity > batch.stock_quantity) {
      error = `Only ${batch.stock_quantity} units are available.`;
    }

    return {
      ...item,
      batch,
      quantityNumber: quantity,
      error,
      subtotalMinor:
        batch && !error
          ? toMinorUnits(batch.selling_price) * quantity
          : 0,
    };
  });

  const totalMinor = cartRows.reduce(
    (total, item) => total + item.subtotalMinor,
    0
  );

  const totalUnits = cartRows.reduce(
    (total, item) =>
      total +
      (Number.isSafeInteger(item.quantityNumber) &&
      item.quantityNumber > 0
        ? item.quantityNumber
        : 0),
    0
  );

  const selectedCustomer = customerSelection.customer;
  const walkIn = customerSelection.mode === "walk-in";

  const customerReady =
    walkIn ||
    (Number.isSafeInteger(selectedCustomer?.user_id) &&
      selectedCustomer.user_id > 0);

  const customerLabel = walkIn
    ? "Walk-in customer"
    : selectedCustomer?.name || "Customer not selected";

  const hasInvalidRows = cartRows.some((item) => item.error);
  const locked = submitting || Boolean(result) || outcomeUnknown;

  const canSubmit =
    !locked &&
    !customerBusy &&
    customerReady &&
    !loading &&
    !inventoryError &&
    cartRows.length > 0 &&
    !hasInvalidRows;

  function handleCustomerChange(selection) {
    if (locked || submittingRef.current) return;

    setCustomerSelection(selection);
    setSaleError("");
  }

  function reloadInventory() {
    if (submittingRef.current) return;

    setLoading(true);
    setReloadKey((previous) => previous + 1);
  }

  function addBatch(batch) {
    if (locked || loading || inventoryError) return;

    setSaleError("");

    setCart((previous) => {
      const existing = previous.find(
        (item) => item.batch_id === batch.batch_id
      );

      if (!existing) {
        return [
          ...previous,
          {
            batch_id: batch.batch_id,
            medicine_name: batch.medicine_name,
            batch_number: batch.batch_number,
            quantity: "1",
          },
        ];
      }

      const currentQuantity = Number(existing.quantity);
      const nextQuantity =
        Number.isSafeInteger(currentQuantity) && currentQuantity > 0
          ? currentQuantity + 1
          : 1;

      if (nextQuantity > batch.stock_quantity) {
        return previous;
      }

      return previous.map((item) =>
        item.batch_id === batch.batch_id
          ? { ...item, quantity: String(nextQuantity) }
          : item
      );
    });
  }

  function updateQuantity(batchId, value) {
    if (locked) return;

    setSaleError("");
    setCart((previous) =>
      previous.map((item) =>
        item.batch_id === batchId
          ? { ...item, quantity: value }
          : item
      )
    );
  }

  function removeBatch(batchId) {
    if (locked) return;

    setSaleError("");
    setCart((previous) =>
      previous.filter((item) => item.batch_id !== batchId)
    );
  }

  function startNewSale() {
    if (submittingRef.current || customerBusy) return;
    if (outcomeUnknown && !checkedWithAdmin) return;

    setCart([]);
    setPaymentMode("Cash");
    setSaleError("");
    setResult(null);
    setOutcomeUnknown(false);
    setCheckedWithAdmin(false);
    setSearch("");

    setCustomerSelection({
      mode: "walk-in",
      customer: null,
    });
    setCustomerBusy(false);
    setCustomerResetKey((previous) => previous + 1);

    reloadInventory();
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submittingRef.current || locked) return;

    if (customerBusy || !customerReady) {
      setSaleError(
        "Select a customer, create an account, or choose Walk-in before checkout."
      );
      return;
    }

    if (!canSubmit) {
      setSaleError(
        "Add available stock and correct the quantities before completing the sale."
      );
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSaleError("");

    try {
      const savedSale = await createSale(authenticatedRequest, {
        customer_id: walkIn ? null : selectedCustomer.user_id,
        payment_mode: paymentMode,
        items: cartRows.map((item) => ({
          batch_id: item.batch_id,
          quantity: item.quantityNumber,
        })),
      });

      setResult(savedSale);
    } catch (error) {
      const status = Number(error.status || 0);

      // A lost response does not prove that the sale failed.
      if (!status || status >= 500 || status === 408) {
        setOutcomeUnknown(true);
        setSaleError(
          "We could not confirm whether this sale was saved. " +
            "Ask an admin to check Sales History before entering it again."
        );
      } else {
        setSaleError(error.message || "Unable to complete the sale.");

        if (status !== 401 && status !== 403) {
          setLoading(true);
          setReloadKey((previous) => previous + 1);
        }
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <CompactHeader
        title="New Sale"
        description="Choose a customer, add medicines, and review the sale."
        summary={
          <SummaryBadge count={cart.length}>
            Selected batches
          </SummaryBadge>
        }
      />

      {result && (
        <section
          role="status"
          className="rounded-2xl border border-success/40 bg-success/10 p-5"
        >
          <h2 className="text-lg font-semibold">
            Sale completed successfully
          </h2>

          <p className="mt-2 text-sm text-text-secondary">
            Sale #{result.sale_id} · Total{" "}
            <span className="font-semibold text-text-primary">
              {formatPrice(result.total_amount)}
            </span>
          </p>

          <p className="mt-1 break-words text-sm text-text-secondary">
            Customer: {customerLabel}
          </p>

          <button
            type="button"
            onClick={startNewSale}
            className={`${actionClass} mt-4`}
          >
            Start new sale
          </button>
        </section>
      )}

      {saleError && (
        <div
          role="alert"
          className="rounded-xl border border-danger/40
                     bg-danger/10 px-4 py-3 text-sm"
        >
          {saleError}
        </div>
      )}

      {outcomeUnknown && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <label className="flex items-start gap-3 text-sm leading-6">
            <input
              type="checkbox"
              checked={checkedWithAdmin}
              onChange={(event) =>
                setCheckedWithAdmin(event.target.checked)
              }
              className="mt-1 size-4 shrink-0 accent-primary"
            />
            <span>
              I have checked with an admin whether this sale was recorded.
            </span>
          </label>

          <button
            type="button"
            disabled={!checkedWithAdmin}
            onClick={startNewSale}
            className={`${actionClass} mt-4`}
          >
            Start a new cart
          </button>
        </section>
      )}

      <CustomerSelector
        key={customerResetKey}
        value={customerSelection}
        onChange={handleCustomerChange}
        onBusyChange={setCustomerBusy}
        disabled={locked}
      />

      <div className="grid items-start gap-5 xl:grid-cols-5">
        <section
          aria-labelledby="available-batches-heading"
          className="min-w-0 overflow-hidden rounded-2xl
                     border border-border bg-surface xl:col-span-3"
        >
          <div className="border-b border-border p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2
                  id="available-batches-heading"
                  className="font-semibold"
                >
                  Available batches
                </h2>

                {!loading && !inventoryError && (
                  <p className="mt-1 text-xs text-text-secondary">
                    {visibleBatches.length} of {batches.length} batches
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={reloadInventory}
                disabled={loading || locked}
                aria-label="Reload available stock"
                title="Reload available stock"
                className={actionClass}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                  className={`size-5 ${
                    loading ? "motion-safe:animate-spin" : ""
                  }`}
                >
                  <path
                    d="M20 7v5h-5M4 17v-5h5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M19 10a7 7 0 0 0-12-3M5 14a7 7 0 0 0 12 3"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <FilterField
              id="sale-inventory-search"
              label="Search available stock"
              type="search"
              placeholder="Medicine, manufacturer, or batch"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {loading ? (
            <p role="status" className="p-6 text-sm text-text-secondary">
              Loading available stock...
            </p>
          ) : inventoryError ? (
            <p role="alert" className="p-6 text-sm text-danger">
              {inventoryError}
            </p>
          ) : visibleBatches.length === 0 ? (
            <p className="p-6 text-sm text-text-secondary">
              {searchTerm
                ? "No batches match your search."
                : "No stock is currently available for sale."}
            </p>
          ) : (
            <div
              tabIndex={0}
              aria-label="Available batches table"
              className="max-h-[65dvh] overflow-auto
                         focus-visible:outline-2
                         focus-visible:outline-primary"
            >
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-background text-xs text-text-secondary">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Medicine / batch
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Expiry
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Stock
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Price
                    </th>
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">Add to sale</span>
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {visibleBatches.map((batch) => {
                    const selected = cart.find(
                      (item) => item.batch_id === batch.batch_id
                    );

                    const atLimit =
                      Number(selected?.quantity || 0) >=
                      batch.stock_quantity;

                    return (
                      <tr
                        key={batch.batch_id}
                        className="hover:bg-surface-hover/40"
                      >
                        <td className="px-4 py-4">
                          <p className="font-medium">
                            {batch.medicine_name}
                          </p>
                          <p className="mt-1 text-xs text-text-secondary">
                            {batch.manufacturer_name}
                          </p>
                          <p className="mt-1 text-xs text-text-secondary">
                            Batch: {batch.batch_number}
                          </p>
                        </td>

                        <td className="whitespace-nowrap px-4 py-4">
                          {formatBatchDate(batch.expiry_date)}

                          {Number(batch.days_to_expire) <= 10 && (
                            <p className="mt-1 text-xs text-warning">
                              {Number(batch.days_to_expire) === 0
                                ? "Expires today"
                                : `Expires in ${batch.days_to_expire} days`}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-4 text-right tabular-nums">
                          {batch.stock_quantity}
                        </td>

                        <td className="px-4 py-4 text-right tabular-nums">
                          {formatPrice(batch.selling_price)}
                        </td>

                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => addBatch(batch)}
                            disabled={locked || atLimit}
                            aria-label={`Add ${batch.medicine_name}, batch ${batch.batch_number}`}
                            className={actionClass}
                          >
                            {atLimit ? "At limit" : "Add"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <form
          noValidate
          onSubmit={handleSubmit}
          aria-busy={submitting}
          className="min-w-0 rounded-2xl border border-border
                     bg-surface xl:col-span-2"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border p-4">
            <div className="min-w-0">
              <h2 className="font-semibold">Current sale</h2>
              <p className="mt-1 break-words text-xs text-text-secondary">
                {customerLabel}
              </p>
              {!walkIn && selectedCustomer && (
                <p className="mt-1 break-all text-xs text-text-secondary">
                  {selectedCustomer.email}
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={locked || cart.length === 0}
              onClick={() => {
                setCart([]);
                setSaleError("");
              }}
              className={`${actionClass} shrink-0`}
            >
              Clear cart
            </button>
          </div>

          <fieldset disabled={locked} className="min-w-0">
            <legend className="sr-only">Sale items and payment</legend>

            <div className="space-y-4 p-4">
              {cartRows.length === 0 ? (
                <p className="py-6 text-center text-sm text-text-secondary">
                  Add a medicine batch to start this sale.
                </p>
              ) : (
                cartRows.map((item) => (
                  <div
                    key={item.batch_id}
                    className="rounded-xl border border-border bg-background p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-medium">
                          {item.medicine_name}
                        </p>
                        <p className="mt-1 break-words text-xs text-text-secondary">
                          Batch: {item.batch_number}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeBatch(item.batch_id)}
                        aria-label={`Remove ${item.medicine_name}, batch ${item.batch_number}`}
                        className={`${actionClass} shrink-0`}
                      >
                        Remove
                      </button>
                    </div>

                    <div className="mt-4 grid grid-cols-2 items-end gap-4">
                      <div>
                        <label
                          htmlFor={`quantity-${item.batch_id}`}
                          className="text-xs text-text-secondary"
                        >
                          Quantity
                        </label>

                        <input
                          id={`quantity-${item.batch_id}`}
                          type="number"
                          inputMode="numeric"
                          min="1"
                          step="1"
                          max={item.batch?.stock_quantity}
                          value={item.quantity}
                          onChange={(event) =>
                            updateQuantity(item.batch_id, event.target.value)
                          }
                          aria-invalid={Boolean(item.error)}
                          aria-describedby={
                            item.error
                              ? `quantity-error-${item.batch_id}`
                              : undefined
                          }
                          className="mt-1 min-h-11 w-full rounded-lg
                                     border border-border bg-surface px-3 py-2
                                     focus-visible:outline-2
                                     focus-visible:outline-primary
                                     disabled:opacity-60"
                        />
                      </div>

                      <div className="text-right">
                        <p className="text-xs text-text-secondary">
                          {item.batch
                            ? `${formatPrice(item.batch.selling_price)} each`
                            : "Unavailable"}
                        </p>
                        <p className="mt-2 font-semibold tabular-nums">
                          {item.error
                            ? "—"
                            : formatPrice(item.subtotalMinor / 100)}
                        </p>
                      </div>
                    </div>

                    {item.batch && (
                      <p className="mt-2 text-xs text-text-secondary">
                        Available: {item.batch.stock_quantity}
                      </p>
                    )}

                    {item.error && (
                      <p
                        id={`quantity-error-${item.batch_id}`}
                        className="mt-2 text-xs text-danger"
                      >
                        {item.error}
                      </p>
                    )}
                  </div>
                ))
              )}

              <FilterField
                id="sale-payment-mode"
                label="Payment mode"
                value={paymentMode}
                onChange={(event) => setPaymentMode(event.target.value)}
              >
                {PAYMENT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </FilterField>

              <p className="text-xs leading-5 text-text-secondary">
                Records the payment method. This page does not collect
                card or UPI payments.
              </p>

              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex justify-between text-sm text-text-secondary">
                  <span>Total units</span>
                  <span className="tabular-nums">{totalUnits}</span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="font-semibold">
                    {result ? "Confirmed total" : "Estimated total"}
                  </span>
                  <span className="text-xl font-bold tabular-nums">
                    {result
                      ? formatPrice(result.total_amount)
                      : hasInvalidRows
                        ? "—"
                        : formatPrice(totalMinor / 100)}
                  </span>
                </div>

                {!customerReady && (
                  <p className="text-sm text-warning">
                    Select a customer above or choose Walk-in to continue.
                  </p>
                )}

                {customerBusy && (
                  <p role="status" className="text-sm text-text-secondary">
                    Wait for the customer request to finish.
                  </p>
                )}

                <p className="text-xs leading-5 text-text-secondary">
                  Stock and the final total are checked when the sale is saved.
                </p>

                <Button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full"
                >
                  {submitting
                    ? "Completing sale..."
                    : result
                      ? "Sale completed"
                      : "Complete sale"}
                </Button>
              </div>
            </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
}