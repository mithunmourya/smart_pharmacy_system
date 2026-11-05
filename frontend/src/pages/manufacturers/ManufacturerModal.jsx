import { useId, useRef, useState } from "react";
import Modal from "../../components/Modal";
import Input from "../../components/Input";
import useAuth from "../../hooks/useAuth";
import {
  createManufacturer,
  updateManufacturer,
  deactivateManufacturer,
  restoreManufacturer,
} from "../../services/manufacturer.service";

const titles = {
  create: "Add manufacturer",
  edit: "Edit manufacturer",
  deactivate: "Deactivate manufacturer",
  restore: "Restore manufacturer",
};

export default function ManufacturerModal({
  action,
  manufacturer,
  onClose,
  onSuccess,
}) {
  const { user, authenticatedRequest } = useAuth();

  const nameId = useId();
  const submittingRef = useRef(false);

  const [name, setName] = useState(manufacturer?.name || "");
  const [nameError, setNameError] = useState("");
  const [apiError, setApiError] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoreCandidate, setRestoreCandidate] = useState(null);

  const isForm =
    !restoreCandidate && (action === "create" || action === "edit");

  const isDeactivate = action === "deactivate";
  const unchanged =
    action === "edit" && name.trim() === manufacturer?.name;

  const title = restoreCandidate
    ? "Restore existing manufacturer"
    : titles[action];

  const submitLabel = restoreCandidate
    ? "Restore Manufacturer"
    : action === "create"
      ? "Add Manufacturer"
      : action === "edit"
        ? "Save Changes"
        : isDeactivate
          ? "Deactivate"
          : "Restore";

  function requestClose() {
    if (!submittingRef.current) onClose();
  }

  function handleNameChange(event) {
    setName(event.target.value);
    setNameError("");
    setApiError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submittingRef.current) return;

    setApiError("");

    if (user?.role !== "Admin") {
      setApiError("Only administrators can manage manufacturers.");
      return;
    }

    if (isForm) {
      const trimmedName = name.trim();

      if (!trimmedName || trimmedName.length > 100) {
        setNameError(
          !trimmedName
            ? "Enter the manufacturer name."
            : "Name must be 100 characters or fewer."
        );

        event.currentTarget.elements.namedItem("name")?.focus();
        return;
      }

      if (action === "edit" && !manufacturer.is_active) {
        setApiError("Restore this manufacturer before editing.");
        return;
      }

      if (unchanged) return;
    }

    submittingRef.current = true;
    setBusy(true);

    let response;

    try {
      if (restoreCandidate) {
        response = await restoreManufacturer(
          authenticatedRequest,
          restoreCandidate.id
        );
      } else if (action === "create") {
        response = await createManufacturer(authenticatedRequest, name);
      } else if (action === "edit") {
        response = await updateManufacturer(
          authenticatedRequest,
          manufacturer.manufacturer_id,
          name
        );
      } else if (action === "deactivate") {
        response = await deactivateManufacturer(
          authenticatedRequest,
          manufacturer.manufacturer_id
        );
      } else if (action === "restore") {
        response = await restoreManufacturer(
          authenticatedRequest,
          manufacturer.manufacturer_id
        );
      } else {
        throw new Error("Unsupported manufacturer action.");
      }
    } catch (error) {
      const existingId = Number(error.data?.manufacturerId);

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
          name: name.trim(),
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

  return (
    <Modal title={title} onClose={requestClose} busy={busy}>
      <form
        noValidate
        onSubmit={handleSubmit}
        aria-busy={busy}
        className="space-y-5"
      >
        {isForm ? (
          <Input
            id={nameId}
            name="name"
            label="Manufacturer name"
            placeholder="Enter manufacturer name"
            autoComplete="off"
            autoFocus
            required
            maxLength={100}
            value={name}
            onChange={handleNameChange}
            error={nameError}
            disabled={busy}
          />
        ) : (
          <>
            <p
              role={restoreCandidate ? "status" : undefined}
              className="text-sm leading-6 text-text-secondary"
            >
              {restoreCandidate
                ? "A manufacturer with this name already exists but is inactive. Would you like to restore the existing record?"
                : isDeactivate
                  ? "Deactivate this manufacturer? The record will remain available and can be restored later."
                  : "Restore this manufacturer? Its status will become active again."}
            </p>

            <div
              className="rounded-xl border border-border
                         bg-background p-4"
            >
              <p className="break-words font-medium">
                {restoreCandidate?.name || manufacturer?.name}
              </p>
            </div>

            {restoreCandidate && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setRestoreCandidate(null);
                  setApiError("");
                }}
                className="min-h-11 rounded-lg px-2 text-sm
                           text-text-secondary underline underline-offset-4
                           focus-visible:outline-2
                           focus-visible:outline-primary
                           disabled:opacity-50"
              >
                Use a different name
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
          className="flex flex-col-reverse gap-3 border-t
                     border-border pt-5 sm:flex-row sm:justify-end"
        >
          <button
            type="button"
            autoFocus={!isForm}
            disabled={busy}
            onClick={requestClose}
            className="min-h-12 rounded-xl border border-border
                       px-5 py-3 text-sm font-semibold
                       hover:bg-surface-hover
                       focus-visible:outline-2 focus-visible:outline-primary
                       disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={
              busy ||
              user?.role !== "Admin" ||
              (action === "edit" &&
                (unchanged || !manufacturer?.is_active))
            }
            className={`min-h-12 rounded-xl px-5 py-3
                        text-sm font-semibold text-white
                        focus-visible:outline-2 focus-visible:outline-offset-2
                        focus-visible:outline-primary
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