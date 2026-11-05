import { useEffect, useId, useRef, useState } from "react";
import Modal from "../../components/Modal";
import Input from "../../components/Input";
import useAuth from "../../hooks/useAuth";
import { getManufacturers } from "../../services/manufacturer.service";
import {
  MEDICINE_CATEGORIES,
  createMedicine,
  updateMedicine,
  deactivateMedicine,
  restoreMedicine,
} from "../../services/medicine.service";

const titles = {
  create: "Add medicine",
  edit: "Edit medicine",
  deactivate: "Deactivate medicine",
  restore: "Restore medicine",
};

const selectClass = `
  min-h-12 w-full rounded-xl border border-border
  bg-background px-4 py-3 text-sm text-text-primary
  focus-visible:outline-2 focus-visible:outline-primary
  disabled:opacity-50
`;

export default function MedicineModal({
  action,
  medicine,
  onClose,
  onSuccess,
}) {
  const { user, authenticatedRequest } = useAuth();
  const fieldId = useId();
  const submittingRef = useRef(false);

  const [values, setValues] = useState({
    name: medicine?.name || "",
    manufacturer_id: String(medicine?.manufacturer_id ?? ""),
    category: medicine?.category || "",
    reorder_level: String(medicine?.reorder_level ?? 10),
  });

  const [manufacturers, setManufacturers] = useState([]);
  const [manufacturersLoading, setManufacturersLoading] = useState(
    action === "create" || action === "edit"
  );
  const [manufacturerError, setManufacturerError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoreCandidate, setRestoreCandidate] = useState(null);

  const formAction = action === "create" || action === "edit";
  const showForm = formAction && !restoreCandidate;
  const isDeactivate = action === "deactivate";

  useEffect(() => {
    if (!formAction) return;

    let ignore = false;

    async function loadManufacturers() {
      setManufacturersLoading(true);
      setManufacturerError("");

      try {
        const result = await getManufacturers(authenticatedRequest);
        if (!ignore) setManufacturers(result);
      } catch (error) {
        if (!ignore) {
          setManufacturerError(
            error.message || "Unable to load manufacturers."
          );
        }
      } finally {
        if (!ignore) setManufacturersLoading(false);
      }
    }

    loadManufacturers();

    return () => {
      ignore = true;
    };
  }, [authenticatedRequest, formAction, retryKey]);

  const activeManufacturers = manufacturers.filter((item) => item.is_active);

  const selectedManufacturer = manufacturers.find(
    (item) => String(item.manufacturer_id) === values.manufacturer_id
  );

  const selectedUnavailable =
    values.manufacturer_id !== "" &&
    !manufacturersLoading &&
    !manufacturerError &&
    !selectedManufacturer?.is_active;

  const unchanged =
    action === "edit" &&
    values.name.trim() === medicine.name &&
    Number(values.manufacturer_id) === Number(medicine.manufacturer_id) &&
    values.category === medicine.category &&
    Number(values.reorder_level) === Number(medicine.reorder_level);

  function requestClose() {
    if (!submittingRef.current) onClose();
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setValues((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: "" }));
    setApiError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submittingRef.current) return;

    setApiError("");

    if (user?.role !== "Admin") {
      setApiError("Only administrators can manage medicines.");
      return;
    }

    if (showForm) {
      if (manufacturersLoading || manufacturerError) return;

      if (action === "edit" && !medicine.medicine_is_active) {
        setApiError("Restore this medicine before editing.");
        return;
      }

      const nextErrors = {};

      if (!values.name.trim()) {
        nextErrors.name = "Enter the medicine name.";
      } else if (values.name.trim().length > 100) {
        nextErrors.name = "Name must be 100 characters or fewer.";
      }

      if (!selectedManufacturer?.is_active) {
        nextErrors.manufacturer_id = "Select an active manufacturer.";
      }

      if (!MEDICINE_CATEGORIES.includes(values.category)) {
        nextErrors.category = "Select a category.";
      }

      const reorderLevel = Number(values.reorder_level);

      if (
        values.reorder_level.trim() === "" ||
        !Number.isInteger(reorderLevel) ||
        reorderLevel < 0 ||
        reorderLevel > 2147483647
      ) {
        nextErrors.reorder_level =
          "Enter a whole number from 0 to 2147483647.";
      }

      setErrors(nextErrors);

      const firstInvalidField = Object.keys(nextErrors)[0];

      if (firstInvalidField) {
        event.currentTarget.elements.namedItem(firstInvalidField)?.focus();
        return;
      }

      if (unchanged) return;
    }

    submittingRef.current = true;
    setBusy(true);

    let response;

    try {
      if (restoreCandidate) {
        response = await restoreMedicine(
          authenticatedRequest,
          restoreCandidate.id
        );
      } else if (action === "create") {
        response = await createMedicine(authenticatedRequest, values);
      } else if (action === "edit") {
        response = await updateMedicine(
          authenticatedRequest,
          medicine.medicine_id,
          values
        );
      } else if (action === "deactivate") {
        response = await deactivateMedicine(
          authenticatedRequest,
          medicine.medicine_id
        );
      } else if (action === "restore") {
        response = await restoreMedicine(
          authenticatedRequest,
          medicine.medicine_id
        );
      } else {
        throw new Error("Unsupported medicine action.");
      }
    } catch (error) {
      const existingId = Number(error.data?.medicineId);

      if (
        action === "create" &&
        !restoreCandidate &&
        error.status === 409 &&
        error.data?.requiresConfirmation === true &&
        Number.isInteger(existingId) &&
        existingId > 0
      ) {
        setRestoreCandidate({
          id: existingId,
          name: values.name.trim(),
          manufacturer: selectedManufacturer?.name || "",
        });
      } else {
        setApiError(
          error.message || "Unable to save changes. Please try again."
        );
      }

      return;
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }

    onSuccess(response.message || "Changes saved successfully.");
  }

  const submitLabel = restoreCandidate
    ? "Restore Medicine"
    : action === "create"
      ? "Add Medicine"
      : action === "edit"
        ? "Save Changes"
        : isDeactivate
          ? "Deactivate"
          : "Restore";

  const formBlocked =
    showForm &&
    (manufacturersLoading ||
      Boolean(manufacturerError) ||
      activeManufacturers.length === 0 ||
      unchanged);

  return (
    <Modal
      title={restoreCandidate ? "Restore existing medicine" : titles[action]}
      onClose={requestClose}
      busy={busy}
    >
      <form
        noValidate
        onSubmit={handleSubmit}
        aria-busy={busy}
        className="space-y-5"
      >
        {showForm ? (
          <>
            <Input
              id={`${fieldId}-name`}
              name="name"
              label="Medicine name"
              placeholder="Enter medicine name"
              autoComplete="off"
              autoFocus
              required
              maxLength={100}
              value={values.name}
              onChange={handleChange}
              error={errors.name}
              disabled={busy}
            />

            <div>
              <label
                htmlFor={`${fieldId}-manufacturer`}
                className="mb-2 block text-sm font-medium"
              >
                Manufacturer
              </label>

              <select
                id={`${fieldId}-manufacturer`}
                name="manufacturer_id"
                value={values.manufacturer_id}
                onChange={handleChange}
                required
                disabled={busy || manufacturersLoading || !!manufacturerError}
                aria-invalid={Boolean(errors.manufacturer_id)}
                aria-describedby={
                  errors.manufacturer_id
                    ? `${fieldId}-manufacturer-error`
                    : undefined
                }
                className={selectClass}
              >
                <option value="">
                  {manufacturersLoading
                    ? "Loading manufacturers..."
                    : "Select manufacturer"}
                </option>

                {values.manufacturer_id &&
                  !activeManufacturers.some(
                    (item) =>
                      String(item.manufacturer_id) === values.manufacturer_id
                  ) && (
                    <option value={values.manufacturer_id} disabled>
                      {selectedManufacturer?.name ||
                        medicine?.manufacturer ||
                        "Current manufacturer"}
                      {manufacturersLoading ? "" : " (unavailable)"}
                    </option>
                  )}

                {activeManufacturers.map((item) => (
                  <option
                    key={item.manufacturer_id}
                    value={String(item.manufacturer_id)}
                  >
                    {item.name}
                  </option>
                ))}
              </select>

              {errors.manufacturer_id && (
                <p
                  id={`${fieldId}-manufacturer-error`}
                  className="mt-2 text-sm text-danger"
                >
                  {errors.manufacturer_id}
                </p>
              )}

              {selectedUnavailable && (
                <p className="mt-2 text-sm text-warning">
                  Select an active manufacturer, or restore the current
                  manufacturer from the Manufacturers page.
                </p>
              )}

              {!manufacturersLoading &&
                !manufacturerError &&
                activeManufacturers.length === 0 && (
                  <p className="mt-2 text-sm text-warning">
                    Add or restore a manufacturer before saving a medicine.
                  </p>
                )}

              {manufacturerError && (
                <div className="mt-2">
                  <p role="alert" className="text-sm text-danger">
                    {manufacturerError}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRetryKey((previous) => previous + 1)}
                    className="min-h-11 rounded-lg px-2 text-sm underline
                               focus-visible:outline-2
                               focus-visible:outline-primary"
                  >
                    Retry loading manufacturers
                  </button>
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor={`${fieldId}-category`}
                className="mb-2 block text-sm font-medium"
              >
                Category
              </label>

              <select
                id={`${fieldId}-category`}
                name="category"
                value={values.category}
                onChange={handleChange}
                required
                disabled={busy}
                aria-invalid={Boolean(errors.category)}
                aria-describedby={
                  errors.category ? `${fieldId}-category-error` : undefined
                }
                className={selectClass}
              >
                <option value="">Select category</option>
                {MEDICINE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>

              {errors.category && (
                <p
                  id={`${fieldId}-category-error`}
                  className="mt-2 text-sm text-danger"
                >
                  {errors.category}
                </p>
              )}
            </div>

            <div>
              <Input
                id={`${fieldId}-reorder`}
                name="reorder_level"
                label="Reorder level"
                type="number"
                min={0}
                max={2147483647}
                step={1}
                required
                value={values.reorder_level}
                onChange={handleChange}
                error={errors.reorder_level}
                disabled={busy}
              />
              <p className="mt-2 text-xs leading-5 text-text-secondary">
                Stock threshold for replenishment, not the current quantity.
              </p>
            </div>
          </>
        ) : (
          <>
            <p
              role={restoreCandidate ? "status" : undefined}
              className="text-sm leading-6 text-text-secondary"
            >
              {restoreCandidate
                ? "This medicine already exists under this manufacturer but is inactive. Restore the existing record? Its existing category and reorder level will be kept."
                : isDeactivate
                  ? "Deactivate this medicine? The record will remain available and can be restored later."
                  : "Restore this medicine? Its manufacturer must be active."}
            </p>

            <div className="rounded-xl border border-border bg-background p-4">
              <p className="break-words font-medium">
                {restoreCandidate?.name || medicine?.name}
              </p>
              <p className="mt-1 break-words text-sm text-text-secondary">
                {restoreCandidate?.manufacturer || medicine?.manufacturer}
              </p>
            </div>

            {!restoreCandidate &&
              action === "restore" &&
              !medicine?.manufacturer_is_active && (
                <p className="text-sm text-warning">
                  The manufacturer was inactive when this list loaded.
                  Restore it from the Manufacturers page first.
                </p>
              )}

            {restoreCandidate && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setRestoreCandidate(null);
                  setApiError("");
                }}
                className="min-h-11 rounded-lg px-2 text-sm underline
                           text-text-secondary focus-visible:outline-2
                           focus-visible:outline-primary disabled:opacity-50"
              >
                Back to medicine details
              </button>
            )}
          </>
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
            autoFocus={!showForm}
            disabled={busy}
            onClick={requestClose}
            className="min-h-12 rounded-xl border border-border
                       px-5 py-3 text-sm font-semibold hover:bg-surface-hover
                       focus-visible:outline-2 focus-visible:outline-primary
                       disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={busy || formBlocked || user?.role !== "Admin"}
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