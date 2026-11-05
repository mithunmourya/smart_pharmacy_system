import { useEffect, useId, useState } from "react";
import { NavLink, useLocation } from "react-router";
import useAuth from "../hooks/useAuth";

const inventoryLinks = [
  {
    label: "Manufacturers",
    path: "/manufacturers",
  },
  {
    label: "Medicines",
    path: "/medicines",
  },
  {
    label: "Batches",
    path: "/batches",
  },
  {
    label: "Available Inventory",
    path: "/inventory",
  },
  {
    label: "Low Stock",
    path: "/low-stock",
  },
];

function isInventoryPath(pathname) {
  return inventoryLinks.some(
    ({ path }) =>
      pathname === path || pathname.startsWith(`${path}/`)
  );
}

function navigationClass({ isActive }) {
  return `
    flex min-h-12 items-center rounded-xl px-4 py-3
    text-sm font-semibold transition-colors
    focus-visible:outline-2 focus-visible:outline-offset-2
    focus-visible:outline-primary
    ${
      isActive
        ? "bg-primary text-white"
        : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
    }
  `;
}

function inventoryLinkClass({ isActive }) {
  return `
    flex min-h-11 items-center rounded-lg px-3 py-2
    text-sm font-medium transition-colors
    focus-visible:outline-2 focus-visible:outline-offset-2
    focus-visible:outline-primary
    ${
      isActive
        ? "bg-primary text-white"
        : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
    }
  `;
}

export default function Sidebar({ onNavigate }) {
  const { user } = useAuth();
  const { pathname } = useLocation();

  const inventoryId = useId();

  const [inventoryOpen, setInventoryOpen] = useState(() =>
    isInventoryPath(pathname)
  );

  const role = user?.role;
  const isAdmin = role === "Admin";
  const isPharmacist = role === "Pharmacist";
  const isCustomer = role === "Customer";

  const inventoryActive = isInventoryPath(pathname);

  useEffect(() => {
    if (isInventoryPath(pathname)) {
      setInventoryOpen(true);
    }
  }, [pathname]);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-surface text-text-primary">
      <div className="flex items-center gap-3 border-b border-border px-6 py-7">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center
                     justify-center rounded-xl border border-border
                     bg-background text-3xl font-bold text-success"
        >
          +
        </span>

        <div className="min-w-0">
          <p className="font-bold">Smart Pharmacy</p>

          <p className="mt-1 text-xs text-text-secondary">
            {role} workspace
          </p>
        </div>
      </div>

      <nav
        aria-label="Main navigation"
        className="flex-1 space-y-2 p-4"
      >
        <NavLink
          to="/dashboard"
          end
          onClick={onNavigate}
          className={navigationClass}
        >
          Dashboard
        </NavLink>

        {isCustomer && (
          <NavLink
            to="/my-purchases"
            onClick={onNavigate}
            className={navigationClass}
          >
            My Purchases
          </NavLink>
        )}

        {isAdmin && (
          <>
            <NavLink
              to="/users"
              onClick={onNavigate}
              className={navigationClass}
            >
              Users
            </NavLink>

            <NavLink
              to="/sales"
              end
              onClick={onNavigate}
              className={navigationClass}
            >
              Sales History
            </NavLink>

            <div>
              <button
                type="button"
                aria-expanded={inventoryOpen}
                aria-controls={inventoryId}
                onClick={() =>
                  setInventoryOpen((previous) => !previous)
                }
                className={`
                  flex min-h-12 w-full items-center justify-between
                  gap-3 rounded-xl px-4 py-3 text-sm font-semibold
                  transition-colors
                  focus-visible:outline-2
                  focus-visible:outline-offset-2
                  focus-visible:outline-primary
                  ${
                    inventoryActive
                      ? "bg-surface-hover text-text-primary"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                  }
                `}
              >
                <span>Inventory</span>

                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                  className={`size-4 shrink-0 transition-transform
                    motion-reduce:transition-none
                    ${inventoryOpen ? "rotate-180" : ""}
                  `}
                >
                  <path
                    d="m5 7.5 5 5 5-5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <div
                id={inventoryId}
                hidden={!inventoryOpen}
              >
                <div className="ml-5 mt-2 space-y-1 border-l border-border pl-3">
                  {inventoryLinks.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={onNavigate}
                      className={inventoryLinkClass}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {isPharmacist && (
          <>
            <NavLink
              to="/sales/new"
              onClick={onNavigate}
              className={navigationClass}
            >
              New Sale
            </NavLink>

            <NavLink
              to="/inventory"
              onClick={onNavigate}
              className={navigationClass}
            >
              Available Inventory
            </NavLink>

            <NavLink
              to="/low-stock"
              onClick={onNavigate}
              className={navigationClass}
            >
              Low Stock
            </NavLink>
          </>
        )}
      </nav>

      <div className="mt-auto border-t border-border p-4">
        <nav aria-label="Account navigation">
          <NavLink
            to="/profile"
            onClick={onNavigate}
            className={navigationClass}
          >
            My Profile
          </NavLink>
        </nav>

        <p className="px-4 pb-1 pt-4 text-xs text-text-muted">
          Version 1.0
        </p>
      </div>
    </div>
  );
}