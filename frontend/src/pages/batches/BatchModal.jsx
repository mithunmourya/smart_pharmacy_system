import { useEffect, useId, useRef, useState } from "react";
import Modal from "../../components/Modal";
import Input from "../../components/Input";
import useAuth from "../../hooks/useAuth";
import {
  getBatch,
  createBatch,
  updateBatch,
  adjustBatchStock,
  deactivateBatch,
  restoreBatch,
} from "../../services/batch.service";
import {
  MAX_STOCK,
  toDateInput,
  todayDate,
  tomorrowDate,
  priceToCents,
} from "../../utils/batch";

const titles = {
  create: "Add batch",
  edit: "Edit batch",
  stock: "Adjust stock",
  deactivate: "Deactivate batch",
  restore: "Restore batch",
};

export default function BatchModal({
  action,
  medicine,
  batch,
  onClose,
  onSuccess,
}) {
  const { authenticatedRequest } = useAuth();
  const batchId = batch?.batch_id;

  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(action !== "create");
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (action === "create") return;

    let ignore = false;

    async function loadBatch() {
      setLoading(true);
      setError("");

      try {
        const result = await getBatch(authenticatedRequest, batchId);
        if (!ignore) setDetails(result);
      } catch (requestError) {
        if (!ignore) {
          setError(requestError.message || "Unable to load batch details.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadBatch();

    return () => {
      ignore = true;
    };
  }, [action, batchId, authenticatedRequest, retryKey]);

  if (action !== "create" && (loading || error || !details)) {
    return (
      <Modal title={titles[action]} onClose={onClose}>
        {loading ? (
          <p role="status" className="py-6 text-sm text-text-secondary">
            Loading current batch details...
          </p>
        ) : (
          <div>
            <p role="alert" className="text-sm text-danger">
              {error || "Batch details are unavailable."}
            </p>
            <button
              type="button"
              onClick={() => setRetryKey((previous) => previous + 1)}
              className="mt-4 min-h-11 rounded-lg px-3 text-sm underline
                         focus-visible:outline-2 focus-visible:outline-primary"
            >
              Try again
            </button>
          </div>
        )}
      </Modal>
    );
  }

  return (
    <BatchForm
      action={action}
      medicine={medicine}
      batch={details}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

function BatchForm({ action, medicine, batch, onClose, onSuccess }) {
  const { user, authenticatedRequest } = useAuth();
  const fieldId = useId();
  const submittingRef = useRef(false);

  const [values, setValues] = useState({
    batch_number: batch?.batch_number || "",
    purchase_price: String(batch?.purchase_price ?? ""),
    selling_price: String(batch?.selling_price ?? ""),
    stock_quantity: "0",
    expiry_date: toDateInput(batch?.expiry_date),
    adjustmentType: "add",
    quantity: "",
  });

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [busy, setBusy] = useState(false);

  const isCreate = action === "create";
  const isEdit = action === "edit";
  const isStock = action === "stock";
  const isDeactivate = action === "deactivate";
  const isDetailsForm = isCreate || isEdit;

  const currentStock = Number(batch?.stock_quantity ?? 0);
  const quantity = Number(values.quantity);

  const quantityValid =
    values.quantity.trim() !== "" &&
    Number.isInteger(quantity) &&
    quantity > 0 &&
    quantity <= MAX_STOCK;

  const expectedStock = quantityValid
    ? currentStock +
      (values.adjustmentType === "remove" ? -quantity : quantity)
    : null;

  const unchanged =
    isEdit &&
    values.batch_number.trim() === batch.batch_number &&
    Number(values.purchase_price) === Number(batch.purchase_price) &&
    Number(values.selling_price) === Number(batch.selling_price) &&
    values.expiry_date === toDateInput(batch.expiry_date);

  const blockedReason = isCreate
    ? !medicine?.medicine_is_active
      ? "Restore this medicine before adding a batch."
      : ""
    : (isEdit || isStock) && !batch?.is_active
      ? "Restore this batch before changing its details or stock."
      : isDeactivate && !batch?.is_active
        ? "This batch is already inactive."
        : action === "restore" && batch?.is_active
          ? "This batch is already active."
          : "";

  function requestClose() {
    if (!submittingRef.current) onClose();
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setValues((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({
      ...previous,
      [name]: "",
      ...(name === "adjustmentType" ? { quantity: "" } : {}),
      ...(name === "purchase_price" ? { selling_price: "" } : {}),
    }));
    setApiError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submittingRef.current || blockedReason) return;

    setApiError("");

    if (user?.role !== "Admin") {
      setApiError("Only administrators can manage batches.");
      return;
    }

    const nextErrors = {};

    if (isDetailsForm) {
      if (!values.batch_number.trim()) {
        nextErrors.batch_number = "Enter the batch number.";
      } else if (values.batch_number.trim().length > 50) {
        nextErrors.batch_number = "Use 50 characters or fewer.";
      }

      const purchase = priceToCents(values.purchase_price);
      const selling = priceToCents(values.selling_price);

      if (purchase === null) {
        nextErrors.purchase_price =
          "Enter a price from 0 to 99999999.99, with up to two decimal places.";
      }

      if (selling === null) {
        nextErrors.selling_price =
          "Enter a price from 0 to 99999999.99, with up to two decimal places.";
      } else if (purchase !== null && selling < purchase) {
        nextErrors.selling_price =
          "Selling price cannot be less than purchase price.";
      }

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(values.expiry_date) ||
        values.expiry_date <= todayDate()
      ) {
        nextErrors.expiry_date = "Choose a future expiry date.";
      }

      if (isCreate) {
        const stock = Number(values.stock_quantity);

        if (
          values.stock_quantity.trim() === "" ||
          !Number.isInteger(stock) ||
          stock < 0 ||
          stock > MAX_STOCK
        ) {
          nextErrors.stock_quantity =
            `Enter a whole number from 0 to ${MAX_STOCK}.`;
        }
      }
    }

    if (isStock) {
      if (!quantityValid) {
        nextErrors.quantity =
          `Enter a whole number from 1 to ${MAX_STOCK}.`;
      } else if (expectedStock < 0) {
        nextErrors.quantity = "You cannot remove more than the current stock.";
      } else if (expectedStock > MAX_STOCK) {
        nextErrors.quantity = "The resulting stock exceeds the supported limit.";
      }
    }

    setErrors(nextErrors);

    const firstInvalidField = Object.keys(nextErrors)[0];

    if (firstInvalidField) {
      event.currentTarget.elements.namedItem(firstInvalidField)?.focus();
      return;
    }

    if (unchanged) return;

    submittingRef.current = true;
    setBusy(true);

    let response;

    try {
      if (isCreate) {
        response = await createBatch(
          authenticatedRequest,
          medicine.medicine_id,
          values
        );
      } else if (isEdit) {
        response = await updateBatch(
          authenticatedRequest,
          batch.batch_id,
          values
        );
      } else if (isStock) {
        const change =
          values.adjustmentType === "remove" ? -quantity : quantity;

        response = await adjustBatchStock(
          authenticatedRequest,
          batch.batch_id,
          change
        );
      } else if (isDeactivate) {
        response = await deactivateBatch(
          authenticatedRequest,
          batch.batch_id
        );
      } else if (action === "restore") {
        response = await restoreBatch(
          authenticatedRequest,
          batch.batch_id
        );
      } else {
        throw new Error("Unsupported batch action.");
      }
    } catch (error) {
      setApiError(
        error.message || "Unable to save changes. Please try again."
      );
      return;
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }

    onSuccess(response.message || "Changes saved successfully.");
  }

  const submitLabel = isCreate
    ? "Add Batch"
    : isEdit
      ? "Save Changes"
      : isStock
        ? "Confirm Adjustment"
        : isDeactivate
          ? "Deactivate"
          : "Restore";

  return (
    <Modal title={titles[action]} onClose={requestClose} busy={busy}>
      <form
        noValidate
        onSubmit={handleSubmit}
        aria-busy={busy}
        className="space-y-5"
      >
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="break-words font-medium">{medicine.name}</p>
          <p className="mt-1 break-words text-sm text-text-secondary">
            {medicine.manufacturer}
          </p>
          {batch && (
            <p className="mt-2 break-words text-xs text-text-secondary">
              Batch: {batch.batch_number}
            </p>
          )}
        </div>

        {blockedReason && (
          <p role="alert" className="text-sm text-warning">
            {blockedReason}
          </p>
        )}

        {isDetailsForm ? (
          <>
            <Input
              id={`${fieldId}-number`}
              name="batch_number"
              label="Batch number"
              autoFocus
              autoComplete="off"
              maxLength={50}
              required
              value={values.batch_number}
              onChange={handleChange}
              error={errors.batch_number}
              disabled={busy || !!blockedReason}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id={`${fieldId}-purchase`}
                name="purchase_price"
                label="Purchase price"
                type="number"
                min="0"
                max="99999999.99"
                step="0.01"
                required
                value={values.purchase_price}
                onChange={handleChange}
                error={errors.purchase_price}
                disabled={busy || !!blockedReason}
              />
              <Input
                id={`${fieldId}-selling`}
                name="selling_price"
                label="Selling price"
                type="number"
                min="0"
                max="99999999.99"
                step="0.01"
                required
                value={values.selling_price}
                onChange={handleChange}
                error={errors.selling_price}
                disabled={busy || !!blockedReason}
              />
            </div>

            {isCreate && (
              <Input
                id={`${fieldId}-stock`}
                name="stock_quantity"
                label="Initial stock quantity"
                type="number"
                min={0}
                max={MAX_STOCK}
                step={1}
                required
                value={values.stock_quantity}
                onChange={handleChange}
                error={errors.stock_quantity}
                disabled={busy || !!blockedReason}
              />
            )}

            <Input
              id={`${fieldId}-expiry`}
              name="expiry_date"
              label="Expiry date"
              type="date"
              min={tomorrowDate()}
              required
              value={values.expiry_date}
              onChange={handleChange}
              error={errors.expiry_date}
              disabled={busy || !!blockedReason}
            />

            {isEdit && (
              <p className="text-xs leading-5 text-text-secondary">
                Medicine cannot be changed. Use Adjust Stock to change quantity.
              </p>
            )}
          </>
        ) : isStock ? (
          <>
            <p className="text-sm text-text-secondary">
              Current stock:{" "}
              <strong className="text-text-primary">{currentStock}</strong>
            </p>

            <div>
              <label
                htmlFor={`${fieldId}-type`}
                className="mb-2 block text-sm font-medium"
              >
                Adjustment
              </label>
              <select
                id={`${fieldId}-type`}
                name="adjustmentType"
                value={values.adjustmentType}
                onChange={handleChange}
                disabled={busy || !!blockedReason}
                className="min-h-12 w-full rounded-xl border border-border
                           bg-background px-4 py-3 text-sm
                           focus-visible:outline-2 focus-visible:outline-primary"
              >
                <option value="add">Add stock</option>
                <option value="remove">Remove stock</option>
              </select>
            </div>

            <Input
              id={`${fieldId}-quantity`}
              name="quantity"
              label={
                values.adjustmentType === "add"
                  ? "Quantity to add"
                  : "Quantity to remove"
              }
              type="number"
              min={1}
              max={MAX_STOCK}
              step={1}
              autoFocus
              required
              value={values.quantity}
              onChange={handleChange}
              error={errors.quantity}
              disabled={busy || !!blockedReason}
            />

            <p role="status" className="text-sm text-text-secondary">
              Expected stock after adjustment:{" "}
              <strong className="text-text-primary">
                {expectedStock === null ? "—" : expectedStock}
              </strong>
            </p>

            <p className="text-xs leading-5 text-text-secondary">
              This adds or removes quantity from the current stock.
              Stock may change if another operation occurs before saving.
            </p>
          </>
        ) : (
          <p className="text-sm leading-6 text-text-secondary">
            {isDeactivate
              ? "Deactivate this batch? Its details and quantity will be kept, and it will be excluded from available inventory."
              : "Restore this batch? Available inventory still depends on expiry, quantity, and the medicine and manufacturer statuses."}
          </p>
        )}

        {apiError && (
          <div
            role="alert"
            className="rounded-xl border border-danger/40
                       bg-danger/10 px-4 py-3 text-sm"
          >
            {apiError}
          </div>
        )}

        <div
          className="flex flex-col-reverse gap-3 border-t border-border
                     pt-5 sm:flex-row sm:justify-end"
        >
          <button
            type="button"
            autoFocus={!isDetailsForm && !isStock}
            disabled={busy}
            onClick={requestClose}
            className="min-h-12 rounded-xl border border-border
                       px-5 py-3 text-sm font-semibold
                       hover:bg-surface-hover focus-visible:outline-2
                       focus-visible:outline-primary disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={
              busy ||
              !!blockedReason ||
              unchanged ||
              user?.role !== "Admin"
            }
            className={`min-h-12 rounded-xl px-5 py-3 text-sm
                        font-semibold text-white
                        focus-visible:outline-2 focus-visible:outline-primary
                        disabled:cursor-not-allowed disabled:opacity-50 ${
                          isDeactivate
                            ? "bg-danger hover:bg-danger/90"
                            : "bg-primary hover:bg-primary-hover"
                        }`}
          >
            {busy ? "Saving..." : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}