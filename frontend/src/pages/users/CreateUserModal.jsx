import { useEffect, useId, useRef, useState } from "react";
import Button from "../../components/Button";
import Input from "../../components/Input";
import useAuth from "../../hooks/useAuth";
import { createUser } from "../../services/user.service";

const initialValues = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  role: "Customer",
};

export default function CreateUserModal({ onClose, onCreated }) {
  const { authenticatedRequest } = useAuth();

  const dialogRef = useRef(null);
  const submittingRef = useRef(false);
  const titleId = useId();
  const fieldId = useId();

  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;

    dialog.showModal();
    document.body.style.overflow = "hidden";

    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function requestClose() {
    if (!submittingRef.current) {
      onClose();
    }
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setValues((previous) => ({
      ...previous,
      [name]: value,
    }));

    setErrors((previous) => ({
      ...previous,
      [name]: "",
      ...(name === "password" ? { confirmPassword: "" } : {}),
    }));

    setApiError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submittingRef.current) return;

    const form = event.currentTarget;
    const nextErrors = {};

    if (!values.name.trim()) {
      nextErrors.name = "Enter the user's full name.";
    } else if (values.name.trim().length > 100) {
      nextErrors.name = "Name must be 100 characters or fewer.";
    }

    const emailInput = form.elements.namedItem("email");

    if (!values.email.trim()) {
      nextErrors.email = "Enter an email address.";
    } else if (emailInput.validity.typeMismatch) {
      nextErrors.email = "Enter a valid email address.";
    } else if (values.email.trim().length > 100) {
      nextErrors.email = "Email must be 100 characters or fewer.";
    }

    if (!values.password) {
      nextErrors.password = "Enter an initial password.";
    }

    if (!values.confirmPassword) {
      nextErrors.confirmPassword = "Confirm the password.";
    } else if (values.confirmPassword !== values.password) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    if (!["Admin", "Pharmacist", "Customer"].includes(values.role)) {
      nextErrors.role = "Select a valid role.";
    }

    setErrors(nextErrors);
    setApiError("");

    const firstInvalidField = Object.keys(nextErrors)[0];

    if (firstInvalidField) {
      form.elements.namedItem(firstInvalidField)?.focus();
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    let response;

    try {
      response = await createUser(authenticatedRequest, values);
    } catch (error) {
      setApiError(
        error.message || "Unable to create the user. Please try again."
      );
      return;
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }

    onCreated(response.message || "User created successfully.");
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      className="fixed inset-0 m-auto max-h-[90dvh]
                 w-[calc(100%-2rem)] max-w-lg overflow-y-auto
                 rounded-2xl border border-border bg-surface
                 p-0 text-text-primary shadow-2xl
                 backdrop:bg-black/70"
    >
      <div className="flex items-center justify-between gap-4
                      border-b border-border px-5 py-4 sm:px-6">
        <div>
          <h2 id={titleId} className="text-xl font-semibold">
            Create user
          </h2>

          <p className="mt-1 text-sm text-text-secondary">
            Add an account to Smart Pharmacy.
          </p>
        </div>

        <button
          type="button"
          onClick={requestClose}
          disabled={isSubmitting}
          aria-label="Close create user dialog"
          className="flex size-11 shrink-0 items-center justify-center
                     rounded-xl text-text-secondary
                     hover:bg-surface-hover hover:text-text-primary
                     focus-visible:outline-2 focus-visible:outline-primary
                     disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="size-5"
          >
            <path
              d="m6 6 12 12M18 6 6 18"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <form
        noValidate
        onSubmit={handleSubmit}
        aria-busy={isSubmitting}
        className="space-y-5 p-5 sm:p-6"
      >
        <Input
          id={`${fieldId}-name`}
          name="name"
          label="Full name"
          placeholder="Enter full name"
          autoComplete="off"
          maxLength={100}
          required
          autoFocus
          value={values.name}
          onChange={handleChange}
          error={errors.name}
          disabled={isSubmitting}
        />

        <Input
          id={`${fieldId}-email`}
          name="email"
          label="Email address"
          type="email"
          placeholder="user@example.com"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={100}
          required
          value={values.email}
          onChange={handleChange}
          error={errors.email}
          disabled={isSubmitting}
        />

        <div>
          <label
            htmlFor={`${fieldId}-role`}
            className="mb-2 block text-sm font-medium"
          >
            Account role
          </label>

          <select
            id={`${fieldId}-role`}
            name="role"
            value={values.role}
            onChange={handleChange}
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.role)}
            aria-describedby={
              errors.role ? `${fieldId}-role-error` : undefined
            }
            className="min-h-12 w-full rounded-xl border border-border
                       bg-background px-4 py-3 text-sm text-text-primary
                       focus-visible:outline-2 focus-visible:outline-primary
                       disabled:opacity-50"
          >
            <option value="Customer">Customer</option>
            <option value="Pharmacist">Pharmacist</option>
            <option value="Admin">Admin</option>
          </select>

          {errors.role && (
            <p
              id={`${fieldId}-role-error`}
              className="mt-2 text-sm text-danger"
            >
              {errors.role}
            </p>
          )}

          <p className="mt-2 text-xs leading-5 text-text-secondary">
            Choose carefully. Role editing is not available in this interface.
          </p>
        </div>

        <Input
          id={`${fieldId}-password`}
          name="password"
          label="Initial password"
          type={showPasswords ? "text" : "password"}
          placeholder="Enter initial password"
          autoComplete="new-password"
          required
          value={values.password}
          onChange={handleChange}
          error={errors.password}
          disabled={isSubmitting}
        />

        <Input
          id={`${fieldId}-confirm-password`}
          name="confirmPassword"
          label="Confirm password"
          type={showPasswords ? "text" : "password"}
          placeholder="Re-enter the password"
          autoComplete="new-password"
          required
          value={values.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
          disabled={isSubmitting}
        />

        <label className="flex min-h-11 cursor-pointer items-center gap-3
                          text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={showPasswords}
            onChange={(event) => setShowPasswords(event.target.checked)}
            disabled={isSubmitting}
            className="size-4 accent-primary"
          />
          Show passwords
        </label>

        {apiError && (
          <div
            role="alert"
            className="rounded-xl border border-danger/40 bg-danger/10
                       px-4 py-3 text-sm"
          >
            {apiError}
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 border-t
                        border-border pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={requestClose}
            disabled={isSubmitting}
            className="min-h-12 rounded-xl border border-border
                       px-5 py-3 text-sm font-semibold
                       hover:bg-surface-hover
                       focus-visible:outline-2 focus-visible:outline-primary
                       disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create User"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}