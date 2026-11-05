import { useEffect, useId, useRef, useState } from "react";
import { Outlet } from "react-router";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";


export default function DashboardLayout() {


  const dialogRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuTitleId = useId();

  function openMenu() {
    const dialog = dialogRef.current;

    if (dialog && !dialog.open) {
      dialog.showModal();
      setMenuOpen(true);
    }
  }

  function closeMenu() {
    dialogRef.current?.close();
    setMenuOpen(false);
  }

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1024px)");

    function handleResize(event) {
      if (event.matches) {
        dialogRef.current?.close();
        setMenuOpen(false);
      }
    }

    desktopQuery.addEventListener("change", handleResize);

    return () => {
      desktopQuery.removeEventListener("change", handleResize);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  return (
   <div className="min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4
                   focus:top-4 focus:z-50 focus:rounded-lg
                   focus:bg-primary focus:px-4 focus:py-3 focus:text-white"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        aria-label="Sidebar"
        className="fixed inset-y-0 left-0 hidden w-64
                   overflow-y-auto border-r border-border lg:block"
      >
        <Sidebar />
      </aside>

      {/* Mobile navigation drawer */}
      <dialog
        ref={dialogRef}
        id={menuId}
        aria-labelledby={menuTitleId}
        onClose={() => setMenuOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeMenu();
          }
        }}
        className="fixed inset-y-0 left-0 right-auto m-0 h-dvh
                   max-h-none w-72 max-w-[85vw] overflow-y-auto border-0
                   bg-surface p-0 text-text-primary
                   backdrop:bg-black/60"
      >
        <div className="flex min-h-full flex-col">
          <div
            className="flex items-center justify-between
                       border-b border-border px-4 py-3"
          >
            <h2 id={menuTitleId} className="font-semibold">
              Navigation
            </h2>

            <button
              type="button"
              onClick={closeMenu}
              className="min-h-11 rounded-lg px-3 text-sm
                         hover:bg-surface-hover
                         focus-visible:outline-2
                         focus-visible:outline-primary"
            >
              Close
            </button>
          </div>

          <div className="flex flex-1 flex-col [&>div]:flex-1">
            <Sidebar onNavigate={closeMenu} />
          </div>
        </div>
      </dialog>

      {/* Navbar and page content */}
      <div className="min-w-0 lg:pl-64">
        <Navbar
          onOpenMenu={openMenu}
          menuOpen={menuOpen}
          menuId={menuId}
        />

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-7xl p-5 sm:p-8"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}