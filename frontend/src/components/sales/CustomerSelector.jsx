import { useEffect, useId, useRef, useState } from "react";
import useAuth from "../../hooks/useAuth";
import {
  createCustomer,
  lookupCustomer,
} from "../../services/customer.service";

const options = [
  { value: "walk-in", label: "Walk-in" },
  { value: "existing", label: "Existing Customer" },
  { value: "create", label: "Create Customer" },
];

const buttonClass = `
  inline-flex min-h-11 items-center justify-center rounded-lg
  border border-border px-4 py-2 text-sm font-medium
  hover:bg-surface-hover
  focus-visible:outline-2 focus-visible:outline-offset-2
  focus-visible:outline-primary
  disabled:cursor-not-allowed disabled:opacity-50
`;

const inputClass = `
  mt-1 min-h-11 w-full rounded-lg border border-border
  bg-background px-3 py-2 text-sm text-text-primary
  focus-visible:outline-2 focus-visible:outline-primary
  disabled:cursor-not-allowed disabled:opacity-60
`;

export default function CustomerSelector({
  value,
  onChange,
  onBusyChange,
  disabled = false,
}) {
  const { authenticatedRequest } = useAuth();
  const id = useId();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [match, setMatch] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const busyRef = useRef(false);
  const requestIdRef = useRef(0);

  // Ignore responses arriving after this selector is removed/reset.
  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
    };
  }, []);

  function clearFeedback() {
    setMatch(null);
    setNotFound(false);
    setDuplicate(false);
    setError("");
  }

  function changeMode(mode) {
    if (disabled || busyRef.current) return;

    clearFeedback();

    onChange({
      mode,
      customer: null,
    });
  }

  function handleEmailChange(event) {
    setEmail(event.target.value);
    clearFeedback();
  }

  function changeSelectedCustomer() {
    if (disabled || busyRef.current) return;

    setEmail(value.customer?.email || "");
    clearFeedback();

    onChange({
      mode: "existing",
      customer: null,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (
      disabled ||
      busyRef.current ||
      value.mode === "walk-in" ||
      value.customer
    ) {
      return;
    }

    const form = event.currentTarget;
    const normalizedEmail = email.trim();
    const normalizedName = name.trim();
    const creating = value.mode === "create";

    clearFeedback();

    if (
      !normalizedEmail ||
      normalizedEmail.length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      setError("Enter a valid email address.");
      form.elements.namedItem("email")?.focus();
      return;
    }

    if (
      creating &&
      (!normalizedName || normalizedName.length > 100)
    ) {
      setError("Enter a customer name of 100 characters or fewer.");
      form.elements.namedItem("name")?.focus();
      return;
    }

    setEmail(normalizedEmail);

    busyRef.current = true;
    setBusy(true);
    onBusyChange(true);

    const requestId = ++requestIdRef.current;

    try {
      if (creating) {
        const customer = await createCustomer(authenticatedRequest, {
          name: normalizedName,
          email: normalizedEmail,
        });

        if (requestId !== requestIdRef.current) return;

        // Account creation also selects the new customer.
        onChange({
          mode: "existing",
          customer,
        });
      } else {
        const customer = await lookupCustomer(
          authenticatedRequest,
          normalizedEmail
        );

        if (requestId !== requestIdRef.current) return;

        // Existing accounts require an explicit selection.
        setMatch(customer);
      }
    } catch (requestError) {
      if (requestId !== requestIdRef.current) return;

      const status = Number(requestError.status || 0);

      if (
        !creating &&
        status === 404 &&
        requestError.message ===
          "No customer account found for this email."
      ) {
        setNotFound(true);
      } else if (creating && status === 409) {
        setDuplicate(true);
        setError(requestError.message);
      } else if (
        creating &&
        (!status || status >= 500 || status === 408)
      ) {
        // Account creation may have succeeded despite a lost response.
        // Search before attempting another creation.
        onChange({
          mode: "existing",
          customer: null,
        });

        setError(
          "Account creation could not be confirmed. Search this email " +
            "to check whether the account was created before trying again."
        );
      } else {
        setError(
          requestError.message || "Unable to process customer details."
        );
      }
    } finally {
      if (requestId === requestIdRef.current) {
        busyRef.current = false;
        setBusy(false);
        onBusyChange(false);
      }
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <fieldset
        disabled={disabled || busy}
        aria-busy={busy}
        className="min-w-0"
      >
        <legend className="mb-3 font-semibold">Customer</legend>

        <div className="grid gap-2 sm:grid-cols-3">
          {options.map((option) => (
            <label
              key={option.value}
              className={`
                flex min-h-11 items-center gap-3 rounded-xl
                border px-4 py-3 text-sm font-medium
                ${
                  value.mode === option.value
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background"
                }
                ${disabled || busy ? "opacity-60" : "cursor-pointer"}
              `}
            >
              <input
                type="radio"
                name={`${id}-customer-mode`}
                value={option.value}
                checked={value.mode === option.value}
                onChange={() => changeMode(option.value)}
                className="size-4 shrink-0 accent-primary"
              />
              {option.label}
            </label>
          ))}
        </div>

        {value.mode === "walk-in" ? (
          <p className="mt-4 text-sm text-text-secondary">
            This sale will be recorded without a customer account.
          </p>
        ) : value.customer ? (
          <div
            role="status"
            className="mt-4 flex flex-col gap-4 rounded-xl
                       border border-success/30 bg-success/5 p-4
                       sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-xs font-medium text-success">
                Selected customer
              </p>
              <p className="mt-1 break-words font-semibold">
                {value.customer.name}
              </p>
              <p className="mt-1 break-all text-sm text-text-secondary">
                {value.customer.email}
              </p>
            </div>

            <button
              type="button"
              onClick={changeSelectedCustomer}
              className={`${buttonClass} shrink-0`}
            >
              Change customer
            </button>
          </div>
        ) : (
          <form
            noValidate
            onSubmit={handleSubmit}
            className="mt-4 space-y-4"
          >
            <div
              className={`grid items-end gap-3 ${
                value.mode === "create"
                  ? "sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]"
                  : "sm:grid-cols-[1fr_auto]"
              }`}
            >
              {value.mode === "create" && (
                <div className="min-w-0">
                  <label
                    htmlFor={`${id}-name`}
                    className="text-xs text-text-secondary"
                  >
                    Customer name
                  </label>
                  <input
                    id={`${id}-name`}
                    name="name"
                    type="text"
                    required
                    maxLength={100}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setError("");
                    }}
                    placeholder="Full name"
                    autoComplete="off"
                    className={inputClass}
                  />
                </div>
              )}

              <div className="min-w-0">
                <label
                  htmlFor={`${id}-email`}
                  className="text-xs text-text-secondary"
                >
                  Customer email
                </label>
                <input
                  id={`${id}-email`}
                  name="email"
                  type="email"
                  required
                  maxLength={100}
                  value={email}
                  onChange={handleEmailChange}
                  placeholder="customer@example.com"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                className="inline-flex min-h-11 items-center
                           justify-center rounded-lg bg-primary px-4 py-2
                           text-sm font-semibold text-white
                           hover:bg-primary-hover
                           focus-visible:outline-2
                           focus-visible:outline-offset-2
                           focus-visible:outline-primary
                           disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy
                  ? value.mode === "create"
                    ? "Creating..."
                    : "Searching..."
                  : value.mode === "create"
                    ? "Create and select"
                    : "Search customer"}
              </button>
            </div>

            {value.mode === "create" && (
              <p className="text-xs leading-5 text-text-secondary">
                Create an account with the customer's agreement.
                The initial password is{" "}
                <span className="font-medium text-text-primary">
                  12345678
                </span>
                . They can change it after signing in.
              </p>
            )}

            {busy && (
              <p role="status" className="text-sm text-text-secondary">
                {value.mode === "create"
                  ? "Creating customer account..."
                  : "Checking customer email..."}
              </p>
            )}

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            {duplicate && (
              <button
                type="button"
                onClick={() => changeMode("existing")}
                className={buttonClass}
              >
                Search existing account
              </button>
            )}

            {notFound && (
              <div
                role="status"
                className="rounded-xl border border-border bg-background p-4"
              >
                <p className="text-sm">
                  No customer account was found for this email.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => changeMode("create")}
                    className={buttonClass}
                  >
                    Create account
                  </button>

                  <button
                    type="button"
                    onClick={() => changeMode("walk-in")}
                    className={buttonClass}
                  >
                    Continue as walk-in
                  </button>
                </div>
              </div>
            )}

            {match && (
              <div
                role="status"
                className="flex flex-col gap-4 rounded-xl
                           border border-border bg-background p-4
                           sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-xs text-text-secondary">
                    Customer found — confirm before selecting
                  </p>
                  <p className="mt-1 break-words font-semibold">
                    {match.name}
                  </p>
                  <p className="mt-1 break-all text-sm text-text-secondary">
                    {match.email}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (disabled || busyRef.current) return;

                    onChange({
                      mode: "existing",
                      customer: match,
                    });

                    clearFeedback();
                  }}
                  className={`${buttonClass} shrink-0`}
                >
                  Select customer
                </button>
              </div>
            )}
          </form>
        )}
      </fieldset>
    </section>
  );
}