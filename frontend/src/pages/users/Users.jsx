import { useEffect, useState } from "react";
import Button from "../../components/Button";
import {
  CompactHeader,
  CompactTable,
  FilterField,
  StatusBadge,
  SummaryBadge,
} from "../../components/CompactInventoryUI";
import useAuth from "../../hooks/useAuth";
import { getUsers } from "../../services/user.service";
import { formatBatchDate } from "../../utils/batch";
import CreateUserModal from "./CreateUserModal";
import UserActionModal from "./UserActionModal";

const actionClass = `
  inline-flex min-h-11 items-center justify-center gap-2
  rounded-lg border border-border px-3 py-2 text-xs font-semibold
  hover:bg-surface-hover focus-visible:outline-2
  focus-visible:outline-primary
  disabled:cursor-not-allowed disabled:opacity-40
`;

const collator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

const columns = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "role", label: "Role" },
  { key: "status", label: "Status", sortable: false },
  { key: "created_at", label: "Created" },
  { key: "actions", label: "Actions", sortable: false },
];

function getTimestamp(value) {
  if (!value) return null;

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
}

export default function Users() {
  const { user: currentUser, authenticatedRequest } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const [sort, setSort] = useState({
    key: "name",
    direction: "asc",
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadUsers() {
      setLoading(true);
      setError("");

      try {
        const result = await getUsers(authenticatedRequest);

        if (!ignore) {
          setUsers(result);
        }
      } catch (requestError) {
        if (!ignore) {
          setError(
            requestError.message || "Unable to load users. Please try again."
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadUsers();

    return () => {
      ignore = true;
    };
  }, [authenticatedRequest, reloadKey]);

  function reloadUsers() {
    setLoading(true);
    setReloadKey((previous) => previous + 1);
  }

  function clearFilters() {
    setSearch("");
    setRoleFilter("All");
    setStatusFilter("All");
  }

  function handleSort(key) {
    setSort((previous) => ({
      key,
      direction:
        previous.key === key && previous.direction === "asc"
          ? "desc"
          : "asc",
    }));
  }

  function handleSuccess(message) {
    setCreateOpen(false);
    setSelectedAction(null);
    setNotice(message);
    reloadUsers();
  }

  function openAction(action, user) {
    if (action === "edit" && !user.is_active) return;

    if (
      action === "deactivate" &&
      Number(user.user_id) === Number(currentUser.user_id)
    ) {
      return;
    }

    setNotice("");
    setSelectedAction({ action, user });
  }

  const query = search.trim().toLowerCase();

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      (user.name || "").toLowerCase().includes(query) ||
      (user.email || "").toLowerCase().includes(query);

    const matchesRole =
      roleFilter === "All" || user.role === roleFilter;

    const matchesStatus =
      statusFilter === "All" ||
      (statusFilter === "Active" && user.is_active) ||
      (statusFilter === "Inactive" && !user.is_active);

    return matchesSearch && matchesRole && matchesStatus;
  });

  const sortedUsers = [...filteredUsers].sort((first, second) => {
    let comparison;

    if (sort.key === "created_at") {
      const firstTimestamp = getTimestamp(first.created_at);
      const secondTimestamp = getTimestamp(second.created_at);

      // Missing dates stay at the bottom in either direction.
      if (firstTimestamp === null && secondTimestamp !== null) return 1;
      if (firstTimestamp !== null && secondTimestamp === null) return -1;

      comparison =
        firstTimestamp === null && secondTimestamp === null
          ? 0
          : firstTimestamp - secondTimestamp;
    } else {
      comparison = collator.compare(
        String(first[sort.key] ?? "").trim(),
        String(second[sort.key] ?? "").trim()
      );
    }

    if (comparison !== 0) {
      return sort.direction === "asc" ? comparison : -comparison;
    }

    return (
      collator.compare(first.name || "", second.name || "") ||
      Number(first.user_id) - Number(second.user_id)
    );
  });

  const activeCount = users.filter((user) => user.is_active).length;
  const inactiveCount = users.length - activeCount;

  const hasFilters =
    search !== "" || roleFilter !== "All" || statusFilter !== "All";

  return (
    <div className="space-y-4">
      <CompactHeader
        title="Users"
        description="Manage user accounts, contact details, and access status."
        summary={
          !loading && !error && (
            <>
              <SummaryBadge count={users.length}>
                total
              </SummaryBadge>

              <SummaryBadge count={activeCount} tone="success">
                active
              </SummaryBadge>

              {inactiveCount > 0 && (
                <SummaryBadge count={inactiveCount}>
                  inactive
                </SummaryBadge>
              )}
            </>
          )
        }
      >
        <Button
          onClick={() => {
            setNotice("");
            setCreateOpen(true);
          }}
          className="gap-2"
        >
          <span aria-hidden="true">+</span>
          Create User
        </Button>
      </CompactHeader>

      {notice && (
        <div
          role="status"
          className="rounded-xl border border-success/40
                     bg-success/10 px-4 py-3 text-sm"
        >
          {notice}
        </div>
      )}

      <section
        aria-label="Filter users"
        className="rounded-xl border border-border bg-surface p-3 sm:p-4"
      >
        <div
          className="grid items-end gap-3 sm:grid-cols-2
                     xl:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))]"
        >
          <FilterField
            id="user-search"
            name="search"
            label="Search users"
            type="search"
            autoComplete="off"
            placeholder="Search by name or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="sm:col-span-2 xl:col-span-1"
          />

          <FilterField
            id="user-role"
            label="Role"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="All">All roles</option>
            <option value="Admin">Admin</option>
            <option value="Pharmacist">Pharmacist</option>
            <option value="Customer">Customer</option>
          </FilterField>

          <FilterField
            id="user-status"
            label="Status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="All">All statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </FilterField>
        </div>
      </section>

      <CompactTable
        title="Users list"
        noun="users"
        columns={columns}
        sort={sort}
        onSort={handleSort}
        onReload={reloadUsers}
        loading={loading}
        error={error}
        total={users.length}
        count={sortedUsers.length}
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        emptyMessage="Use Create User to add an account."
        minWidth="min-w-[960px]"
      >
        {sortedUsers.map((user) => {
          const isSelf =
            Number(user.user_id) === Number(currentUser.user_id);

          return (
            <tr
              key={user.user_id}
              className="hover:bg-background/40"
            >
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <span className="max-w-48 break-words font-medium">
                    {user.name}
                  </span>

                  {isSelf && (
                    <span
                      className="shrink-0 rounded-md border border-border
                                 px-2 py-0.5 text-xs text-text-secondary"
                    >
                      You
                    </span>
                  )}
                </div>
              </td>

              <td
                className="max-w-64 break-all px-4 py-4
                           text-text-secondary"
              >
                {user.email}
              </td>

              <td className="px-4 py-4">
                {user.role}
              </td>

              <td className="px-4 py-4">
                <StatusBadge active={user.is_active} />
              </td>

              <td
                className="whitespace-nowrap px-4 py-4
                           text-text-secondary"
              >
                {formatBatchDate(user.created_at)}
              </td>

              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!user.is_active}
                    onClick={() => openAction("edit", user)}
                    aria-label={`Edit ${user.name}`}
                    title={
                      user.is_active
                        ? "Edit user"
                        : "Restore this account before editing"
                    }
                    className={actionClass}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4"
                    >
                      <path d="m16 4 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z" />
                    </svg>
                    Edit
                  </button>

                  {!isSelf && (
                    <button
                      type="button"
                      onClick={() =>
                        openAction(
                          user.is_active ? "deactivate" : "restore",
                          user
                        )
                      }
                      aria-label={`${
                        user.is_active ? "Deactivate" : "Restore"
                      } ${user.name}`}
                      className={`${actionClass} ${
                        user.is_active ? "text-danger" : "text-success"
                      }`}
                    >
                      {user.is_active ? "Deactivate" : "Restore"}
                    </button>
                  )}
                </div>

                {!user.is_active && (
                  <p className="mt-1 text-xs text-text-secondary">
                    Restore before editing.
                  </p>
                )}
              </td>
            </tr>
          );
        })}
      </CompactTable>

      {createOpen && (
        <CreateUserModal
          onClose={() => setCreateOpen(false)}
          onCreated={handleSuccess}
        />
      )}

      {selectedAction && (
        <UserActionModal
          key={`${selectedAction.action}-${selectedAction.user.user_id}`}
          action={selectedAction.action}
          user={selectedAction.user}
          onClose={() => setSelectedAction(null)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}