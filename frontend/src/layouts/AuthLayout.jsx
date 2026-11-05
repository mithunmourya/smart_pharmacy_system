const features = [
  "Medicine and inventory management",
  "Batch and expiry tracking",
  "Billing and pharmacy sales",
];

function PharmacyMark() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-12 shrink-0 items-center justify-center
                 rounded-2xl border border-border bg-background
                 text-3xl font-bold text-success"
    >
      +
    </span>
  );
}

export default function AuthLayout({ children }) {
  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-2">
      <aside
        className="hidden flex-col justify-between border-r border-border
                   bg-surface p-10 lg:flex xl:p-16"
        style={{
          backgroundImage:
            "radial-gradient(var(--color-border) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        <div className="flex items-center gap-3">
          <PharmacyMark />
          <span className="text-lg font-semibold">Smart Pharmacy</span>
        </div>

        <div className="max-w-lg py-16">
          <p className="mb-5 text-sm font-semibold uppercase tracking-widest text-success">
            Pharmacy management
          </p>

          <h2 className="text-4xl font-bold leading-tight xl:text-5xl">
            Your pharmacy.
            <br />
            One organized workspace.
          </h2>

          <p className="mt-6 text-lg leading-relaxed text-text-secondary">
            Manage medicines, monitor inventory, and handle daily sales
            from one place.
          </p>

          <ul className="mt-10 space-y-4">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full bg-success"
                />
                <span className="text-text-secondary">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-text-secondary">
          Smart Pharmacy Management System
        </p>
      </aside>

      <main className="flex min-h-dvh flex-col px-5 py-8 sm:px-10 lg:px-14">
        <div className="mb-10 flex items-center gap-3 lg:hidden">
          <PharmacyMark />
          <span className="text-lg font-semibold">Smart Pharmacy</span>
        </div>

        <div className="flex flex-1 items-center justify-center py-6">
          <div className="w-full max-w-md">{children}</div>
        </div>

        <footer className="mt-10 text-center text-xs leading-relaxed text-text-secondary">
          © {new Date().getFullYear()} Smart Pharmacy Management System
        </footer>
      </main>
    </div>
  );
}