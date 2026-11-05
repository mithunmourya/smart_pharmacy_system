import { Link } from "react-router";
import useAuth from "../../hooks/useAuth";

export default function MyProfile() {
  const { user } = useAuth();

  const initials =
    user.name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "U";

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-sm text-text-secondary">Account</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
          My Profile
        </h1>
        <p className="mt-3 text-text-secondary">
          View your account information and manage your password.
        </p>
      </header>

      <section
        aria-labelledby="profile-details-heading"
        className="overflow-hidden rounded-2xl border border-border bg-surface"
      >
        <div className="flex flex-wrap items-center gap-4 border-b border-border p-6">
          <span
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center
                       rounded-2xl bg-primary text-xl font-bold text-white"
          >
            {initials}
          </span>

          <div className="min-w-0 flex-1">
            <h2
              id="profile-details-heading"
              className="break-words text-xl font-semibold"
            >
              {user.name}
            </h2>

            <span
              className="mt-2 inline-block rounded-full border border-border
                         bg-background px-3 py-1 text-xs text-text-secondary"
            >
              {user.role}
            </span>
          </div>
        </div>

        <dl className="grid gap-6 p-6 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-text-secondary">Full name</dt>
            <dd className="mt-2 break-words font-medium">{user.name}</dd>
          </div>

          <div>
            <dt className="text-sm text-text-secondary">Email address</dt>
            <dd className="mt-2 break-all font-medium">{user.email}</dd>
          </div>

          <div>
            <dt className="text-sm text-text-secondary">Account role</dt>
            <dd className="mt-2 font-medium">{user.role}</dd>
          </div>
        </dl>

        <div className="border-t border-border px-6 py-5">
          {user.role === "Admin" ? (
            <p className="text-sm leading-6 text-text-secondary">
              Name and email changes are managed through Users management.
            </p>
          ) : (
            <p className="text-sm leading-6 text-text-secondary">
              To update your name or email address, please contact your
              administrator.
            </p>
          )}
        </div>
      </section>

      <section
        aria-labelledby="password-heading"
        className="rounded-2xl border border-border bg-surface p-6"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="password-heading" className="text-lg font-semibold">
              Password
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Use your current password to set a new one.
            </p>
          </div>

          <Link
            to="/settings/change-password"
            className="inline-flex min-h-12 shrink-0 items-center justify-center
                       rounded-xl bg-primary px-5 py-3 text-sm font-semibold
                       text-white hover:bg-primary-hover
                       focus-visible:outline-2 focus-visible:outline-offset-2
                       focus-visible:outline-primary"
          >
            Change Password
          </Link>
        </div>
      </section>
    </section>
  );
}