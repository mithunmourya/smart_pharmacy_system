import { Link } from "react-router";
import useAuth from "../hooks/useAuth";

export default function Navbar({ onOpenMenu, menuOpen, menuId }) {
  const { user, logout } = useAuth();

  const initials =
    user.name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "U";

  return (
    <header className="border-b border-border bg-surface px-4 py-4 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Open navigation menu"
            aria-controls={menuId}
            aria-expanded={menuOpen}
            className="flex size-11 shrink-0 items-center justify-center
                       rounded-xl border border-border hover:bg-surface-hover
                       focus-visible:outline-2
                       focus-visible:outline-primary lg:hidden"
          >
            <svg
              aria-hidden="true"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div>
            <p className="text-sm font-semibold">Smart Pharmacy</p>
            <p className="mt-1 text-xs text-text-secondary">
              {user.role} workspace
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            to="/profile"
            aria-label={`Open my profile: ${user.name}`}
            className="flex min-h-11 items-center gap-3 rounded-xl p-1.5
                       hover:bg-surface-hover
                       focus-visible:outline-2 focus-visible:outline-offset-2
                       focus-visible:outline-primary"
          >
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center
                         rounded-full bg-primary text-sm font-bold text-white"
            >
              {initials}
            </span>

            <div className="hidden text-left sm:block">
              <p className="max-w-40 truncate text-sm font-semibold">
                {user.name}
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                My Profile
              </p>
            </div>
          </Link>

          <button
            type="button"
            onClick={logout}
            className="min-h-11 rounded-xl border border-border
                       px-3 text-sm font-medium sm:px-4
                       hover:bg-surface-hover
                       focus-visible:outline-2 focus-visible:outline-offset-2
                       focus-visible:outline-primary"
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}