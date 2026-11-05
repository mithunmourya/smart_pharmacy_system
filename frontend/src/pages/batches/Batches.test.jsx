
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
  within,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import Batches from "./Batches";
import useAuth from "../../hooks/useAuth";
import { getMedicines } from "../../services/medicine.service";
import { getBatchesByMedicine } from "../../services/batch.service";

// =============================================
// MOCK DEPENDENCIES
// =============================================

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

vi.mock("../../services/medicine.service", () => ({
  getMedicines: vi.fn(),
}));

vi.mock("../../services/batch.service", () => ({
  getBatchesByMedicine: vi.fn(),
}));

// BatchModal has already been unit tested.
// Here we only test how Batches.jsx uses it.
vi.mock("./BatchModal", () => ({
  default: ({
    action,
    medicine,
    batch,
    onClose,
    onSuccess,
  }) => (
    <div role="dialog" aria-label={`${action} batch`}>
      <p>{medicine?.name}</p>
      <p>{batch?.batch_number ?? "New batch"}</p>

      <button type="button" onClick={onClose}>
        Close modal
      </button>

      <button
        type="button"
        onClick={() => onSuccess("Batch saved successfully.")}
      >
        Simulate save
      </button>
    </div>
  ),
}));

// Mock shared table UI so we can focus on
// filtering, sorting, permissions and page logic.
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
    ready,
    count,
    hasFilters,
    onClearFilters,
    emptyMessage,
    children,
  }) => {
    if (!ready) {
      return <p>Select a medicine to view batches.</p>;
    }

    if (loading) {
      return <p role="status">Loading batches...</p>;
    }

    if (error) {
      return (
        <section>
          <p role="alert">{error}</p>

          <button type="button" onClick={onReload}>
            Reload batches
          </button>
        </section>
      );
    }

    return (
      <section>
        <button type="button" onClick={onReload}>
          Reload batches
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
              ? "No matching batches"
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

// Relative dates keep expiry tests valid
// even when the calendar date changes.
function dateAfterDays(days) {
  const date = new Date();

  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

const medicines = [
  {
    medicine_id: 1,
    name: "Paracetamol",
    manufacturer: "ABC Pharma",
    manufacturer_id: 1,
    medicine_is_active: true,
    manufacturer_is_active: true,
  },
  {
    medicine_id: 2,
    name: "Ibuprofen",
    manufacturer: "Old Pharma",
    manufacturer_id: 2,
    medicine_is_active: false,
    manufacturer_is_active: false,
  },
];

const batches = [
  {
    batch_id: 1,
    batch_number: "PAR-ALPHA",
    purchase_price: 10,
    selling_price: 15,
    stock_quantity: 12,
    expiry_date: dateAfterDays(5),
    is_active: true,
    created_at: "2026-01-01",
  },
  {
    batch_id: 2,
    batch_number: "PAR-BETA",
    purchase_price: 7,
    selling_price: 10,
    stock_quantity: 0,
    expiry_date: dateAfterDays(-20),
    is_active: false,
    created_at: "2026-04-01",
  },
  {
    batch_id: 3,
    batch_number: "PAR-GAMMA",
    purchase_price: 12,
    selling_price: 20,
    stock_quantity: 60,
    expiry_date: dateAfterDays(60),
    is_active: true,
    created_at: "2026-02-01",
  },
  {
    batch_id: 4,
    batch_number: "PAR-DELTA",
    purchase_price: 5,
    selling_price: 8,
    stock_quantity: 5,
    expiry_date: dateAfterDays(20),
    is_active: true,
    created_at: "2026-03-01",
  },
];

const mockRequest = vi.fn();

// =============================================
// TEST HELPERS
// =============================================

function renderBatches(role = "Admin") {
  useAuth.mockReturnValue({
    user: role ? { user_id: 1, role } : null,
    authenticatedRequest: mockRequest,
  });

  return render(<Batches />);
}

async function selectMedicine(
  user,
  medicineId = "1",
  expectedCount = 4
) {
  await screen.findByRole("option", {
    name: /Paracetamol/,
  });

  await user.selectOptions(
    screen.getByRole("combobox", {
      name: "Medicine",
    }),
    medicineId
  );

  await screen.findByText(`${expectedCount} batches`);
}

function displayedBatchNumbers() {
  const table = screen.getByRole("table");

  return Array.from(
    table.querySelectorAll("tbody tr")
  ).map((row) => row.cells[0].textContent.trim());
}

// =============================================
// BATCHES PAGE TESTS
// =============================================

describe("Batches Page", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    getMedicines.mockResolvedValue(medicines);
    getBatchesByMedicine.mockResolvedValue(batches);
  });

  // ===========================================
  // 1. INITIAL LOADING
  // ===========================================

  test("loads medicines when the page opens", async () => {
    // Arrange & Act
    renderBatches();

    // Assert
    expect(
      await screen.findByRole("option", {
        name: /Paracetamol/,
      })
    ).toBeInTheDocument();

    expect(getMedicines).toHaveBeenCalledWith(
      mockRequest
    );

    expect(getBatchesByMedicine).not.toHaveBeenCalled();
  });

  // ===========================================
  // 2. NO MEDICINE SELECTED
  // ===========================================

  test("does not fetch batches until a medicine is selected", async () => {
    renderBatches();

    await screen.findByRole("option", {
      name: /Paracetamol/,
    });

    expect(
      screen.getByText(
        "Select a medicine to view batches."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Add Batch",
      })
    ).toBeDisabled();

    expect(getBatchesByMedicine).not.toHaveBeenCalled();
  });

  // ===========================================
  // 3. MEDICINE LOADING STATE
  // ===========================================

  test("disables medicine selection while medicines load", async () => {
    // Arrange
    let resolveMedicines;

    getMedicines.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMedicines = resolve;
        })
    );

    renderBatches();

    // Assert
    expect(
      screen.getByRole("combobox", {
        name: "Medicine",
      })
    ).toBeDisabled();

    expect(
      screen.getByRole("button", {
        name: "Add Batch",
      })
    ).toBeDisabled();

    // Finish loading
    await act(async () => {
      resolveMedicines(medicines);
    });

    expect(
      screen.getByRole("combobox", {
        name: "Medicine",
      })
    ).toBeEnabled();
  });

  // ===========================================
  // 4. NO MEDICINES
  // ===========================================

  test("shows a message when no medicines exist", async () => {
    // Arrange
    getMedicines.mockResolvedValue([]);

    // Act
    renderBatches();

    // Assert
    expect(
      await screen.findByText(
        "Add a medicine before creating batches."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Add Batch",
      })
    ).toBeDisabled();
  });

  // ===========================================
  // 5. MEDICINES FETCH ERROR
  // ===========================================

  test("displays error when medicines fail to load", async () => {
    // Arrange
    getMedicines.mockRejectedValue(
      new Error("Network error")
    );

    // Act
    renderBatches();

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Network error");

    expect(
      screen.getByRole("button", {
        name: "Add Batch",
      })
    ).toBeDisabled();
  });

  // ===========================================
  // 6. RETRY MEDICINES
  // ===========================================

  test("retries loading medicines after an error", async () => {
    // Arrange
    const user = userEvent.setup();

    getMedicines
      .mockRejectedValueOnce(
        new Error("Server unavailable")
      )
      .mockResolvedValueOnce(medicines);

    renderBatches();

    await screen.findByRole("alert");

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Retry loading medicines",
      })
    );

    // Assert
    expect(
      await screen.findByRole("option", {
        name: /Paracetamol/,
      })
    ).toBeInTheDocument();

    expect(getMedicines).toHaveBeenCalledTimes(2);
  });

  // ===========================================
  // 7. FALLBACK MEDICINE ERROR
  // ===========================================

  test("uses fallback error when medicine loading has no message", async () => {
    // Arrange
    getMedicines.mockRejectedValue(
      new Error("")
    );

    // Act
    renderBatches();

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to load medicines."
    );
  });

  // ===========================================
  // 8. LOAD BATCHES
  // ===========================================

  test("loads batches for the selected medicine", async () => {
    // Arrange
    const user = userEvent.setup();

    renderBatches();

    // Act
    await selectMedicine(user);

    // Assert
    expect(
      getBatchesByMedicine
    ).toHaveBeenCalledWith(mockRequest, "1");

    expect(displayedBatchNumbers()).toEqual([
      "PAR-BETA",
      "PAR-ALPHA",
      "PAR-DELTA",
      "PAR-GAMMA",
    ]);
  });

  // ===========================================
  // 9. BATCH LOADING STATE
  // ===========================================

  test("shows loading state while fetching batches", async () => {
    // Arrange
    const user = userEvent.setup();
    let resolveBatches;

    getBatchesByMedicine.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBatches = resolve;
        })
    );

    renderBatches();

    await screen.findByRole("option", {
      name: /Paracetamol/,
    });

    // Act
    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Medicine",
      }),
      "1"
    );

    // Assert
    expect(
      screen.getByText("Loading batches...")
    ).toBeInTheDocument();

    // Finish loading
    await act(async () => {
      resolveBatches(batches);
    });

    expect(
      screen.getByText("4 batches")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 10. BATCH FETCH ERROR
  // ===========================================

  test("shows error when batches fail to load", async () => {
    // Arrange
    const user = userEvent.setup();

    getBatchesByMedicine.mockRejectedValue(
      new Error("Failed to fetch batches")
    );

    renderBatches();

    // Act
    
const medicineSelect = screen.getByRole("combobox", {
  name: "Medicine",
});

// Wait until medicines finish loading
// and medicine ID 1 becomes available.
await waitFor(() => {
  expect(medicineSelect).toBeEnabled();

  expect(
    Array.from(medicineSelect.options).map(
      (option) => option.value
    )
  ).toContain("1");
});

// Select medicine only after the option exists.
await user.selectOptions(medicineSelect, "1");


    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Failed to fetch batches"
    );
  });

  // ===========================================
  // 11. RETRY BATCH LOADING
  // ===========================================

  test("retries fetching batches after failure", async () => {
    // Arrange
    const user = userEvent.setup();

    getBatchesByMedicine
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(batches);

    renderBatches();

    await screen.findByRole("option", {
      name: /Paracetamol/,
    });

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Medicine",
      }),
      "1"
    );

    await screen.findByRole("alert");

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Reload batches",
      })
    );

    // Assert
    await screen.findByText("4 batches");

    expect(
      getBatchesByMedicine
    ).toHaveBeenCalledTimes(2);

    expect(getMedicines).toHaveBeenCalledTimes(2);
  });

  // ===========================================
  // 12. FALLBACK BATCH ERROR
  // ===========================================

  test("uses fallback error for failed batch request", async () => {
    // Arrange
    const user = userEvent.setup();

    getBatchesByMedicine.mockRejectedValue(
      new Error("")
    );

    renderBatches();

    await screen.findByRole("option", {
      name: /Paracetamol/,
    });

    // Act
    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Medicine",
      }),
      "1"
    );

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to load batches."
    );
  });

  // ===========================================
  // 13. EMPTY BATCH LIST
  // ===========================================

  test("shows empty message when medicine has no batches", async () => {
    // Arrange
    const user = userEvent.setup();

    getBatchesByMedicine.mockResolvedValue([]);

    renderBatches();

    // Act
    await selectMedicine(user, "1", 0);

    // Assert
    expect(
      screen.getByText(
        "Use Add Batch to create the first batch for this medicine."
      )
    ).toBeInTheDocument();

    expect(displayedBatchNumbers()).toEqual([]);
  });

  // ===========================================
  // 14. BATCH SUMMARY
  // ===========================================

  test("displays batch and expiry counts", async () => {
    const user = userEvent.setup();

    renderBatches();
    await selectMedicine(user);

    // Assert
    expect(
      screen.getByText("4 batches")
    ).toBeInTheDocument();

    expect(
      screen.getByText("1 expire within 10 days")
    ).toBeInTheDocument();

    expect(
      screen.getByText("1 expired")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 15. OUT OF STOCK WARNING
  // ===========================================

  test("shows out-of-stock warning", async () => {
    const user = userEvent.setup();

    renderBatches();
    await selectMedicine(user);

    // Assert
    expect(
      within(
        screen.getByRole("table")
      ).getByText("Out of stock")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 16. SEARCH BATCH NUMBER
  // ===========================================

  test("searches batch numbers without case sensitivity", async () => {
    const user = userEvent.setup();

    renderBatches();
    await selectMedicine(user);

    // Act
    await user.type(
      screen.getByRole("searchbox", {
        name: "Search batches",
      }),
      "  gamma  "
    );

    // Assert
    expect(displayedBatchNumbers()).toEqual([
      "PAR-GAMMA",
    ]);
  });

  // ===========================================
  // 17. SEARCH WITH NO RESULTS
  // ===========================================

  test("shows no matching batches for unknown search", async () => {
    const user = userEvent.setup();

    renderBatches();
    await selectMedicine(user);

    // Act
    await user.type(
      screen.getByRole("searchbox", {
        name: "Search batches",
      }),
      "UNKNOWN"
    );

    // Assert
    expect(displayedBatchNumbers()).toEqual([]);

    expect(
      screen.getByText("No matching batches")
    ).toBeInTheDocument();
  });

  // ===========================================
  // 18-19. STATUS FILTER
  // ===========================================

  test.each([
    [
      "Active",
      ["PAR-ALPHA", "PAR-DELTA", "PAR-GAMMA"],
    ],
    [
      "Inactive",
      ["PAR-BETA"],
    ],
  ])(
    "filters batches by %s status",
    async (status, expected) => {
      const user = userEvent.setup();

      renderBatches();
      await selectMedicine(user);

      // Act
      await user.selectOptions(
        screen.getByRole("combobox", {
          name: "Batch status",
        }),
        status
      );

      // Assert
      expect(displayedBatchNumbers()).toEqual(expected);
    }
  );

  // ===========================================
  // 20-22. EXPIRY FILTER
  // ===========================================

  test.each([
    ["Expired", ["PAR-BETA"]],
    ["Soon", ["PAR-ALPHA"]],
    ["Later", ["PAR-DELTA", "PAR-GAMMA"]],
  ])(
    "filters batches with expiry category %s",
    async (expiry, expected) => {
      const user = userEvent.setup();

      renderBatches();
      await selectMedicine(user);

      // Act
      await user.selectOptions(
        screen.getByRole("combobox", {
          name: "Expiry",
        }),
        expiry
      );

      // Assert
      expect(displayedBatchNumbers()).toEqual(expected);
    }
  );

  // ===========================================
  // 23. COMBINED FILTERS
  // ===========================================

  test("applies search, status and expiry filters together", async () => {
    const user = userEvent.setup();

    renderBatches();
    await selectMedicine(user);

    // Act
    await user.type(
      screen.getByRole("searchbox", {
        name: "Search batches",
      }),
      "PAR"
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Batch status",
      }),
      "Active"
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Expiry",
      }),
      "Soon"
    );

    // Assert
    expect(displayedBatchNumbers()).toEqual([
      "PAR-ALPHA",
    ]);
  });

  // ===========================================
  // 24. CLEAR FILTERS
  // ===========================================

  test("clears all batch filters", async () => {
    const user = userEvent.setup();

    renderBatches();
    await selectMedicine(user);

    // Arrange: Apply filters
    await user.type(
      screen.getByRole("searchbox", {
        name: "Search batches",
      }),
      "ALPHA"
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Batch status",
      }),
      "Active"
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Expiry",
      }),
      "Soon"
    );

    expect(displayedBatchNumbers()).toEqual([
      "PAR-ALPHA",
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
        name: "Search batches",
      })
    ).toHaveValue("");

    expect(
      screen.getByRole("combobox", {
        name: "Batch status",
      })
    ).toHaveValue("All");

    expect(
      screen.getByRole("combobox", {
        name: "Expiry",
      })
    ).toHaveValue("All");

    expect(displayedBatchNumbers()).toHaveLength(4);
  });

  // ===========================================
  // 25. SORT BY BATCH NUMBER
  // ===========================================

  test("sorts batch numbers ascending and descending", async () => {
    const user = userEvent.setup();

    renderBatches();
    await selectMedicine(user);

    // Act: Ascending
    await user.click(
      screen.getByRole("button", {
        name: "Batch number",
      })
    );

    // Assert
    expect(displayedBatchNumbers()).toEqual([
      "PAR-ALPHA",
      "PAR-BETA",
      "PAR-DELTA",
      "PAR-GAMMA",
    ]);

    // Act: Descending
    await user.click(
      screen.getByRole("button", {
        name: "Batch number",
      })
    );

    // Assert
    expect(displayedBatchNumbers()).toEqual([
      "PAR-GAMMA",
      "PAR-DELTA",
      "PAR-BETA",
      "PAR-ALPHA",
    ]);
  });

  // ===========================================
  // 26. SORT BY PURCHASE PRICE
  // ===========================================

  test("sorts purchase prices numerically", async () => {
    const user = userEvent.setup();

    renderBatches();
    await selectMedicine(user);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Purchase price",
      })
    );

    // Assert
    expect(displayedBatchNumbers()).toEqual([
      "PAR-DELTA",
      "PAR-BETA",
      "PAR-ALPHA",
      "PAR-GAMMA",
    ]);
  });

  // ===========================================
  // 27. SORT BY STOCK
  // ===========================================

  test("sorts batch stock numerically", async () => {
    const user = userEvent.setup();

    renderBatches();
    await selectMedicine(user);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Stock",
      })
    );

    // Assert
    expect(displayedBatchNumbers()).toEqual([
      "PAR-BETA",
      "PAR-DELTA",
      "PAR-ALPHA",
      "PAR-GAMMA",
    ]);
  });

  // ===========================================
  // 28. SORT BY EXPIRY
  // ===========================================

  test("sorts expiry dates descending", async () => {
    const user = userEvent.setup();

    renderBatches();
    await selectMedicine(user);

    // Initial expiry sort is ascending.
    expect(displayedBatchNumbers()).toEqual([
      "PAR-BETA",
      "PAR-ALPHA",
      "PAR-DELTA",
      "PAR-GAMMA",
    ]);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Expiry",
      })
    );

    // Assert
    expect(displayedBatchNumbers()).toEqual([
      "PAR-GAMMA",
      "PAR-DELTA",
      "PAR-ALPHA",
      "PAR-BETA",
    ]);
  });

  // ===========================================
  // 29. SORT BY CREATED DATE
  // ===========================================

  test("sorts batches by creation date", async () => {
    const user = userEvent.setup();

    renderBatches();
    await selectMedicine(user);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Created",
      })
    );

    // Assert
    expect(displayedBatchNumbers()).toEqual([
      "PAR-ALPHA",
      "PAR-GAMMA",
      "PAR-DELTA",
      "PAR-BETA",
    ]);
  });

  // ===========================================
  // 30-32. ROLE RESTRICTIONS
  // ===========================================

  test.each([
    "Pharmacist",
    "Customer",
    null,
  ])(
    "hides batch management actions for role %s",
    async (role) => {
      const user = userEvent.setup();

      renderBatches(role);
      await selectMedicine(user);

      // Assert
      expect(
        screen.queryByRole("button", {
          name: "Add Batch",
        })
      ).not.toBeInTheDocument();

      expect(
        screen.queryByRole("button", {
          name: "Edit batch PAR-ALPHA",
        })
      ).not.toBeInTheDocument();

      expect(displayedBatchNumbers()).toHaveLength(4);
    }
  );

  // ===========================================
  // 33. INACTIVE MEDICINE
  // ===========================================

  test("blocks adding batches to inactive medicine", async () => {
    const user = userEvent.setup();

    getBatchesByMedicine.mockResolvedValue([]);

    renderBatches();

    // Act
    await selectMedicine(user, "2", 0);

    // Assert
    expect(
      screen.getByText(
        /Inactive medicine: existing batches remain visible/
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Add Batch",
      })
    ).toBeDisabled();
  });

  // ===========================================
  // 34. INACTIVE MANUFACTURER WARNING
  // ===========================================

  test("warns when selected medicine has inactive manufacturer", async () => {
    const user = userEvent.setup();

    getBatchesByMedicine.mockResolvedValue([]);

    renderBatches();

    // Act
    await selectMedicine(user, "2", 0);

    // Assert
    expect(
      screen.getByText(
        /Inactive manufacturer: these batches are excluded/
      )
    ).toBeInTheDocument();
  });

  // ===========================================
  // 35. OPEN CREATE MODAL
  // ===========================================

  test("opens create batch modal for Admin", async () => {
    const user = userEvent.setup();

    renderBatches();
    await selectMedicine(user);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Add Batch",
      })
    );

    // Assert
    expect(
      screen.getByRole("dialog", {
        name: "create batch",
      })
    ).toHaveTextContent("Paracetamol");

    expect(
      screen.getByRole("dialog")
    ).toHaveTextContent("New batch");
  });

  // ===========================================
  // 36. OPEN EDIT MODAL
  // ===========================================

  test("opens edit modal for active batch", async () => {
    const user = userEvent.setup();

    renderBatches();
    await selectMedicine(user);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Edit batch PAR-ALPHA",
      })
    );

    // Assert
    expect(
      screen.getByRole("dialog", {
        name: "edit batch",
      })
    ).toHaveTextContent("PAR-ALPHA");
  });

  // ===========================================
  // 37. OPEN STOCK MODAL
  // ===========================================

  test("opens stock adjustment modal", async () => {
    const user = userEvent.setup();

    renderBatches();
    await selectMedicine(user);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Adjust stock for batch PAR-ALPHA",
      })
    );

    // Assert
    expect(
      screen.getByRole("dialog", {
        name: "stock batch",
      })
    ).toHaveTextContent("PAR-ALPHA");
  });

  // ===========================================
  // 38. OPEN DEACTIVATE MODAL
  // ===========================================

  test("opens deactivate modal for active batch", async () => {
    const user = userEvent.setup();

    renderBatches();
    await selectMedicine(user);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Deactivate batch PAR-ALPHA",
      })
    );

    // Assert
    expect(
      screen.getByRole("dialog", {
        name: "deactivate batch",
      })
    ).toHaveTextContent("PAR-ALPHA");
  });

  // ===========================================
  // 39. INACTIVE BATCH ACTIONS
  // ===========================================

  test("disables editing and stock adjustment for inactive batch", async () => {
    const user = userEvent.setup();

    renderBatches();
    await selectMedicine(user);

    // Assert restrictions
    expect(
      screen.getByRole("button", {
        name: "Edit batch PAR-BETA",
      })
    ).toBeDisabled();

    expect(
      screen.getByRole("button", {
        name: "Adjust stock for batch PAR-BETA",
      })
    ).toBeDisabled();

    // Act: Restore inactive batch
    await user.click(
      screen.getByRole("button", {
        name: "Restore batch PAR-BETA",
      })
    );

    // Assert
    expect(
      screen.getByRole("dialog", {
        name: "restore batch",
      })
    ).toHaveTextContent("PAR-BETA");
  });

  // ===========================================
  // 40. CLOSE MODAL
  // ===========================================

  test("closes modal without reloading", async () => {
    const user = userEvent.setup();

    renderBatches();
    await selectMedicine(user);

    // Arrange
    await user.click(
      screen.getByRole("button", {
        name: "Add Batch",
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

    expect(
      getBatchesByMedicine
    ).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 41. RELOAD AFTER SUCCESS
  // ===========================================

  test("shows success notice and reloads batches after saving", async () => {
    const user = userEvent.setup();

    const newBatch = {
      ...batches[0],
      batch_id: 5,
      batch_number: "PAR-NEW",
    };

    // Arrange
    getBatchesByMedicine
      .mockResolvedValueOnce(batches)
      .mockResolvedValueOnce([
        ...batches,
        newBatch,
      ]);

    renderBatches();
    await selectMedicine(user);

    await user.click(
      screen.getByRole("button", {
        name: "Add Batch",
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
      screen.getByText(
        "Batch saved successfully."
      )
    ).toBeInTheDocument();

    await screen.findByText("5 batches");

    expect(
      getBatchesByMedicine
    ).toHaveBeenCalledTimes(2);

    expect(getMedicines).toHaveBeenCalledTimes(2);

    expect(displayedBatchNumbers()).toContain(
      "PAR-NEW"
    );
  });

  // ===========================================
  // 42. CLEAR SUCCESS NOTICE
  // ===========================================

  test("clears previous success notice when opening another action", async () => {
    const user = userEvent.setup();

    renderBatches();
    await selectMedicine(user);

    // Arrange: Complete first action
    await user.click(
      screen.getByRole("button", {
        name: "Add Batch",
      })
    );

    await user.click(
      screen.getByRole("button", {
        name: "Simulate save",
      })
    );

    await waitFor(() => {
      expect(
        getBatchesByMedicine
      ).toHaveBeenCalledTimes(2);
    });

    expect(
      screen.getByText(
        "Batch saved successfully."
      )
    ).toBeInTheDocument();

    // Act: Open another action
    await user.click(
      screen.getByRole("button", {
        name: "Add Batch",
      })
    );

    // Assert
    expect(
      screen.queryByText(
        "Batch saved successfully."
      )
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("dialog", {
        name: "create batch",
      })
    ).toBeInTheDocument();
  });

  // ===========================================
  // 43. CHANGE SELECTED MEDICINE
  // ===========================================

  test("clears previous filters when selecting a different medicine", async () => {
    const user = userEvent.setup();

    renderBatches();
    await selectMedicine(user);

    // Arrange
    await user.type(
      screen.getByRole("searchbox", {
        name: "Search batches",
      }),
      "ALPHA"
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Batch status",
      }),
      "Active"
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Expiry",
      }),
      "Soon"
    );

    // Act
    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Medicine",
      }),
      "2"
    );

    // Assert
    expect(
      screen.getByRole("searchbox", {
        name: "Search batches",
      })
    ).toHaveValue("");

    expect(
      screen.getByRole("combobox", {
        name: "Batch status",
      })
    ).toHaveValue("All");

    expect(
      screen.getByRole("combobox", {
        name: "Expiry",
      })
    ).toHaveValue("All");

    await waitFor(() => {
      expect(
        getBatchesByMedicine
      ).toHaveBeenLastCalledWith(
        mockRequest,
        "2"
      );
    });
  });

  // ===========================================
  // 44. MANUAL RELOAD
  // ===========================================

  test("reloads batches and medicines when Refresh is requested", async () => {
    const user = userEvent.setup();

    renderBatches();
    await selectMedicine(user);

    expect(
      getBatchesByMedicine
    ).toHaveBeenCalledTimes(1);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Reload batches",
      })
    );

    // Assert
    await waitFor(() => {
      expect(
        getBatchesByMedicine
      ).toHaveBeenCalledTimes(2);

      expect(getMedicines).toHaveBeenCalledTimes(2);
    });
  });
});
