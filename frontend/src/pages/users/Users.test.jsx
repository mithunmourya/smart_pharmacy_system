
import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
} from "vitest";

import {
  render,
  screen,
  within,
  waitFor,
  act,
  fireEvent,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import Users from "./Users";
import useAuth from "../../hooks/useAuth";
import { getUsers } from "../../services/user.service";
import { formatBatchDate } from "../../utils/batch";

// =============================================
// MOCK DEPENDENCIES
// =============================================

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

vi.mock("../../services/user.service", () => ({
  getUsers: vi.fn(),
}));

// The modals are already tested separately.
// Here we test how Users opens and handles them.

vi.mock("./CreateUserModal", () => ({
  default: ({ onClose, onCreated }) => (
    <div
      role="dialog"
      aria-label="Create user modal"
    >
      <h2>Create user modal</h2>

      <button
        type="button"
        onClick={onClose}
      >
        Close creation
      </button>

      <button
        type="button"
        onClick={() =>
          onCreated("User created successfully.")
        }
      >
        Finish creation
      </button>
    </div>
  ),
}));

vi.mock("./UserActionModal", () => ({
  default: ({
    user,
    action,
    onClose,
    onSuccess,
  }) => (
    <div
      role="dialog"
      aria-label={`User ${action} ${user.user_id}`}
    >
      <p>Target user: {user.name}</p>
      <p>Selected action: {action}</p>

      <button
        type="button"
        onClick={onClose}
      >
        Close action
      </button>

      <button
        type="button"
        onClick={() =>
          onSuccess(`User ${action} completed.`)
        }
      >
        Finish action
      </button>
    </div>
  ),
}));

// Mock reusable presentation components.
// We keep filtering, sorting, loading and
// modal interaction logic inside Users real.

vi.mock("../../components/CompactInventoryUI", () => ({
  CompactHeader: ({
    title,
    description,
    summary,
    children,
  }) => (
    <header>
      <h1>{title}</h1>
      <p>{description}</p>
      <div>{summary}</div>
      {children}
    </header>
  ),

  SummaryBadge: ({ count, children }) => (
    <span>
      {count} {children}
    </span>
  ),

  StatusBadge: ({ active }) => (
    <span>
      {active ? "Active" : "Inactive"}
    </span>
  ),

  FilterField: ({
    id,
    label,
    children,
    type = "text",
    ...props
  }) => (
    <div>
      <label htmlFor={id}>{label}</label>

      {children ? (
        <select id={id} {...props}>
          {children}
        </select>
      ) : (
        <input
          id={id}
          type={type}
          {...props}
        />
      )}
    </div>
  ),

  CompactTable: ({
    title,
    columns,
    onSort,
    onReload,
    loading,
    error,
    count,
    hasFilters,
    onClearFilters,
    emptyMessage,
    children,
  }) => {
    if (loading) {
      return (
        <p role="status">Loading users...</p>
      );
    }

    if (error) {
      return (
        <section>
          <p role="alert">{error}</p>

          <button
            type="button"
            onClick={onReload}
          >
            Reload users
          </button>
        </section>
      );
    }

    return (
      <section>
        <button
          type="button"
          onClick={onReload}
        >
          Reload users
        </button>

        {hasFilters && (
          <button
            type="button"
            onClick={onClearFilters}
          >
            Clear filters
          </button>
        )}

        {count === 0 && (
          <p>
            {hasFilters
              ? "No matching users"
              : emptyMessage}
          </p>
        )}

        <table aria-label={title}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>
                  {column.sortable === false ? (
                    column.label
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        onSort(column.key)
                      }
                    >
                      {column.label}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>{children}</tbody>
        </table>
      </section>
    );
  },
}));

// =============================================
// TEST DATA
// =============================================

const currentUser = {
  user_id: 1,
  name: "Admin User",
  email: "admin@example.com",
  role: "Admin",
};

const users = [
  {
    user_id: 1,
    name: "Admin User",
    email: "admin@example.com",
    role: "Admin",
    is_active: true,
    created_at: "2026-03-01T10:00:00.000Z",
  },
  {
    user_id: 2,
    name: "Ravi Kumar",
    email: "ravi@example.com",
    role: "Pharmacist",
    is_active: true,
    created_at: "2026-01-15T10:00:00.000Z",
  },
  {
    user_id: 3,
    name: "Neha Jain",
    email: "neha@example.com",
    role: "Customer",
    is_active: false,
    created_at: "2026-02-10T10:00:00.000Z",
  },
  {
    user_id: 4,
    name: "Anita Patel",
    email: "anita@example.com",
    role: "Customer",
    is_active: true,
    created_at: "2026-04-01T10:00:00.000Z",
  },
  {
    user_id: 5,
    name: "Zoya Shah",
    email: "zoya@example.com",
    role: "Pharmacist",
    is_active: false,
    created_at: null,
  },
  {
    user_id: 6,
    name: "Bob 10",
    email: "bob10@example.com",
    role: "Customer",
    is_active: true,
    created_at: null,
  },
  {
    user_id: 7,
    name: "Bob 2",
    email: "bob2@example.com",
    role: "Customer",
    is_active: true,
    created_at: "2026-02-10T10:00:00.000Z",
  },
];

const mockRequest = vi.fn();

// =============================================
// HELPER FUNCTIONS
// =============================================

function renderUsers() {
  return render(<Users />);
}

async function waitForUsers() {
  await screen.findByText("7 total");
}

function table() {
  return screen.getByRole("table", {
    name: "Users list",
  });
}

function userRows() {
  return within(table())
    .getAllByRole("row")
    .slice(1);
}

function displayedNames() {
  return userRows().map((row) =>
    row.cells[0]
      .querySelector("span")
      .textContent.trim()
  );
}

function rowFor(name) {
  return userRows().find((row) =>
    within(row).queryByText(name, {
      exact: true,
    })
  );
}

function searchInput() {
  return screen.getByRole("searchbox", {
    name: "Search users",
  });
}

function roleFilter() {
  return screen.getByRole("combobox", {
    name: "Role",
  });
}

function statusFilter() {
  return screen.getByRole("combobox", {
    name: "Status",
  });
}

function sortButton(name) {
  return screen.getByRole("button", {
    name,
  });
}

function createButton() {
  return screen.getByRole("button", {
    name: "Create User",
  });
}

function reloadButton() {
  return screen.getByRole("button", {
    name: "Reload users",
  });
}

function deferred() {
  let resolve;

  const promise = new Promise((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

// =============================================
// USERS PAGE TESTS
// =============================================

describe("Users", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    useAuth.mockReturnValue({
      user: currentUser,
      authenticatedRequest: mockRequest,
    });

    getUsers.mockResolvedValue(users);
  });

  // ===========================================
  // 1. PAGE RENDER
  // ===========================================

  test("renders page title and description", async () => {
    renderUsers();

    expect(
      screen.getByRole("heading", {
        name: "Users",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Manage user accounts, contact details, and access status."
      )
    ).toBeInTheDocument();

    expect(createButton()).toBeInTheDocument();

    await waitForUsers();
  });

  // ===========================================
  // 2. AUTHENTICATED API REQUEST
  // ===========================================

  test("fetches users using authenticated request", async () => {
    renderUsers();

    await waitForUsers();

    expect(getUsers).toHaveBeenCalledWith(
      mockRequest
    );

    expect(getUsers).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 3. DISPLAY USER RECORDS
  // ===========================================

  test("displays all users returned by API", async () => {
    renderUsers();

    await waitForUsers();

    expect(userRows()).toHaveLength(7);

    expect(
      screen.getByText("Ravi Kumar")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Neha Jain")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Anita Patel")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 4. USER SUMMARY
  // ===========================================

  test("shows total, active and inactive user counts", async () => {
    renderUsers();

    await waitForUsers();

    expect(
      screen.getByText("7 total")
    ).toBeInTheDocument();

    expect(
      screen.getByText("5 active")
    ).toBeInTheDocument();

    expect(
      screen.getByText("2 inactive")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 5. HIDE ZERO INACTIVE SUMMARY
  // ===========================================

  test("hides inactive summary when all users are active", async () => {
    getUsers.mockResolvedValue(
      users.filter((user) => user.is_active)
    );

    renderUsers();

    expect(
      await screen.findByText("5 total")
    ).toBeInTheDocument();

    expect(
      screen.getByText("5 active")
    ).toBeInTheDocument();

    expect(
      screen.queryByText("0 inactive")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 6. INITIAL LOADING
  // ===========================================

  test("shows loading state while fetching users", async () => {
    const request = deferred();

    getUsers.mockReturnValue(request.promise);

    renderUsers();

    expect(
      screen.getByText("Loading users...")
    ).toBeInTheDocument();

    expect(
      screen.queryByText("7 total")
    ).not.toBeInTheDocument();

    await act(async () => {
      request.resolve(users);
    });

    expect(
      screen.getByText("7 total")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 7. EMPTY USER LIST
  // ===========================================

  test("shows empty state when no users exist", async () => {
    getUsers.mockResolvedValue([]);

    renderUsers();

    expect(
      await screen.findByText(
        "Use Create User to add an account."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByText("0 total")
    ).toBeInTheDocument();

    expect(userRows()).toHaveLength(0);
  });

  // ===========================================
  // 8. API ERROR
  // ===========================================

  test("shows API error when users fail to load", async () => {
    getUsers.mockRejectedValue(
      new Error("Network error")
    );

    renderUsers();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Network error");
  });

  // ===========================================
  // 9. FALLBACK ERROR
  // ===========================================

  test("shows fallback error message", async () => {
    getUsers.mockRejectedValue(
      new Error("")
    );

    renderUsers();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to load users. Please try again."
    );
  });

  // ===========================================
  // 10. RETRY AFTER ERROR
  // ===========================================

  test("reloads users after an API error", async () => {
    const user = userEvent.setup();

    getUsers
      .mockRejectedValueOnce(
        new Error("Server unavailable")
      )
      .mockResolvedValueOnce(users);

    renderUsers();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Server unavailable"
    );

    await user.click(reloadButton());

    await waitForUsers();

    expect(getUsers).toHaveBeenCalledTimes(2);

    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 11. MANUAL RELOAD
  // ===========================================

  test("reloads users when refresh is clicked", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.click(reloadButton());

    await waitFor(() => {
      expect(getUsers).toHaveBeenCalledTimes(2);
    });

    expect(userRows()).toHaveLength(7);
  });

  // ===========================================
  // 12. DISPLAY UPDATED DATA AFTER RELOAD
  // ===========================================

  test("displays updated users after reloading", async () => {
    const user = userEvent.setup();

    const newUser = {
      user_id: 8,
      name: "New Customer",
      email: "new@example.com",
      role: "Customer",
      is_active: true,
      created_at: "2026-05-01T10:00:00.000Z",
    };

    getUsers
      .mockResolvedValueOnce(users)
      .mockResolvedValueOnce([
        ...users,
        newUser,
      ]);

    renderUsers();
    await waitForUsers();

    await user.click(reloadButton());

    expect(
      await screen.findByText("8 total")
    ).toBeInTheDocument();

    expect(
      screen.getByText("6 active")
    ).toBeInTheDocument();

    expect(
      screen.getByText("New Customer")
    ).toBeInTheDocument();

    expect(userRows()).toHaveLength(8);
  });

  // ===========================================
  // 13. SEARCH BY NAME
  // ===========================================

  test("searches users by name without case sensitivity", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.type(
      searchInput(),
      "RAVI"
    );

    expect(displayedNames()).toEqual([
      "Ravi Kumar",
    ]);
  });

  // ===========================================
  // 14. SEARCH BY EMAIL
  // ===========================================

  test("searches users by email address", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.type(
      searchInput(),
      "anita@example.com"
    );

    expect(displayedNames()).toEqual([
      "Anita Patel",
    ]);
  });

  // ===========================================
  // 15. TRIM SEARCH
  // ===========================================

  test("ignores leading and trailing search spaces", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.type(
      searchInput(),
      "  NEHA  "
    );

    expect(displayedNames()).toEqual([
      "Neha Jain",
    ]);
  });

  // ===========================================
  // 16. NO SEARCH MATCHES
  // ===========================================

  test("shows empty filtered state when search has no matches", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.type(
      searchInput(),
      "Unknown person"
    );

    expect(displayedNames()).toEqual([]);

    expect(
      screen.getByText("No matching users")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 17-19. FILTER BY ROLE
  // ===========================================

  test.each([
    ["Admin", ["Admin User"]],
    [
      "Pharmacist",
      ["Ravi Kumar", "Zoya Shah"],
    ],
    [
      "Customer",
      [
        "Anita Patel",
        "Bob 2",
        "Bob 10",
        "Neha Jain",
      ],
    ],
  ])(
    "filters users by %s role",
    async (role, expectedNames) => {
      const user = userEvent.setup();

      renderUsers();
      await waitForUsers();

      await user.selectOptions(
        roleFilter(),
        role
      );

      expect(displayedNames()).toEqual(
        expectedNames
      );
    }
  );

  // ===========================================
  // 20-21. FILTER BY ACCOUNT STATUS
  // ===========================================

  test.each([
    [
      "Active",
      [
        "Admin User",
        "Anita Patel",
        "Bob 2",
        "Bob 10",
        "Ravi Kumar",
      ],
    ],
    [
      "Inactive",
      [
        "Neha Jain",
        "Zoya Shah",
      ],
    ],
  ])(
    "filters users by %s status",
    async (status, expectedNames) => {
      const user = userEvent.setup();

      renderUsers();
      await waitForUsers();

      await user.selectOptions(
        statusFilter(),
        status
      );

      expect(displayedNames()).toEqual(
        expectedNames
      );
    }
  );

  // ===========================================
  // 22. COMBINE ROLE AND STATUS
  // ===========================================

  test("combines role and status filters", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.selectOptions(
      roleFilter(),
      "Pharmacist"
    );

    await user.selectOptions(
      statusFilter(),
      "Inactive"
    );

    expect(displayedNames()).toEqual([
      "Zoya Shah",
    ]);
  });

  // ===========================================
  // 23. COMBINE ALL THREE FILTERS
  // ===========================================

  test("combines search, role and status filters", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.type(
      searchInput(),
      "zoya"
    );

    await user.selectOptions(
      roleFilter(),
      "Pharmacist"
    );

    await user.selectOptions(
      statusFilter(),
      "Inactive"
    );

    expect(displayedNames()).toEqual([
      "Zoya Shah",
    ]);

    expect(getUsers).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 24. CLEAR FILTERS
  // ===========================================

  test("clears search, role and status filters", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.type(
      searchInput(),
      "zoya"
    );

    await user.selectOptions(
      roleFilter(),
      "Pharmacist"
    );

    await user.selectOptions(
      statusFilter(),
      "Inactive"
    );

    expect(displayedNames()).toEqual([
      "Zoya Shah",
    ]);

    await user.click(
      screen.getByRole("button", {
        name: "Clear filters",
      })
    );

    expect(searchInput()).toHaveValue("");

    expect(roleFilter()).toHaveValue("All");

    expect(statusFilter()).toHaveValue("All");

    expect(displayedNames()).toHaveLength(7);
  });

  // ===========================================
  // 25. FILTERING WITHOUT API CALL
  // ===========================================

  test("filters users locally without refetching", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.type(
      searchInput(),
      "ravi"
    );

    await user.selectOptions(
      roleFilter(),
      "Pharmacist"
    );

    await user.selectOptions(
      statusFilter(),
      "Active"
    );

    expect(displayedNames()).toEqual([
      "Ravi Kumar",
    ]);

    expect(getUsers).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 26. DEFAULT NAME SORTING
  // ===========================================

  test("sorts users by name ascending by default", async () => {
    renderUsers();
    await waitForUsers();

    expect(displayedNames()).toEqual([
      "Admin User",
      "Anita Patel",
      "Bob 2",
      "Bob 10",
      "Neha Jain",
      "Ravi Kumar",
      "Zoya Shah",
    ]);
  });

  // ===========================================
  // 27. TOGGLE NAME SORTING
  // ===========================================

  test("toggles name sorting direction", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    // First click: descending
    await user.click(sortButton("Name"));

    expect(displayedNames()).toEqual([
      "Zoya Shah",
      "Ravi Kumar",
      "Neha Jain",
      "Bob 10",
      "Bob 2",
      "Anita Patel",
      "Admin User",
    ]);

    // Second click: ascending
    await user.click(sortButton("Name"));

    expect(displayedNames()).toEqual([
      "Admin User",
      "Anita Patel",
      "Bob 2",
      "Bob 10",
      "Neha Jain",
      "Ravi Kumar",
      "Zoya Shah",
    ]);
  });

  // ===========================================
  // 28. SORT BY EMAIL
  // ===========================================

  test("sorts users alphabetically by email", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.click(sortButton("Email"));

    expect(displayedNames()).toEqual([
      "Admin User",
      "Anita Patel",
      "Bob 2",
      "Bob 10",
      "Neha Jain",
      "Ravi Kumar",
      "Zoya Shah",
    ]);
  });

  // ===========================================
  // 29. SORT BY ROLE
  // ===========================================

  test("sorts users by role alphabetically", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.click(sortButton("Role"));

    expect(displayedNames()).toEqual([
      "Admin User",
      "Anita Patel",
      "Bob 2",
      "Bob 10",
      "Neha Jain",
      "Ravi Kumar",
      "Zoya Shah",
    ]);
  });

  // ===========================================
  // 30. SORT BY CREATION DATE
  // ===========================================

  test("sorts users by creation date", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    // Ascending
    await user.click(sortButton("Created"));

    expect(displayedNames()).toEqual([
      "Ravi Kumar",
      "Bob 2",
      "Neha Jain",
      "Admin User",
      "Anita Patel",
      "Bob 10",
      "Zoya Shah",
    ]);

    // Descending
    await user.click(sortButton("Created"));

    expect(displayedNames()).toEqual([
      "Anita Patel",
      "Admin User",
      "Bob 2",
      "Neha Jain",
      "Ravi Kumar",
      "Bob 10",
      "Zoya Shah",
    ]);
  });

  // ===========================================
  // 31. MISSING DATES ALWAYS LAST
  // ===========================================

  test("keeps missing creation dates at bottom in both directions", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.click(sortButton("Created"));

    expect(displayedNames().slice(-2)).toEqual([
      "Bob 10",
      "Zoya Shah",
    ]);

    await user.click(sortButton("Created"));

    expect(displayedNames().slice(-2)).toEqual([
      "Bob 10",
      "Zoya Shah",
    ]);
  });

  // ===========================================
  // 32. NATURAL NUMERIC SORTING
  // ===========================================

  test("sorts names with numbers naturally", async () => {
    renderUsers();
    await waitForUsers();

    const names = displayedNames();

    expect(
      names.indexOf("Bob 2")
    ).toBeLessThan(
      names.indexOf("Bob 10")
    );
  });

  // ===========================================
  // 33. CREATED DATE DISPLAY
  // ===========================================

  test("formats user creation dates", async () => {
    renderUsers();
    await waitForUsers();

    const raviRow = rowFor("Ravi Kumar");

    expect(raviRow.cells[4]).toHaveTextContent(
      formatBatchDate(
        "2026-01-15T10:00:00.000Z"
      )
    );
  });

  // ===========================================
  // 34. ACTIVE AND INACTIVE BADGES
  // ===========================================

  test("shows correct account status for each user", async () => {
    renderUsers();
    await waitForUsers();

    expect(
      rowFor("Ravi Kumar").cells[3]
    ).toHaveTextContent("Active");

    expect(
      rowFor("Neha Jain").cells[3]
    ).toHaveTextContent("Inactive");
  });

  // ===========================================
  // 35. CURRENT USER IDENTIFICATION
  // ===========================================

  test("identifies the signed-in user with You label", async () => {
    renderUsers();
    await waitForUsers();

    expect(
      rowFor("Admin User")
    ).toHaveTextContent("You");

    expect(
      rowFor("Ravi Kumar")
    ).not.toHaveTextContent("You");
  });

  // ===========================================
  // 36. SELF-DEACTIVATION PROTECTION
  // ===========================================

  test("does not show deactivate action for own account", async () => {
    renderUsers();
    await waitForUsers();

    expect(
      within(rowFor("Admin User"))
        .queryByRole("button", {
          name: "Deactivate Admin User",
        })
    ).not.toBeInTheDocument();

    expect(
      within(rowFor("Admin User"))
        .getByRole("button", {
          name: "Edit Admin User",
        })
    ).toBeEnabled();
  });

  // ===========================================
  // 37. SELF ID TYPE NORMALIZATION
  // ===========================================

  test("recognizes current user when ID is a string", async () => {
    getUsers.mockResolvedValue([
      {
        ...users[0],
        user_id: "1",
      },
    ]);

    renderUsers();

    expect(
      await screen.findByText("1 total")
    ).toBeInTheDocument();

    expect(
      rowFor("Admin User")
    ).toHaveTextContent("You");

    expect(
      within(rowFor("Admin User"))
        .queryByRole("button", {
          name: "Deactivate Admin User",
        })
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 38. INACTIVE USER EDIT PROTECTION
  // ===========================================

  test("disables Edit for inactive users", async () => {
    renderUsers();
    await waitForUsers();

    expect(
      screen.getByRole("button", {
        name: "Edit Neha Jain",
      })
    ).toBeDisabled();

    expect(
      rowFor("Neha Jain")
    ).toHaveTextContent(
      "Restore before editing."
    );
  });

  // ===========================================
  // 39. ACTIVE USER ACTIONS
  // ===========================================

  test("allows editing and deactivating active users", async () => {
    renderUsers();
    await waitForUsers();

    expect(
      screen.getByRole("button", {
        name: "Edit Ravi Kumar",
      })
    ).toBeEnabled();

    expect(
      screen.getByRole("button", {
        name: "Deactivate Ravi Kumar",
      })
    ).toBeEnabled();
  });

  // ===========================================
  // 40. INACTIVE USER RESTORE ACTION
  // ===========================================

  test("offers Restore for inactive users", async () => {
    renderUsers();
    await waitForUsers();

    expect(
      screen.getByRole("button", {
        name: "Restore Neha Jain",
      })
    ).toBeEnabled();

    expect(
      screen.queryByRole("button", {
        name: "Deactivate Neha Jain",
      })
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 41. OPEN CREATE USER MODAL
  // ===========================================

  test("opens CreateUserModal", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.click(createButton());

    expect(
      screen.getByRole("dialog", {
        name: "Create user modal",
      })
    ).toBeInTheDocument();

    expect(getUsers).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 42. CLOSE CREATE USER MODAL
  // ===========================================

  test("closes CreateUserModal without refreshing", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.click(createButton());

    await user.click(
      screen.getByRole("button", {
        name: "Close creation",
      })
    );

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    expect(getUsers).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 43. CREATE USER SUCCESS
  // ===========================================

  test("shows success notice and refreshes after user creation", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.click(createButton());

    await user.click(
      screen.getByRole("button", {
        name: "Finish creation",
      })
    );

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    expect(
      screen.getByText(
        "User created successfully."
      )
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(getUsers).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================
  // 44. OPEN EDIT MODAL
  // ===========================================

  test("opens edit modal for selected user", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.click(
      screen.getByRole("button", {
        name: "Edit Ravi Kumar",
      })
    );

    expect(
      screen.getByRole("dialog", {
        name: "User edit 2",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText("Target user: Ravi Kumar")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Selected action: edit")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 45. CLOSE EDIT MODAL
  // ===========================================

  test("closes edit modal without refreshing", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.click(
      screen.getByRole("button", {
        name: "Edit Ravi Kumar",
      })
    );

    await user.click(
      screen.getByRole("button", {
        name: "Close action",
      })
    );

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    expect(getUsers).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 46. EDIT USER SUCCESS
  // ===========================================

  test("handles successful user editing", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.click(
      screen.getByRole("button", {
        name: "Edit Ravi Kumar",
      })
    );

    await user.click(
      screen.getByRole("button", {
        name: "Finish action",
      })
    );

    expect(
      screen.getByText(
        "User edit completed."
      )
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(getUsers).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================
  // 47. OPEN DEACTIVATE MODAL
  // ===========================================

  test("opens deactivation modal for active user", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.click(
      screen.getByRole("button", {
        name: "Deactivate Ravi Kumar",
      })
    );

    expect(
      screen.getByRole("dialog", {
        name: "User deactivate 2",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Selected action: deactivate"
      )
    ).toBeInTheDocument();
  });

  // ===========================================
  // 48. OPEN RESTORE MODAL
  // ===========================================

  test("opens restoration modal for inactive user", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.click(
      screen.getByRole("button", {
        name: "Restore Neha Jain",
      })
    );

    expect(
      screen.getByRole("dialog", {
        name: "User restore 3",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText("Target user: Neha Jain")
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Selected action: restore"
      )
    ).toBeInTheDocument();
  });

  // ===========================================
  // 49. DEACTIVATE SUCCESS
  // ===========================================

  test("refreshes users after successful deactivation", async () => {
    const user = userEvent.setup();

    const updatedUsers = users.map((item) =>
      item.user_id === 2
        ? { ...item, is_active: false }
        : item
    );

    getUsers
      .mockResolvedValueOnce(users)
      .mockResolvedValueOnce(updatedUsers);

    renderUsers();
    await waitForUsers();

    await user.click(
      screen.getByRole("button", {
        name: "Deactivate Ravi Kumar",
      })
    );

    await user.click(
      screen.getByRole("button", {
        name: "Finish action",
      })
    );

    expect(
      screen.getByText(
        "User deactivate completed."
      )
    ).toBeInTheDocument();

    expect(
      await screen.findByText("4 active")
    ).toBeInTheDocument();

    expect(
      screen.getByText("3 inactive")
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Restore Ravi Kumar",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Edit Ravi Kumar",
      })
    ).toBeDisabled();
  });

  // ===========================================
  // 50. RESTORE SUCCESS
  // ===========================================

  test("refreshes users after successful restoration", async () => {
    const user = userEvent.setup();

    const updatedUsers = users.map((item) =>
      item.user_id === 3
        ? { ...item, is_active: true }
        : item
    );

    getUsers
      .mockResolvedValueOnce(users)
      .mockResolvedValueOnce(updatedUsers);

    renderUsers();
    await waitForUsers();

    await user.click(
      screen.getByRole("button", {
        name: "Restore Neha Jain",
      })
    );

    await user.click(
      screen.getByRole("button", {
        name: "Finish action",
      })
    );

    expect(
      screen.getByText(
        "User restore completed."
      )
    ).toBeInTheDocument();

    expect(
      await screen.findByText("6 active")
    ).toBeInTheDocument();

    expect(
      screen.getByText("1 inactive")
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Edit Neha Jain",
      })
    ).toBeEnabled();

    expect(
      screen.getByRole("button", {
        name: "Deactivate Neha Jain",
      })
    ).toBeInTheDocument();
  });

  // ===========================================
  // 51. CLEAR PREVIOUS SUCCESS NOTICE
  // ===========================================

  test("clears previous notice when opening another action", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    // Complete first action.
    await user.click(
      screen.getByRole("button", {
        name: "Edit Ravi Kumar",
      })
    );

    await user.click(
      screen.getByRole("button", {
        name: "Finish action",
      })
    );

    expect(
      screen.getByText("User edit completed.")
    ).toBeInTheDocument();

    // Start another action.
    await user.click(
      screen.getByRole("button", {
        name: "Edit Anita Patel",
      })
    );

    expect(
      screen.queryByText("User edit completed.")
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("dialog", {
        name: "User edit 4",
      })
    ).toBeInTheDocument();
  });

  // ===========================================
  // 52. CLEAR NOTICE WHEN CREATING
  // ===========================================

  test("clears previous notice when opening Create User", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.click(
      screen.getByRole("button", {
        name: "Edit Ravi Kumar",
      })
    );

    await user.click(
      screen.getByRole("button", {
        name: "Finish action",
      })
    );

    expect(
      screen.getByText("User edit completed.")
    ).toBeInTheDocument();

    await user.click(createButton());

    expect(
      screen.queryByText("User edit completed.")
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("dialog", {
        name: "Create user modal",
      })
    ).toBeInTheDocument();
  });

  // ===========================================
  // 53. FILTERS PERSIST AFTER REFRESH
  // ===========================================

  test("preserves filters when users are reloaded", async () => {
    const user = userEvent.setup();

    renderUsers();
    await waitForUsers();

    await user.type(
      searchInput(),
      "ravi"
    );

    await user.selectOptions(
      roleFilter(),
      "Pharmacist"
    );

    await user.selectOptions(
      statusFilter(),
      "Active"
    );

    expect(displayedNames()).toEqual([
      "Ravi Kumar",
    ]);

    await user.click(reloadButton());

    await waitFor(() => {
      expect(getUsers).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(displayedNames()).toEqual([
        "Ravi Kumar",
      ]);
    });

    expect(searchInput()).toHaveValue("ravi");
    expect(roleFilter()).toHaveValue("Pharmacist");
    expect(statusFilter()).toHaveValue("Active");
  });

  // ===========================================
  // 54. IGNORE STALE API RESPONSES
  // ===========================================

  test("ignores outdated response after authenticated request changes", async () => {
    const firstRequest = vi.fn();
    const secondRequest = vi.fn();

    const oldResponse = deferred();

    const newerUsers = [
      {
        user_id: 99,
        name: "New Session User",
        email: "session@example.com",
        role: "Customer",
        is_active: true,
        created_at: "2026-05-01T10:00:00.000Z",
      },
    ];

    getUsers.mockImplementation((request) => {
      if (request === firstRequest) {
        return oldResponse.promise;
      }

      return Promise.resolve(newerUsers);
    });

    useAuth.mockReturnValue({
      user: currentUser,
      authenticatedRequest: firstRequest,
    });

    const { rerender } = renderUsers();

    expect(
      screen.getByText("Loading users...")
    ).toBeInTheDocument();

    // Switch authenticated request.
    useAuth.mockReturnValue({
      user: currentUser,
      authenticatedRequest: secondRequest,
    });

    rerender(<Users />);

    // New response completes first.
    expect(
      await screen.findByText("1 total")
    ).toBeInTheDocument();

    expect(displayedNames()).toEqual([
      "New Session User",
    ]);

    // Old response completes afterward.
    await act(async () => {
      oldResponse.resolve(users);
    });

    // Old data must not overwrite new data.
    expect(displayedNames()).toEqual([
      "New Session User",
    ]);

    expect(
      screen.getByText("1 total")
    ).toBeInTheDocument();

    expect(getUsers).toHaveBeenCalledTimes(2);
  });
});
