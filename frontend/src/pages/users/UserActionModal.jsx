import { useId, useRef, useState } from "react";
import Modal from "../../components/Modal";
import Input from "../../components/Input";
import useAuth from "../../hooks/useAuth";
import {
  updateUser,
  deactivateUser,
  restoreUser,
} from "../../services/user.service";

const titles = {
  edit: "Edit user",
  deactivate: "Deactivate account",
  restore: "Restore account",
};

export default function UserActionModal({
  user,
  action,
  onClose,
  onSuccess,
}) {
  const {
    user: currentUser,
    authenticatedRequest,
    updateCurrentUser,
  } = useAuth();

  const fieldId = useId();
  const submittingRef = useRef(false);

  const [values, setValues] = useState({
    name: user.name || "",
    email: user.email || "",
  });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [busy, setBusy] = useState(false);

  const isEdit = action === "edit";
  const isDeactivate = action === "deactivate";
  const isSelf = Number(user.user_id) === Number(currentUser.user_id);

  const hasChanges =
    values.name.trim() !== user.name ||
    values.email.trim() !== user.email;

  function handleChange(event) {
    const { name, value } = event.target;

    setValues((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: "" }));
    setApiError("");
  }

  function requestClose() {
    if (!submittingRef.current) onClose();
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submittingRef.current) return;

    setApiError("");

    if (isDeactivate && isSelf) {
      setApiError("You cannot deactivate your own account.");
      return;
    }

    if (isEdit) {
      if (!user.is_active) {
        setApiError("Restore this account before editing.");
        return;
      }

      const form = event.currentTarget;
      const nextErrors = {};

      if (!values.name.trim()) {
        nextErrors.name = "Enter the user's full name.";
      } else if (values.name.trim().length > 100) {
        nextErrors.name = "Name must be 100 characters or fewer.";
      }

      if (!values.email.trim()) {
        nextErrors.email = "Enter an email address.";
      } else if (form.elements.namedItem("email").validity.typeMismatch) {
        nextErrors.email = "Enter a valid email address.";
      } else if (values.email.trim().length > 100) {
        nextErrors.email = "Email must be 100 characters or fewer.";
      }

      setErrors(nextErrors);

      const firstInvalidField = Object.keys(nextErrors)[0];

      if (firstInvalidField) {
        form.elements.namedItem(firstInvalidField)?.focus();
        return;
      }

      if (!hasChanges) return;
    }

    submittingRef.current = true;
    setBusy(true);

    let response;

    try {
      if (isEdit) {
        response = await updateUser(
          authenticatedRequest,
          user.user_id,
          values
        );
      } else if (isDeactivate) {
        response = await deactivateUser(
          authenticatedRequest,
          user.user_id
        );
      } else {
        response = await restoreUser(
          authenticatedRequest,
          user.user_id
        );
      }
    } catch (error) {
      setApiError(error.message || "Unable to save changes. Please try again.");
      return;
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }

    if (isEdit && isSelf) {
      updateCurrentUser(user.user_id, {
        name: values.name.trim(),
        email: values.email.trim(),
      });
    }

    onSuccess(response.message || "Changes saved successfully.");
  }

  const submitLabel = isEdit
    ? "Save Changes"
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
        {isEdit ? (
          <>
            <Input
              id={`${fieldId}-name`}
              name="name"
              label="Full name"
              autoComplete="off"
              autoFocus
              required
              maxLength={100}
              value={values.name}
              onChange={handleChange}
              error={errors.name}
              disabled={busy}
            />

            <Input
              id={`${fieldId}-email`}
              name="email"
              label="Email address"
              type="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={100}
              value={values.email}
              onChange={handleChange}
              error={errors.email}
              disabled={busy}
            />

            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-xs text-text-secondary">Account role</p>
              <p className="mt-2 text-sm font-medium">{user.role}</p>
              <p className="mt-2 text-xs text-text-secondary">
                Role changes are not available.
              </p>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm leading-6 text-text-secondary">
              {isDeactivate
                ? "Deactivate this account? The user will not be able to sign in again until the account is restored."
                : "Restore this account? The user will be able to sign in again."}
            </p>

            <div className="rounded-xl border border-border bg-background p-4">
              <p className="break-words font-medium">{user.name}</p>
              <p className="mt-1 break-all text-sm text-text-secondary">
                {user.email}
              </p>
              <p className="mt-2 text-xs text-text-secondary">
                {user.role}
              </p>
            </div>

            {isDeactivate && (
              <p className="text-xs leading-5 text-text-secondary">
                Existing signed-in sessions may remain active until their
                access tokens expire.
              </p>
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

        <div className="flex flex-col-reverse gap-3 border-t border-border
                        pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            autoFocus={!isEdit}
            onClick={requestClose}
            disabled={busy}
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
              (isEdit && (!hasChanges || !user.is_active)) ||
              (isDeactivate && isSelf)
            }
            className={`min-h-12 rounded-xl px-5 py-3 text-sm
                        font-semibold text-white
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