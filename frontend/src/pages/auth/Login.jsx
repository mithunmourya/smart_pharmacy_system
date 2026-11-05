import { useRef, useState } from "react";
import Button from "../../components/Button";
import Input from "../../components/Input";
import { loginUser } from "../../services/auth.service";
import useAuth from "../../hooks/useAuth";
export default function Login() {
    const { login } = useAuth();
  const [values, setValues] = useState({
    email: "",
    password: "",
  });

  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
 

  const submittingRef = useRef(false);

  function handleChange(event) {
    const { name, value } = event.target;

    setValues((previous) => ({
      ...previous,
      [name]: value,
    }));

    setErrors((previous) => ({
      ...previous,
      [name]: "",
    }));

    setApiError("");
   
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submittingRef.current) return;

    const form = event.currentTarget;
    const emailInput = form.elements.namedItem("email");
    const nextErrors = {};

    if (!values.email.trim()) {
      nextErrors.email = "Enter your email address.";
    } else if (emailInput.validity.typeMismatch) {
      nextErrors.email = "Enter a valid email address.";
    } else if (values.email.length > 100) {
      nextErrors.email = "Email must be 100 characters or fewer.";
    }

    if (!values.password) {
      nextErrors.password = "Enter your password.";
    }

    setErrors(nextErrors);
    setApiError("");
   

    const firstInvalidField = Object.keys(nextErrors)[0];

    if (firstInvalidField) {
      form.elements.namedItem(firstInvalidField).focus();
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
  const session = await loginUser(values);

  setValues((previous) => ({
    ...previous,
    password: "",
  }));

  setShowPassword(false);

  login(session);
} catch (error) {
  setApiError(error.message || "Unable to sign in. Please try again.");
} finally {
  submittingRef.current = false;
  setIsSubmitting(false);
}
  }

  return (
    <section aria-labelledby="login-heading">
      <header className="mb-8">
        <p className="mb-3 text-sm font-medium text-text-secondary">
          Welcome back
        </p>

        <h1
          id="login-heading"
          className="text-3xl font-bold tracking-tight sm:text-4xl"
        >
          Sign in to your account
        </h1>

        <p className="mt-4 leading-relaxed text-text-secondary">
          Enter your registered email address and password.
        </p>
      </header>

      <form
        noValidate
        onSubmit={handleSubmit}
        aria-busy={isSubmitting}
        className="space-y-6"
      >
        <Input
          id="email"
          label="Email address"
          name="email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={100}
          required
          placeholder="you@example.com"
          value={values.email}
          onChange={handleChange}
          error={errors.email}
          disabled={isSubmitting}
        />

        <Input
          id="password"
          label="Password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          required
          placeholder="Enter your password"
          value={values.password}
          onChange={handleChange}
          error={errors.password}
          disabled={isSubmitting}
          endAdornment={
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-controls="password"
              disabled={isSubmitting}
              onClick={() => setShowPassword((previous) => !previous)}
              className="min-h-11 min-w-14 rounded-lg px-2
                         text-sm font-medium text-text-secondary
                         hover:text-text-primary
                         focus-visible:outline-2
                         focus-visible:outline-primary
                         disabled:cursor-not-allowed disabled:opacity-50"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          }
        />

        {apiError && (
          <div
            role="alert"
            className="rounded-xl border border-danger/40
                       bg-danger/10 px-4 py-3 text-sm text-text-primary"
          >
            {apiError}
          </div>
        )}

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full"
        >
          {isSubmitting ? "Signing in..." : "Sign In"}
        </Button>

        <p
  role="status"
  className="text-sm leading-relaxed text-text-secondary"
>
  {isSubmitting ? "Checking your credentials..." : ""}
</p>
      </form>
    </section>
  );
}