export default function Button({
  children,
  type = "button",
  className = "",
  disabled = false,
  ...props
}) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled}
      className={`
        inline-flex min-h-12 items-center justify-center
        rounded-xl bg-primary px-5 py-3
        font-semibold text-white transition-colors
        hover:bg-primary-hover
        focus-visible:outline-2 focus-visible:outline-offset-4
        focus-visible:outline-primary
        disabled:cursor-not-allowed disabled:opacity-50
        ${className}
      `}
    >
      {children}
    </button>
  );
}