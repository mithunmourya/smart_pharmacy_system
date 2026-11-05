
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
  waitFor,
  act,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import Manufacturers from "./Manufacturers";
import useAuth from "../../hooks/useAuth";
import { getManufacturers } from "../../services/manufacturer.service";

// =============================================
// MOCK DEPENDENCIES
// =============================================

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

vi.mock("../../services/manufacturer.service", () => ({
  getManufacturers: vi.fn(),
}));

// Mock ManufacturerModal.
// We already tested its real behavior separately.
vi.mock("./ManufacturerModal", () => ({
  default: ({
    action,
    manufacturer,
    onClose,
    onSuccess,
  }) => (
    <div
      role="dialog"
      aria-label={`${action} manufacturer`}
    >
      <p>{manufacturer?.name ?? "New manufacturer"}</p>

      <button type="button" onClick={onClose}>
        Close modal
      </button>

      <button
        type="button"
        onClick={() =>
          onSuccess("Manufacturer saved successfully.")
        }
      >
        Simulate save
      </button>
    </div>
  ),
}));

// Mock shared UI components.
// This lets us focus on Manufacturers.jsx logic.
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
    <span>{active ? "Active" : "Inactive"}</span>
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
        <input id={id} type={type} {...props} />
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
      return <p role="status">Loading manufacturers...</p>;
    }

    if (error) {
      return (
        <section>
          <p role="alert">{error}</p>

          <button type="button" onClick={onReload}>
            Reload manufacturers
          </button>
        </section>
      );
    }

    return (
      <section>
        <button type="button" onClick={onReload}>
          Reload manufacturers
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
              ? "No matching manufacturers"
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
                      onClick={() => onSort(column.key)}
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

const manufacturers = [
  {
    manufacturer_id: 1,
    name: "Acme Labs",
    is_active: true,
    created_at: "2026-02-01T10:00:00.000Z",
  },
  {
    manufacturer_id: 2,
    name: "Zen Pharma",
    is_active: true,
    created_at: "2026-01-01T10:00:00.000Z",
  },
  {
    manufacturer_id: 3,
    name: "Beta Med",
    is_active: false,
    created_at: "2026-03-01T10:00:00.000Z",
  },
  {
    manufacturer_id: 4,
    name: "Alpha Health",
    is_active: true,
    created_at: "2026-04-01T10:00:00.000Z",
  },
];

const mockRequest = vi.fn();

// =============================================
// TEST HELPERS
// =============================================

function renderManufacturers(role = "Admin") {
  useAuth.mockReturnValue({
    user: role ? { user_id: 1, role } : null,
    authenticatedRequest: mockRequest,
  });

  return render(<Manufacturers />);
}

async function waitForManufacturers() {
  await screen.findByText("4 total");
}

function displayedNames() {
  const table = screen.getByRole("table");

  return Array.from(
    table.querySelectorAll("tbody tr")
  ).map((row) => row.cells[0].textContent.trim());
}

// =============================================
// MANUFACTURERS PAGE TESTS
// =============================================

describe("Manufacturers Page", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    getManufacturers.mockResolvedValue(manufacturers);
  });

  // ===========================================
  // 1. INITIAL LOADING
  // ===========================================

  test("should display loading state", async () => {
    // Arrange
    let resolveRequest;

    getManufacturers.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );

    // Act
    renderManufacturers();

    // Assert
    expect(
      screen.getByText("Loading manufacturers...")
    ).toBeInTheDocument();

    await act(async () => {
      resolveRequest(manufacturers);
    });

    expect(
      screen.getByText("4 total")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 2. LOAD MANUFACTURERS
  // ===========================================

  test("should load and display manufacturers", async () => {
    // Arrange & Act
    renderManufacturers();

    await waitForManufacturers();

    // Assert
    expect(getManufacturers).toHaveBeenCalledWith(
      mockRequest
    );

    expect(displayedNames()).toEqual([
      "Acme Labs",
      "Alpha Health",
      "Beta Med",
      "Zen Pharma",
    ]);
  });

  // ===========================================
  // 3. SUMMARY COUNTS
  // ===========================================

  test("should show total, active and inactive counts", async () => {
    renderManufacturers();

    await waitForManufacturers();

    expect(
      screen.getByText("4 total")
    ).toBeInTheDocument();

    expect(
      screen.getByText("3 active")
    ).toBeInTheDocument();

    expect(
      screen.getByText("1 inactive")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 4. EMPTY LIST
  // ===========================================

  test("should display empty message when no manufacturers exist", async () => {
    // Arrange
    getManufacturers.mockResolvedValue([]);

    // Act
    renderManufacturers();

    // Assert
    expect(
      await screen.findByText(
        "Manufacturers will appear here once added."
      )
    ).toBeInTheDocument();

    expect(displayedNames()).toEqual([]);

    expect(
      screen.getByText("0 total")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 5. API ERROR
  // ===========================================

  test("should display API error when loading fails", async () => {
    // Arrange
    getManufacturers.mockRejectedValue(
      new Error("Network error")
    );

    // Act
    renderManufacturers();

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Network error");
  });

  // ===========================================
  // 6. FALLBACK ERROR
  // ===========================================

  test("should display fallback error message", async () => {
    // Arrange
    getManufacturers.mockRejectedValue(
      new Error("")
    );

    // Act
    renderManufacturers();

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to load manufacturers."
    );
  });

  // ===========================================
  // 7. RETRY AFTER ERROR
  // ===========================================

  test("should retry loading manufacturers after failure", async () => {
    // Arrange
    const user = userEvent.setup();

    getManufacturers
      .mockRejectedValueOnce(new Error("Server unavailable"))
      .mockResolvedValueOnce(manufacturers);

    renderManufacturers();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Server unavailable");

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Reload manufacturers",
      })
    );

    // Assert
    await waitForManufacturers();

    expect(getManufacturers).toHaveBeenCalledTimes(2);

    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 8. SEARCH BY NAME
  // ===========================================

  test("should search manufacturers by name", async () => {
    // Arrange
    const user = userEvent.setup();

    renderManufacturers();
    await waitForManufacturers();

    // Act
    await user.type(
      screen.getByRole("searchbox", {
        name: "Search manufacturers",
      }),
      "Acme"
    );

    // Assert
    expect(displayedNames()).toEqual([
      "Acme Labs",
    ]);
  });

  // ===========================================
  // 9. CASE INSENSITIVE SEARCH
  // ===========================================

  test("should search without case sensitivity", async () => {
    const user = userEvent.setup();

    renderManufacturers();
    await waitForManufacturers();

    // Act
    await user.type(
      screen.getByRole("searchbox", {
        name: "Search manufacturers",
      }),
      "  ZEN  "
    );

    // Assert
    expect(displayedNames()).toEqual([
      "Zen Pharma",
    ]);
  });

  // ===========================================
  // 10. SEARCH WITH NO RESULTS
  // ===========================================

  test("should show message when search has no results", async () => {
    const user = userEvent.setup();

    renderManufacturers();
    await waitForManufacturers();

    // Act
    await user.type(
      screen.getByRole("searchbox", {
        name: "Search manufacturers",
      }),
      "Unknown manufacturer"
    );

    // Assert
    expect(displayedNames()).toEqual([]);

    expect(
      screen.getByText("No matching manufacturers")
    ).toBeInTheDocument();

    expect(
      screen.getByText("4 total")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 11-12. STATUS FILTER
  // ===========================================

  test.each([
    [
      "Active",
      ["Acme Labs", "Alpha Health", "Zen Pharma"],
    ],
    [
      "Inactive",
      ["Beta Med"],
    ],
  ])(
    "should filter manufacturers with %s status",
    async (status, expectedNames) => {
      // Arrange
      const user = userEvent.setup();

      renderManufacturers();
      await waitForManufacturers();

      // Act
      await user.selectOptions(
        screen.getByRole("combobox", {
          name: "Status",
        }),
        status
      );

      // Assert
      expect(displayedNames()).toEqual(expectedNames);
    }
  );

  // ===========================================
  // 13. COMBINED SEARCH + STATUS FILTER
  // ===========================================

  test("should combine search and status filter", async () => {
    const user = userEvent.setup();

    renderManufacturers();
    await waitForManufacturers();

    // Act
    await user.type(
      screen.getByRole("searchbox", {
        name: "Search manufacturers",
      }),
      "alpha"
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Status",
      }),
      "Active"
    );

    // Assert
    expect(displayedNames()).toEqual([
      "Alpha Health",
    ]);
  });

  // ===========================================
  // 14. CLEAR FILTERS
  // ===========================================

  test("should clear search and status filters", async () => {
    const user = userEvent.setup();

    renderManufacturers();
    await waitForManufacturers();

    // Arrange
    await user.type(
      screen.getByRole("searchbox", {
        name: "Search manufacturers",
      }),
      "beta"
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Status",
      }),
      "Inactive"
    );

    expect(displayedNames()).toEqual([
      "Beta Med",
    ]);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Clear filters",
      })
    );

    // Assert
    expect(
      screen.getByRole("searchbox", {
        name: "Search manufacturers",
      })
    ).toHaveValue("");

    expect(
      screen.getByRole("combobox", {
        name: "Status",
      })
    ).toHaveValue("All");

    expect(displayedNames()).toHaveLength(4);
  });

  // ===========================================
  // 15. DEFAULT NAME SORTING
  // ===========================================

  test("should sort names alphabetically by default", async () => {
    renderManufacturers();
    await waitForManufacturers();

    expect(displayedNames()).toEqual([
      "Acme Labs",
      "Alpha Health",
      "Beta Med",
      "Zen Pharma",
    ]);
  });

  // ===========================================
  // 16. DESCENDING NAME SORTING
  // ===========================================

  test("should reverse name sort when clicked", async () => {
    const user = userEvent.setup();

    renderManufacturers();
    await waitForManufacturers();

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Manufacturer name",
      })
    );

    // Assert
    expect(displayedNames()).toEqual([
      "Zen Pharma",
      "Beta Med",
      "Alpha Health",
      "Acme Labs",
    ]);
  });

  // ===========================================
  // 17. SORT BY CREATED DATE
  // ===========================================

  test("should sort manufacturers by creation date", async () => {
    const user = userEvent.setup();

    renderManufacturers();
    await waitForManufacturers();

    // Act: Ascending date
    await user.click(
      screen.getByRole("button", {
        name: "Created",
      })
    );

    // Assert
    expect(displayedNames()).toEqual([
      "Zen Pharma",
      "Acme Labs",
      "Beta Med",
      "Alpha Health",
    ]);

    // Act: Descending date
    await user.click(
      screen.getByRole("button", {
        name: "Created",
      })
    );

    // Assert
    expect(displayedNames()).toEqual([
      "Alpha Health",
      "Beta Med",
      "Acme Labs",
      "Zen Pharma",
    ]);
  });

  // ===========================================
  // 18-20. ROLE RESTRICTIONS
  // ===========================================

  test.each([
    "Pharmacist",
    "Customer",
    null,
  ])(
    "should hide management actions for role %s",
    async (role) => {
      // Arrange
      renderManufacturers(role);
      await waitForManufacturers();

      // Assert
      expect(
        screen.queryByRole("button", {
          name: "Add Manufacturer",
        })
      ).not.toBeInTheDocument();

      expect(
        screen.queryByRole("button", {
          name: "Edit Acme Labs",
        })
      ).not.toBeInTheDocument();

      // Viewing the list is still allowed
      // at this component level.
      expect(displayedNames()).toHaveLength(4);
    }
  );

  // ===========================================
  // 21. ADMIN CREATE ACTION
  // ===========================================

  test("should open create modal for Admin", async () => {
    const user = userEvent.setup();

    renderManufacturers();
    await waitForManufacturers();

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Add Manufacturer",
      })
    );

    // Assert
    expect(
      screen.getByRole("dialog", {
        name: "create manufacturer",
      })
    ).toHaveTextContent("New manufacturer");
  });

  // ===========================================
  // 22. ADMIN EDIT ACTION
  // ===========================================

  test("should open edit modal for active manufacturer", async () => {
    const user = userEvent.setup();

    renderManufacturers();
    await waitForManufacturers();

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Edit Acme Labs",
      })
    );

    // Assert
    expect(
      screen.getByRole("dialog", {
        name: "edit manufacturer",
      })
    ).toHaveTextContent("Acme Labs");
  });

  // ===========================================
  // 23. DEACTIVATE ACTION
  // ===========================================

  test("should open deactivate confirmation for active manufacturer", async () => {
    const user = userEvent.setup();

    renderManufacturers();
    await waitForManufacturers();

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Deactivate Acme Labs",
      })
    );

    // Assert
    expect(
      screen.getByRole("dialog", {
        name: "deactivate manufacturer",
      })
    ).toHaveTextContent("Acme Labs");
  });

  // ===========================================
  // 24. INACTIVE MANUFACTURER ACTIONS
  // ===========================================

  test("should disable edit and allow restore for inactive manufacturer", async () => {
    const user = userEvent.setup();

    renderManufacturers();
    await waitForManufacturers();

    // Assert
    expect(
      screen.getByRole("button", {
        name: "Edit Beta Med",
      })
    ).toBeDisabled();

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Restore Beta Med",
      })
    );

    // Assert
    expect(
      screen.getByRole("dialog", {
        name: "restore manufacturer",
      })
    ).toHaveTextContent("Beta Med");
  });

  // ===========================================
  // 25. CLOSE MODAL
  // ===========================================

  test("should close modal without reloading on Cancel", async () => {
    const user = userEvent.setup();

    renderManufacturers();
    await waitForManufacturers();

    // Arrange
    await user.click(
      screen.getByRole("button", {
        name: "Add Manufacturer",
      })
    );

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Close modal",
      })
    );

    // Assert
    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    expect(getManufacturers).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 26. RELOAD AFTER SUCCESS
  // ===========================================

  test("should show success notice and reload manufacturers after save", async () => {
    const user = userEvent.setup();

    const newManufacturer = {
      manufacturer_id: 5,
      name: "New Pharma",
      is_active: true,
      created_at: "2026-05-01T10:00:00.000Z",
    };

    // Arrange
    getManufacturers
      .mockResolvedValueOnce(manufacturers)
      .mockResolvedValueOnce([
        ...manufacturers,
        newManufacturer,
      ]);

    renderManufacturers();
    await waitForManufacturers();

    await user.click(
      screen.getByRole("button", {
        name: "Add Manufacturer",
      })
    );

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Simulate save",
      })
    );

    // Assert
    expect(
      screen.queryByRole("dialog")
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("status")
    ).toHaveTextContent(
      "Manufacturer saved successfully."
    );

    await screen.findByText("5 total");

    expect(getManufacturers).toHaveBeenCalledTimes(2);

    expect(displayedNames()).toContain("New Pharma");
  });

  // ===========================================
  // 27. CLEAR PREVIOUS SUCCESS NOTICE
  // ===========================================

  test("should clear previous notice when another action opens", async () => {
    const user = userEvent.setup();

    renderManufacturers();
    await waitForManufacturers();

    // Arrange: Finish first action
    await user.click(
      screen.getByRole("button", {
        name: "Add Manufacturer",
      })
    );

    await user.click(
      screen.getByRole("button", {
        name: "Simulate save",
      })
    );

    await waitFor(() => {
      expect(getManufacturers).toHaveBeenCalledTimes(2);
    });

    expect(
      screen.getByText(
        "Manufacturer saved successfully."
      )
    ).toBeInTheDocument();

    // Act: Open another action
    await user.click(
      screen.getByRole("button", {
        name: "Add Manufacturer",
      })
    );

    // Assert
    expect(
      screen.queryByText(
        "Manufacturer saved successfully."
      )
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("dialog", {
        name: "create manufacturer",
      })
    ).toBeInTheDocument();
  });

  // ===========================================
  // 28. MANUAL RELOAD
  // ===========================================

  test("should reload manufacturer list manually", async () => {
    const user = userEvent.setup();

    renderManufacturers();
    await waitForManufacturers();

    expect(getManufacturers).toHaveBeenCalledTimes(1);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Reload manufacturers",
      })
    );

    // Assert
    await waitFor(() => {
      expect(getManufacturers).toHaveBeenCalledTimes(2);
    });

    expect(displayedNames()).toHaveLength(4);
  });
});
