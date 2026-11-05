
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
  within,
  act,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import Medicines from "./Medicines";
import useAuth from "../../hooks/useAuth";
import { getMedicines } from "../../services/medicine.service";

// =============================================
// MOCK DEPENDENCIES
// =============================================

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

// Mock only getMedicines.
// Keep the real MEDICINE_CATEGORIES constant.
vi.mock("../../services/medicine.service", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    getMedicines: vi.fn(),
  };
});

// Mock the modal because its own tests are complete.
vi.mock("./MedicineModal", () => ({
  default: ({ action, medicine, onClose, onSuccess }) => (
    <div role="dialog" aria-label={`${action} medicine`}>
      <p>{medicine?.name ?? "New medicine"}</p>

      <button type="button" onClick={onClose}>
        Close modal
      </button>

      <button
        type="button"
        onClick={() =>
          onSuccess("Medicine saved successfully.")
        }
      >
        Simulate save
      </button>
    </div>
  ),
}));

// Mock shared display components so we test
// the Medicines page logic independently.
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
    <span>{count} {children}</span>
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
      return <p role="status">Loading medicines...</p>;
    }

    if (error) {
      return (
        <section>
          <p role="alert">{error}</p>

          <button type="button" onClick={onReload}>
            Reload medicines
          </button>
        </section>
      );
    }

    return (
      <section>
        <button type="button" onClick={onReload}>
          Reload medicines
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
              ? "No matching medicines"
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

const medicines = [
  {
    medicine_id: 1,
    name: "Paracetamol",
    manufacturer_id: 1,
    manufacturer: "Zen Pharma",
    manufacturer_is_active: true,
    category: "Tablet",
    reorder_level: 10,
    medicine_is_active: true,
    created_at: "2026-01-10T10:00:00.000Z",
  },
  {
    medicine_id: 2,
    name: "Amoxicillin",
    manufacturer_id: 2,
    manufacturer: "Alpha Labs",
    manufacturer_is_active: true,
    category: "Capsule",
    reorder_level: 20,
    medicine_is_active: true,
    created_at: "2026-03-10T10:00:00.000Z",
  },
  {
    medicine_id: 3,
    name: "Ibuprofen",
    manufacturer_id: 1,
    manufacturer: "Zen Pharma",
    manufacturer_is_active: true,
    category: "Tablet",
    reorder_level: 5,
    medicine_is_active: false,
    created_at: "2026-02-10T10:00:00.000Z",
  },
  {
    medicine_id: 4,
    name: "Cetirizine",
    manufacturer_id: 3,
    manufacturer: "Old Pharma",
    manufacturer_is_active: false,
    category: "Syrup",
    reorder_level: 0,
    medicine_is_active: true,
    created_at: "2026-04-10T10:00:00.000Z",
  },
];

const mockRequest = vi.fn();

// =============================================
// HELPER FUNCTIONS
// =============================================

function renderMedicines(role = "Admin") {
  useAuth.mockReturnValue({
    user: role ? { user_id: 1, role } : null,
    authenticatedRequest: mockRequest,
  });

  return render(<Medicines />);
}

async function waitForMedicines() {
  await screen.findByText("4 total");
}

// Return names in their displayed row order.
function displayedNames() {
  const table = screen.getByRole("table");

  return Array.from(
    table.querySelectorAll("tbody tr")
  ).map((row) => row.cells[0].textContent.trim());
}

// =============================================
// MEDICINES PAGE TESTS
// =============================================

describe("Medicines Page", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    getMedicines.mockResolvedValue(medicines);
  });

  // ===========================================
  // 1. INITIAL LOADING
  // ===========================================

  test("shows loading state while fetching medicines", async () => {
    // Arrange
    let resolveRequest;

    getMedicines.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );

    // Act
    renderMedicines();

    // Assert
    expect(
      screen.getByText("Loading medicines...")
    ).toBeInTheDocument();

    // Finish request
    await act(async () => {
      resolveRequest(medicines);
    });

    expect(
      screen.getByText("4 total")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 2. RENDER MEDICINE LIST
  // ===========================================

  test("loads and displays medicines", async () => {
    // Arrange & Act
    renderMedicines();
    await waitForMedicines();

    // Assert
    expect(getMedicines).toHaveBeenCalledWith(
      mockRequest
    );

    expect(displayedNames()).toEqual([
      "Amoxicillin",
      "Cetirizine",
      "Ibuprofen",
      "Paracetamol",
    ]);
  });

  // ===========================================
  // 3. MEDICINE SUMMARY
  // ===========================================

  test("displays total, active and inactive counts", async () => {
    renderMedicines();
    await waitForMedicines();

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
  // 4. EMPTY MEDICINE LIST
  // ===========================================

  test("displays empty message when no medicines exist", async () => {
    // Arrange
    getMedicines.mockResolvedValue([]);

    // Act
    renderMedicines();

    // Assert
    expect(
      await screen.findByText(
        "Medicines will appear here once added."
      )
    ).toBeInTheDocument();

    expect(displayedNames()).toEqual([]);

    expect(
      screen.getByText("0 total")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 5. API FAILURE AND RETRY
  // ===========================================

  test("shows an API error and retries loading", async () => {
    // Arrange
    const user = userEvent.setup();

    getMedicines
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(medicines);

    renderMedicines();

    // Assert failure
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Network error");

    // Act: Retry
    await user.click(
      screen.getByRole("button", {
        name: "Reload medicines",
      })
    );

    // Assert
    await waitForMedicines();

    expect(getMedicines).toHaveBeenCalledTimes(2);

    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 6. API FALLBACK ERROR
  // ===========================================

  test("shows a fallback message for an error without a message", async () => {
    // Arrange
    getMedicines.mockRejectedValue(
      new Error("")
    );

    // Act
    renderMedicines();

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to load medicines."
    );
  });

  // ===========================================
  // 7. SEARCH BY MEDICINE NAME
  // ===========================================

  test("searches medicine names without case sensitivity", async () => {
    // Arrange
    const user = userEvent.setup();

    renderMedicines();
    await waitForMedicines();

    // Act
    await user.type(
      screen.getByRole("searchbox", {
        name: "Search",
      }),
      "  PARA  "
    );

    // Assert
    expect(displayedNames()).toEqual([
      "Paracetamol",
    ]);
  });

  // ===========================================
  // 8. SEARCH BY MANUFACTURER
  // ===========================================

  test("searches medicines by manufacturer name", async () => {
    const user = userEvent.setup();

    renderMedicines();
    await waitForMedicines();

    // Act
    await user.type(
      screen.getByRole("searchbox", {
        name: "Search",
      }),
      "zen pharma"
    );

    // Assert
    expect(displayedNames()).toEqual([
      "Ibuprofen",
      "Paracetamol",
    ]);
  });

  // ===========================================
  // 9. SEARCH WITH NO RESULTS
  // ===========================================

  test("shows no matching records for an unknown search", async () => {
    const user = userEvent.setup();

    renderMedicines();
    await waitForMedicines();

    // Act
    await user.type(
      screen.getByRole("searchbox", {
        name: "Search",
      }),
      "Unknown Medicine"
    );

    // Assert
    expect(displayedNames()).toEqual([]);

    expect(
      screen.getByText("No matching medicines")
    ).toBeInTheDocument();

    // Summary counts are for all medicines.
    expect(
      screen.getByText("4 total")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 10. CATEGORY FILTER
  // ===========================================

  test("filters medicines by category", async () => {
    const user = userEvent.setup();

    renderMedicines();
    await waitForMedicines();

    // Act
    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Category",
      }),
      "Tablet"
    );

    // Assert
    expect(displayedNames()).toEqual([
      "Ibuprofen",
      "Paracetamol",
    ]);
  });

  // ===========================================
  // 11. MANUFACTURER FILTER
  // ===========================================

  test("filters medicines by manufacturer", async () => {
    const user = userEvent.setup();

    renderMedicines();
    await waitForMedicines();

    // Act
    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Manufacturer",
      }),
      "2"
    );

    // Assert
    expect(displayedNames()).toEqual([
      "Amoxicillin",
    ]);
  });

  // ===========================================
  // 12-13. STATUS FILTER
  // ===========================================

  test.each([
    [
      "Active",
      ["Amoxicillin", "Cetirizine", "Paracetamol"],
    ],
    [
      "Inactive",
      ["Ibuprofen"],
    ],
  ])(
    "filters medicines with status %s",
    async (status, expectedNames) => {
      const user = userEvent.setup();

      renderMedicines();
      await waitForMedicines();

      // Act
      await user.selectOptions(
        screen.getByRole("combobox", {
          name: "Medicine status",
        }),
        status
      );

      // Assert
      expect(displayedNames()).toEqual(
        expectedNames
      );
    }
  );

  // ===========================================
  // 14. COMBINED FILTERS
  // ===========================================

  test("applies multiple filters together", async () => {
    const user = userEvent.setup();

    renderMedicines();
    await waitForMedicines();

    // Act
    await user.type(
      screen.getByRole("searchbox", {
        name: "Search",
      }),
      "zen"
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Category",
      }),
      "Tablet"
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Medicine status",
      }),
      "Active"
    );

    // Assert
    expect(displayedNames()).toEqual([
      "Paracetamol",
    ]);
  });

  // ===========================================
  // 15. CLEAR FILTERS
  // ===========================================

  test("clears all selected filters", async () => {
    const user = userEvent.setup();

    renderMedicines();
    await waitForMedicines();

    // Arrange: Apply filters
    await user.type(
      screen.getByRole("searchbox", {
        name: "Search",
      }),
      "Para"
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Category",
      }),
      "Tablet"
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Manufacturer",
      }),
      "1"
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Medicine status",
      }),
      "Active"
    );

    expect(displayedNames()).toEqual([
      "Paracetamol",
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
        name: "Search",
      })
    ).toHaveValue("");

    expect(
      screen.getByRole("combobox", {
        name: "Category",
      })
    ).toHaveValue("All");

    expect(
      screen.getByRole("combobox", {
        name: "Manufacturer",
      })
    ).toHaveValue("All");

    expect(
      screen.getByRole("combobox", {
        name: "Medicine status",
      })
    ).toHaveValue("All");

    expect(displayedNames()).toHaveLength(4);
  });

  // ===========================================
  // 16. SORT MEDICINE NAMES
  // ===========================================

  test("sorts medicine names in ascending and descending order", async () => {
    const user = userEvent.setup();

    renderMedicines();
    await waitForMedicines();

    // Assert initial ascending order
    expect(displayedNames()).toEqual([
      "Amoxicillin",
      "Cetirizine",
      "Ibuprofen",
      "Paracetamol",
    ]);

    // Act: Reverse name sort
    await user.click(
      screen.getByRole("button", {
        name: "Medicine",
      })
    );

    // Assert descending order
    expect(displayedNames()).toEqual([
      "Paracetamol",
      "Ibuprofen",
      "Cetirizine",
      "Amoxicillin",
    ]);
  });

  // ===========================================
  // 17. SORT REORDER LEVEL
  // ===========================================

  test("sorts reorder levels numerically", async () => {
    const user = userEvent.setup();

    renderMedicines();
    await waitForMedicines();

    // Act: Ascending numeric sort
    await user.click(
      screen.getByRole("button", {
        name: "Reorder level",
      })
    );

    // Assert
    expect(displayedNames()).toEqual([
      "Cetirizine",
      "Ibuprofen",
      "Paracetamol",
      "Amoxicillin",
    ]);

    // Act: Descending numeric sort
    await user.click(
      screen.getByRole("button", {
        name: "Reorder level",
      })
    );

    // Assert
    expect(displayedNames()).toEqual([
      "Amoxicillin",
      "Paracetamol",
      "Ibuprofen",
      "Cetirizine",
    ]);
  });

  // ===========================================
  // 18. SORT BY DATE
  // ===========================================

  test("sorts medicines by creation date", async () => {
    const user = userEvent.setup();

    renderMedicines();
    await waitForMedicines();

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Created",
      })
    );

    // Assert oldest first
    expect(displayedNames()).toEqual([
      "Paracetamol",
      "Ibuprofen",
      "Amoxicillin",
      "Cetirizine",
    ]);
  });

  // ===========================================
  // 19. INACTIVE MANUFACTURER WARNING
  // ===========================================

  test("displays warning for inactive manufacturer", async () => {
    renderMedicines();
    await waitForMedicines();

    const table = screen.getByRole("table");

    expect(
      within(table).getByText(
        "Inactive manufacturer"
      )
    ).toBeInTheDocument();
  });

  // ===========================================
  // 20-22. ROLE RESTRICTIONS
  // ===========================================

  test.each([
    "Pharmacist",
    "Customer",
    null,
  ])(
    "hides medicine management actions for role %s",
    async (role) => {
      // Arrange & Act
      renderMedicines(role);
      await waitForMedicines();

      // Assert
      expect(
        screen.queryByRole("button", {
          name: "Add Medicine",
        })
      ).not.toBeInTheDocument();

      expect(
        screen.queryByRole("button", {
          name: "Edit Paracetamol",
        })
      ).not.toBeInTheDocument();

      // Users can still view the list.
      expect(displayedNames()).toHaveLength(4);
    }
  );

  // ===========================================
  // 23. OPEN CREATE MODAL
  // ===========================================

  test("opens create modal when Admin clicks Add Medicine", async () => {
    const user = userEvent.setup();

    renderMedicines();
    await waitForMedicines();

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Add Medicine",
      })
    );

    // Assert
    expect(
      screen.getByRole("dialog", {
        name: "create medicine",
      })
    ).toHaveTextContent("New medicine");
  });

  // ===========================================
  // 24. OPEN EDIT MODAL
  // ===========================================

  test("opens edit modal for an active medicine", async () => {
    const user = userEvent.setup();

    renderMedicines();
    await waitForMedicines();

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Edit Paracetamol",
      })
    );

    // Assert
    expect(
      screen.getByRole("dialog", {
        name: "edit medicine",
      })
    ).toHaveTextContent("Paracetamol");
  });

  // ===========================================
  // 25. OPEN DEACTIVATE MODAL
  // ===========================================

  test("opens deactivate modal for an active medicine", async () => {
    const user = userEvent.setup();

    renderMedicines();
    await waitForMedicines();

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Deactivate Paracetamol",
      })
    );

    // Assert
    expect(
      screen.getByRole("dialog", {
        name: "deactivate medicine",
      })
    ).toHaveTextContent("Paracetamol");
  });

  // ===========================================
  // 26. INACTIVE MEDICINE ACTIONS
  // ===========================================

  test("disables edit and allows restore for an inactive medicine", async () => {
    const user = userEvent.setup();

    renderMedicines();
    await waitForMedicines();

    // Assert edit disabled
    expect(
      screen.getByRole("button", {
        name: "Edit Ibuprofen",
      })
    ).toBeDisabled();

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Restore Ibuprofen",
      })
    );

    // Assert
    expect(
      screen.getByRole("dialog", {
        name: "restore medicine",
      })
    ).toHaveTextContent("Ibuprofen");
  });

  // ===========================================
  // 27. CLOSE MODAL
  // ===========================================

  test("closes modal without reloading when cancelled", async () => {
    const user = userEvent.setup();

    renderMedicines();
    await waitForMedicines();

    // Arrange
    await user.click(
      screen.getByRole("button", {
        name: "Add Medicine",
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

    expect(getMedicines).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 28. RELOAD AFTER SUCCESS
  // ===========================================

  test("shows success notice and reloads medicines after saving", async () => {
    const user = userEvent.setup();

    const newMedicine = {
      ...medicines[0],
      medicine_id: 5,
      name: "New Medicine",
    };

    // Arrange
    getMedicines
      .mockResolvedValueOnce(medicines)
      .mockResolvedValueOnce([
        ...medicines,
        newMedicine,
      ]);

    renderMedicines();
    await waitForMedicines();

    await user.click(
      screen.getByRole("button", {
        name: "Add Medicine",
      })
    );

    // Act: Simulate successful modal operation
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
      "Medicine saved successfully."
    );

    await screen.findByText("5 total");

    expect(getMedicines).toHaveBeenCalledTimes(2);

    expect(displayedNames()).toContain(
      "New Medicine"
    );
  });

  // ===========================================
  // 29. CLEAR PREVIOUS SUCCESS NOTICE
  // ===========================================

  test("clears previous success notice when opening another action", async () => {
    const user = userEvent.setup();

    renderMedicines();
    await waitForMedicines();

    // Arrange: Complete one action
    await user.click(
      screen.getByRole("button", {
        name: "Add Medicine",
      })
    );

    await user.click(
      screen.getByRole("button", {
        name: "Simulate save",
      })
    );

    await waitFor(() => {
      expect(getMedicines).toHaveBeenCalledTimes(2);
    });

    expect(
      screen.getByText(
        "Medicine saved successfully."
      )
    ).toBeInTheDocument();

    // Act: Open another action
    await user.click(
      screen.getByRole("button", {
        name: "Add Medicine",
      })
    );

    // Assert
    expect(
      screen.queryByText(
        "Medicine saved successfully."
      )
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("dialog", {
        name: "create medicine",
      })
    ).toBeInTheDocument();
  });
});
