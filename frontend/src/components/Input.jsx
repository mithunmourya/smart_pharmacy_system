import { useId } from "react";

export default function Input({
  label,
  id,
  error,
  endAdornment,
  className = "",
  ...props
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-2 block text-sm font-medium text-text-primary"
      >
        {label}
      </label>

      <div className="relative">
        <input
          {...props}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={`
            min-h-12 w-full rounded-xl border bg-background
            px-4 py-3 text-base text-text-primary
            placeholder:text-text-secondary
            focus-visible:outline-2 focus-visible:outline-offset-2
            focus-visible:outline-primary
            disabled:cursor-not-allowed disabled:opacity-50
            ${error ? "border-danger" : "border-border"}
            ${endAdornment ? "pr-20" : ""}
            ${className}
          `}
        />

        {endAdornment && (
          <div className="absolute inset-y-0 right-1 flex items-center">
            {endAdornment}
          </div>
        )}
      </div>

      {error && (
        <p id={errorId} className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}