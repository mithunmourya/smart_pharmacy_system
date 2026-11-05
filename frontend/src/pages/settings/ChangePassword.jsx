import { useRef, useState } from "react";
import { Link } from "react-router";
import Button from "../../components/Button";
import Input from "../../components/Input";
import useAuth from "../../hooks/useAuth";

const initialValues = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export default function ChangePassword() {
  const { authenticatedRequest } = useAuth();

  const [values, setValues] = useState(initialValues);
  const [showPasswords, setShowPasswords] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submittingRef = useRef(false);

  function handleChange(event) {
    const { name, value } = event.target;

    setValues((previous) => ({
      ...previous,
      [name]: value,
    }));

    setError("");
    setNotice("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submittingRef.current) return;

    setError("");
    setNotice("");

    if (
      !values.currentPassword ||
      !values.newPassword ||
      !values.confirmPassword
    ) {
      setError("Complete all password fields.");
      return;
    }

    if (values.newPassword !== values.confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    if (values.currentPassword === values.newPassword) {
      setError("New password must differ from your current password.");
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const response = await authenticatedRequest(
        "/users/change-password",
        {
          method: "PATCH",
          body: {
            currentPassword: values.currentPassword,
            newPassword: values.newPassword,
          },
        }
      );

      setValues(initialValues);
      setShowPasswords(false);
      setNotice(response.message || "Password changed successfully.");
    } catch (err) {
      setError(err.message || "Unable to change your password.");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-xl">
      <Link
        to="/profile"
        className="mb-4 inline-flex min-h-11 items-center
                   text-sm text-text-secondary underline
                   hover:text-text-primary
                   focus-visible:outline-2
                   focus-visible:outline-primary"
      >
        Back to My Profile
      </Link>

      <h1 className="text-3xl font-bold">Change Password</h1>

      <p className="mt-3 text-text-secondary">
        Enter your current password and choose a new password.
      </p>

      <form
        onSubmit={handleSubmit}
        aria-busy={isSubmitting}
        className="mt-6 space-y-5 rounded-2xl border border-border
                   bg-surface p-5 sm:p-7"
      >
        <fieldset disabled={isSubmitting} className="space-y-5">
          <Input
            id="current-password"
            label="Current password"
            name="currentPassword"
            type={showPasswords ? "text" : "password"}
            autoComplete="current-password"
            value={values.currentPassword}
            onChange={handleChange}
            required
          />

          <Input
            id="new-password"
            label="New password"
            name="newPassword"
            type={showPasswords ? "text" : "password"}
            autoComplete="new-password"
            value={values.newPassword}
            onChange={handleChange}
            required
          />

          <Input
            id="confirm-password"
            label="Confirm new password"
            name="confirmPassword"
            type={showPasswords ? "text" : "password"}
            autoComplete="new-password"
            value={values.confirmPassword}
            onChange={handleChange}
            required
          />

          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={showPasswords}
              onChange={(event) => setShowPasswords(event.target.checked)}
              className="size-4 accent-primary"
            />
            Show passwords
          </label>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Updating..." : "Update Password"}
          </Button>
        </fieldset>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-danger/40
                       bg-danger/10 p-3 text-sm text-text-primary"
          >
            {error}
          </p>
        )}

        <p role="status" className="text-sm text-text-secondary">
          {isSubmitting ? "Updating your password..." : notice}
        </p>
      </form>
    </section>
  );
}