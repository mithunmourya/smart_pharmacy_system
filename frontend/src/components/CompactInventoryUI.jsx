export function SummaryBadge({ count, children, tone = "neutral" }) {
  const colors = {
    neutral: "border-border bg-surface text-text-secondary",
    success: "border-success/30 bg-success/10 text-success",
    warning: "border-warning/30 bg-warning/10 text-warning",
    danger: "border-danger/30 bg-danger/10 text-danger",
  };

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full
                  border px-3 py-1.5 text-xs ${colors[tone]}`}
    >
      <strong className="font-semibold tabular-nums">{count}</strong>
      {children}
    </span>
  );
}

export function CompactHeader({
  title,
  description,
  summary,
  children,
}) {
  return (
    <header className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          {description}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
        <div
          role="group"
          aria-label="Summary before filtering"
          className="flex flex-wrap items-center gap-2"
        >
          {summary}
        </div>
        {children}
      </div>
    </header>
  );
}

export function FilterField({
  id,
  label,
  children,
  className = "",
  ...props
}) {
  const controlClass = `
    min-h-11 w-full min-w-0 rounded-lg border border-border
    bg-background px-3 py-2.5 text-sm text-text-primary
    placeholder:text-text-muted
    focus-visible:outline-2 focus-visible:outline-primary
    disabled:opacity-50
  `;

  return (
    <div className={`min-w-0 ${className}`}>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium text-text-secondary"
      >
        {label}
      </label>

      {children ? (
        <select id={id} {...props} className={controlClass}>
          {children}
        </select>
      ) : (
        <input id={id} {...props} className={controlClass} />
      )}
    </div>
  );
}

export function StatusBadge({ active }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
        active
          ? "bg-success/10 text-success"
          : "bg-background text-text-secondary"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function SortHeader({ column, sort, onSort }) {
  const active = sort.key === column.key;

  return (
    <th
      scope="col"
      aria-sort={
        active
          ? sort.direction === "asc"
            ? "ascending"
            : "descending"
          : undefined
      }
      className="px-4 py-1 font-medium"
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        aria-label={`${column.label}: sort ${
          active && sort.direction === "asc" ? "descending" : "ascending"
        }`}
        className={`inline-flex min-h-11 items-center gap-2 rounded-lg
                    px-1 text-xs font-semibold uppercase tracking-wide
                    hover:bg-surface-hover focus-visible:outline-2
                    focus-visible:outline-primary ${
                      active ? "text-text-primary" : "text-text-secondary"
                    }`}
      >
        {column.label}

        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4 shrink-0"
        >
          {!active ? (
            <>
              <path d="M8 19V5m-3 3 3-3 3 3" />
              <path d="M16 5v14m-3-3 3 3 3-3" />
            </>
          ) : sort.direction === "asc" ? (
            <path d="M12 19V5m-5 5 5-5 5 5" />
          ) : (
            <path d="M12 5v14m-5-5 5 5 5-5" />
          )}
        </svg>
      </button>
    </th>
  );
}

export function CompactTable({
  title,
  noun,
  columns,
  sort,
  onSort,
  onReload,
  loading,
  error,
  total,
  count,
  hasFilters,
  onClearFilters,
  emptyMessage,
  ready = true,
  reloadDisabled = false,
  minWidth = "min-w-[900px]",
  children,
}) {
  return (
    <section
      aria-label={title}
      className="overflow-hidden rounded-xl border border-border bg-surface"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p role="status" className="mt-0.5 text-xs text-text-secondary">
            {!ready
              ? "Select a medicine to begin."
              : loading
                ? `Loading ${noun}...`
                : error
                  ? `Could not load ${noun}.`
                  : `${count} of ${total} ${noun}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {hasFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="min-h-11 rounded-lg px-2 text-xs font-medium
                         text-text-secondary hover:bg-surface-hover
                         hover:text-text-primary focus-visible:outline-2
                         focus-visible:outline-primary"
            >
              Clear filters
            </button>
          )}

          <button
            type="button"
            onClick={onReload}
            disabled={!ready || loading || reloadDisabled}
            aria-label={`Reload ${noun}`}
            title={`Reload ${noun}`}
            className="flex size-11 shrink-0 items-center justify-center
                       rounded-lg border border-border text-text-secondary
                       hover:bg-surface-hover focus-visible:outline-2
                       focus-visible:outline-primary
                       disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`size-5 ${loading ? "motion-safe:animate-spin" : ""}`}
            >
              <path d="M20 7v5h-5M4 17v-5h5" />
              <path d="M6.1 7a7 7 0 0 1 11.55-1.65L20 8" />
              <path d="M17.9 17a7 7 0 0 1-11.55 1.65L4 16" />
            </svg>
          </button>
        </div>
      </div>

      <p role="status" className="sr-only">
        Sorted by {columns.find((column) => column.key === sort.key)?.label},{" "}
        {sort.direction === "asc" ? "ascending" : "descending"}.
      </p>

      <div aria-busy={ready && loading}>
        {!ready ? (
          <p className="px-6 py-12 text-center text-sm text-text-secondary">
            Choose a medicine above to view its batches.
          </p>
        ) : loading ? (
          <p className="px-6 py-12 text-center text-sm text-text-secondary">
            Loading {noun}...
          </p>
        ) : error ? (
          <div className="px-6 py-12 text-center">
            <p role="alert" className="text-sm text-danger">{error}</p>
            <p className="mt-3 text-sm text-text-secondary">
              Use the reload button above to try again.
            </p>
          </div>
        ) : total === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="font-medium">No {noun} found</h3>
            <p className="mt-2 text-sm text-text-secondary">{emptyMessage}</p>
          </div>
        ) : count === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="font-medium">No matching {noun}</h3>
            <button
              type="button"
              onClick={onClearFilters}
              className="mt-3 min-h-11 rounded-lg px-3 text-sm underline
                         focus-visible:outline-2 focus-visible:outline-primary"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div
            role="region"
            aria-label={title}
            tabIndex={0}
            className="overflow-x-auto focus-visible:outline-2
                       focus-visible:outline-primary
                       focus-visible:-outline-offset-2"
          >
            <table className={`w-full text-left text-sm ${minWidth}`}>
              <thead className="bg-background text-xs uppercase tracking-wide text-text-secondary">
                <tr>
                  {columns.map((column) =>
                    column.sortable === false ? (
                      <th
                        key={column.key}
                        scope="col"
                        className="px-4 py-3 font-medium"
                      >
                        {column.label}
                      </th>
                    ) : (
                      <SortHeader
                        key={column.key}
                        column={column}
                        sort={sort}
                        onSort={onSort}
                      />
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">{children}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}