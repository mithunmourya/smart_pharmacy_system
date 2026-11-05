import { useEffect, useId, useRef } from "react";

export default function Modal({
  title,
  children,
  onClose,
  busy = false,
}) {
  const dialogRef = useRef(null);
  const titleId = useId();

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
    if (!busy) onClose();
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
      <header className="flex items-center justify-between gap-4
                         border-b border-border px-5 py-4 sm:px-6">
        <h2 id={titleId} className="text-xl font-semibold">
          {title}
        </h2>

        <button
          type="button"
          onClick={requestClose}
          disabled={busy}
          aria-label="Close dialog"
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
            <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="p-5 sm:p-6">{children}</div>
    </dialog>
  );
}