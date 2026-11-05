
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
  fireEvent,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import {
  SummaryBadge,
  CompactHeader,
  FilterField,
  StatusBadge,
  CompactTable,
} from "./CompactInventoryUI";

// ============================================
// SHARED MOCKS
// ============================================

const mockOnSort = vi.fn();
const mockOnReload = vi.fn();
const mockOnClearFilters = vi.fn();

// ============================================
// TABLE TEST DATA
// ============================================

const columns = [
  {
    key: "medicine_name",
    label: "Medicine",
  },
  {
    key: "stock",
    label: "Stock",
  },
  {
    key: "actions",
    label: "Actions",
    sortable: false,
  },
];

const baseTableProps = {
  title: "Medicine Inventory",
  noun: "medicines",
  columns,
  sort: {
    key: "medicine_name",
    direction: "asc",
  },
  onSort: mockOnSort,
  onReload: mockOnReload,
  loading: false,
  error: "",
  total: 2,
  count: 2,
  hasFilters: false,
  onClearFilters: mockOnClearFilters,
  emptyMessage: "No medicines are available.",
};

const tableRows = (
  <>
    <tr>
      <td>Paracetamol</td>
      <td>20</td>
      <td>Edit</td>
    </tr>

    <tr>
      <td>Ibuprofen</td>
      <td>5</td>
      <td>View</td>
    </tr>
  </>
);

// ============================================
// HELPERS
// ============================================

function renderTable(props = {}, children = tableRows) {
  return render(
    <CompactTable
      {...baseTableProps}
      {...props}
    >
      {children}
    </CompactTable>
  );
}

function reloadButton() {
  return screen.getByRole("button", {
    name: "Reload medicines",
  });
}

function tableSection() {
  return document.querySelector(
    'section[aria-label="Medicine Inventory"]'
  );
}

function tableBodyContainer() {
  return tableSection().querySelector(
    "[aria-busy]"
  );
}

// ============================================
// ALL COMPONENT TESTS
// ============================================

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================
// 1. SUMMARY BADGE
// ============================================

describe("SummaryBadge", () => {
  test("renders count and label", () => {
    render(
      <SummaryBadge count={12}>
        Medicines
      </SummaryBadge>
    );

    expect(
      screen.getByText("12")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Medicines")
    ).toBeInTheDocument();
  });

  test("renders count inside strong element", () => {
    render(
      <SummaryBadge count={8}>
        Available
      </SummaryBadge>
    );

    expect(
      screen.getByText("8").tagName
    ).toBe("STRONG");
  });

  test("uses neutral styling by default", () => {
    const { container } = render(
      <SummaryBadge count={5}>
        Total
      </SummaryBadge>
    );

    expect(
      container.firstChild
    ).toHaveClass(
      "border-border",
      "bg-surface",
      "text-text-secondary"
    );
  });

  test.each([
    [
      "success",
      "border-success/30",
      "bg-success/10",
    ],
    [
      "warning",
      "border-warning/30",
      "bg-warning/10",
    ],
    [
      "danger",
      "border-danger/30",
      "bg-danger/10",
    ],
    [
      "neutral",
      "border-border",
      "bg-surface",
    ],
  ])(
    "applies %s tone",
    (tone, borderClass, backgroundClass) => {
      const { container } = render(
        <SummaryBadge
          count={3}
          tone={tone}
        >
          Items
        </SummaryBadge>
      );

      expect(
        container.firstChild
      ).toHaveClass(
        borderClass,
        backgroundClass
      );
    }
  );

  test("displays zero count", () => {
    render(
      <SummaryBadge count={0}>
        Expired
      </SummaryBadge>
    );

    expect(
      screen.getByText("0")
    ).toBeInTheDocument();
  });

  test("supports JSX children", () => {
    render(
      <SummaryBadge count={4}>
        <span data-testid="badge-label">
          Low stock
        </span>
      </SummaryBadge>
    );

    expect(
      screen.getByTestId("badge-label")
    ).toHaveTextContent("Low stock");
  });

  test("updates count when props change", () => {
    const { rerender } = render(
      <SummaryBadge count={5}>
        Medicines
      </SummaryBadge>
    );

    rerender(
      <SummaryBadge count={10}>
        Medicines
      </SummaryBadge>
    );

    expect(
      screen.getByText("10")
    ).toBeInTheDocument();

    expect(
      screen.queryByText("5")
    ).not.toBeInTheDocument();
  });
});

// ============================================
// 2. COMPACT HEADER
// ============================================

describe("CompactHeader", () => {
  test("renders the heading", () => {
    render(
      <CompactHeader
        title="Medicine Inventory"
        description="Manage your stock"
      />
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Medicine Inventory",
      })
    ).toBeInTheDocument();
  });

  test("renders the description", () => {
    render(
      <CompactHeader
        title="Inventory"
        description="View available medicines"
      />
    );

    expect(
      screen.getByText(
        "View available medicines"
      )
    ).toBeInTheDocument();
  });

  test("renders summary content", () => {
    render(
      <CompactHeader
        title="Inventory"
        description="Stock overview"
        summary={
          <SummaryBadge count={20}>
            Total
          </SummaryBadge>
        }
      />
    );

    const summary = screen.getByRole(
      "group",
      {
        name: "Summary before filtering",
      }
    );

    expect(
      within(summary).getByText("20")
    ).toBeInTheDocument();

    expect(
      within(summary).getByText("Total")
    ).toBeInTheDocument();
  });

  test("renders multiple summary badges", () => {
    render(
      <CompactHeader
        title="Inventory"
        description="Overview"
        summary={
          <>
            <SummaryBadge count={15}>
              Active
            </SummaryBadge>

            <SummaryBadge count={3}>
              Low stock
            </SummaryBadge>
          </>
        }
      />
    );

    const summary = screen.getByRole(
      "group",
      {
        name: "Summary before filtering",
      }
    );

    expect(
      within(summary).getByText("15")
    ).toBeInTheDocument();

    expect(
      within(summary).getByText("3")
    ).toBeInTheDocument();
  });

  test("renders extra action children", () => {
    render(
      <CompactHeader
        title="Inventory"
        description="Overview"
      >
        <button type="button">
          Add Medicine
        </button>
      </CompactHeader>
    );

    expect(
      screen.getByRole("button", {
        name: "Add Medicine",
      })
    ).toBeInTheDocument();
  });

  test("supports interactive header actions", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <CompactHeader
        title="Inventory"
        description="Overview"
      >
        <button
          type="button"
          onClick={onClick}
        >
          Refresh
        </button>
      </CompactHeader>
    );

    await user.click(
      screen.getByRole("button", {
        name: "Refresh",
      })
    );

    expect(
      onClick
    ).toHaveBeenCalledTimes(1);
  });

  test("updates title and description on rerender", () => {
    const { rerender } = render(
      <CompactHeader
        title="Inventory"
        description="Old description"
      />
    );

    rerender(
      <CompactHeader
        title="Low Stock"
        description="New description"
      />
    );

    expect(
      screen.getByRole("heading", {
        name: "Low Stock",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText("New description")
    ).toBeInTheDocument();
  });
});

// ============================================
// 3. FILTER FIELD
// ============================================

describe("FilterField", () => {
  test("renders text input when children are absent", () => {
    render(
      <FilterField
        id="search"
        label="Search"
        placeholder="Search medicines"
      />
    );

    expect(
      screen.getByRole("textbox", {
        name: "Search",
      })
    ).toBeInTheDocument();
  });

  test("associates label with input ID", () => {
    render(
      <FilterField
        id="medicine-search"
        label="Medicine"
      />
    );

    const input = screen.getByLabelText(
      "Medicine"
    );

    expect(input).toHaveAttribute(
      "id",
      "medicine-search"
    );

    expect(
      screen.getByText("Medicine")
    ).toHaveAttribute(
      "for",
      "medicine-search"
    );
  });

  test("forwards input attributes", () => {
    render(
      <FilterField
        id="search"
        label="Search"
        name="medicineSearch"
        placeholder="Search stock"
        type="search"
      />
    );

    const input = screen.getByRole(
      "searchbox",
      { name: "Search" }
    );

    expect(input).toHaveAttribute(
      "name",
      "medicineSearch"
    );

    expect(input).toHaveAttribute(
      "placeholder",
      "Search stock"
    );
  });

  test("calls onChange when input changes", () => {
    const onChange = vi.fn();

    render(
      <FilterField
        id="search"
        label="Search"
        onChange={onChange}
      />
    );

    fireEvent.change(
      screen.getByLabelText("Search"),
      {
        target: {
          value: "Paracetamol",
        },
      }
    );

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test("renders select when options are provided", () => {
    render(
      <FilterField
        id="status"
        label="Status"
      >
        <option value="all">All</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </FilterField>
    );

    expect(
      screen.getByRole("combobox", {
        name: "Status",
      })
    ).toBeInTheDocument();

    expect(
      screen.getAllByRole("option")
    ).toHaveLength(3);
  });

  test("calls onChange when selection changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <FilterField
        id="status"
        label="Status"
        onChange={onChange}
      >
        <option value="all">All</option>
        <option value="active">Active</option>
      </FilterField>
    );

    const select = screen.getByRole(
      "combobox",
      { name: "Status" }
    );

    await user.selectOptions(
      select,
      "active"
    );

    expect(select).toHaveValue("active");

    expect(
      onChange
    ).toHaveBeenCalledTimes(1);
  });

  test("supports disabled input", () => {
    render(
      <FilterField
        id="search"
        label="Search"
        disabled
      />
    );

    expect(
      screen.getByLabelText("Search")
    ).toBeDisabled();
  });

  test("supports disabled select", () => {
    render(
      <FilterField
        id="status"
        label="Status"
        disabled
      >
        <option value="all">All</option>
      </FilterField>
    );

    expect(
      screen.getByRole("combobox", {
        name: "Status",
      })
    ).toBeDisabled();
  });

  test("supports required fields", () => {
    render(
      <FilterField
        id="search"
        label="Search"
        required
      />
    );

    expect(
      screen.getByLabelText("Search")
    ).toBeRequired();
  });

  test("applies custom class to wrapper", () => {
    const { container } = render(
      <FilterField
        id="search"
        label="Search"
        className="custom-filter"
      />
    );

    expect(
      container.firstChild
    ).toHaveClass("custom-filter");
  });

  test("supports controlled field values", () => {
    const { rerender } = render(
      <FilterField
        id="search"
        label="Search"
        value="Aspirin"
        onChange={() => {}}
      />
    );

    expect(
      screen.getByLabelText("Search")
    ).toHaveValue("Aspirin");

    rerender(
      <FilterField
        id="search"
        label="Search"
        value="Ibuprofen"
        onChange={() => {}}
      />
    );

    expect(
      screen.getByLabelText("Search")
    ).toHaveValue("Ibuprofen");
  });
});

// ============================================
// 4. STATUS BADGE
// ============================================

describe("StatusBadge", () => {
  test("displays Active when active is true", () => {
    render(
      <StatusBadge active={true} />
    );

    expect(
      screen.getByText("Active")
    ).toBeInTheDocument();
  });

  test("displays Inactive when active is false", () => {
    render(
      <StatusBadge active={false} />
    );

    expect(
      screen.getByText("Inactive")
    ).toBeInTheDocument();
  });

  test("applies active styling", () => {
    render(
      <StatusBadge active />
    );

    expect(
      screen.getByText("Active")
    ).toHaveClass(
      "bg-success/10",
      "text-success"
    );
  });

  test("applies inactive styling", () => {
    render(
      <StatusBadge active={false} />
    );

    expect(
      screen.getByText("Inactive")
    ).toHaveClass(
      "bg-background",
      "text-text-secondary"
    );
  });

  test("updates status when active prop changes", () => {
    const { rerender } = render(
      <StatusBadge active />
    );

    rerender(
      <StatusBadge active={false} />
    );

    expect(
      screen.getByText("Inactive")
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Active")
    ).not.toBeInTheDocument();
  });
});

// ============================================
// 5. COMPACT TABLE
// ============================================

describe("CompactTable", () => {
  // ==========================================
  // TABLE HEADER AND CONTENT
  // ==========================================

  test("renders table title", () => {
    renderTable();

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Medicine Inventory",
      })
    ).toBeInTheDocument();
  });

  test("renders the table rows", () => {
    renderTable();

    const table = screen.getByRole("table");

    expect(
      within(table).getByText(
        "Paracetamol"
      )
    ).toBeInTheDocument();

    expect(
      within(table).getByText(
        "Ibuprofen"
      )
    ).toBeInTheDocument();

    expect(
      within(table).getAllByRole("row")
    ).toHaveLength(3);
  });

  test("displays count and total", () => {
    renderTable();

    expect(
      screen.getByText(
        "2 of 2 medicines"
      )
    ).toBeInTheDocument();
  });

  test("renders column headers", () => {
    renderTable();

    const headers = screen.getAllByRole(
      "columnheader"
    );

    expect(headers).toHaveLength(3);

    expect(
      screen.getByRole("columnheader", {
        name: "Medicine",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("columnheader", {
        name: "Stock",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("columnheader", {
        name: "Actions",
      })
    ).toBeInTheDocument();
  });

  test("renders an accessible table region", () => {
    renderTable();

    const regions = screen.getAllByRole(
      "region",
      { name: "Medicine Inventory" }
    );

    // The section and the scrollable table
    // container are both labeled regions.
    expect(regions).toHaveLength(2);

    expect(
      screen.getByRole("table")
    ).toBeInTheDocument();
  });

  test("uses default table minimum width", () => {
    renderTable();

    expect(
      screen.getByRole("table")
    ).toHaveClass(
      "min-w-[900px]"
    );
  });

  test("supports custom minimum width", () => {
    renderTable({
      minWidth: "min-w-[600px]",
    });

    expect(
      screen.getByRole("table")
    ).toHaveClass(
      "min-w-[600px]"
    );
  });

  // ==========================================
  // SORTING
  // ==========================================

  test("marks active ascending column", () => {
    renderTable();

    expect(
      screen.getByRole("columnheader", {
        name: "Medicine",
      })
    ).toHaveAttribute(
      "aria-sort",
      "ascending"
    );
  });

  test("marks active descending column", () => {
    renderTable({
      sort: {
        key: "stock",
        direction: "desc",
      },
    });

    expect(
      screen.getByRole("columnheader", {
        name: "Stock",
      })
    ).toHaveAttribute(
      "aria-sort",
      "descending"
    );
  });

  test("does not mark inactive column as sorted", () => {
    renderTable();

    expect(
      screen.getByRole("columnheader", {
        name: "Stock",
      })
    ).not.toHaveAttribute(
      "aria-sort"
    );
  });

  test("shows descending action for active ascending sort", () => {
    renderTable();

    expect(
      screen.getByRole("button", {
        name: "Medicine: sort descending",
      })
    ).toBeInTheDocument();
  });

  test("shows ascending action for active descending sort", () => {
    renderTable({
      sort: {
        key: "medicine_name",
        direction: "desc",
      },
    });

    expect(
      screen.getByRole("button", {
        name: "Medicine: sort ascending",
      })
    ).toBeInTheDocument();
  });

  test("shows ascending action for inactive columns", () => {
    renderTable();

    expect(
      screen.getByRole("button", {
        name: "Stock: sort ascending",
      })
    ).toBeInTheDocument();
  });

  test("calls onSort with correct column key", async () => {
    const user = userEvent.setup();

    renderTable();

    await user.click(
      screen.getByRole("button", {
        name: "Stock: sort ascending",
      })
    );

    expect(
      mockOnSort
    ).toHaveBeenCalledWith("stock");

    expect(
      mockOnSort
    ).toHaveBeenCalledTimes(1);
  });

  test("non-sortable column does not have sort button", () => {
    renderTable();

    const actionsHeader = screen.getByRole(
      "columnheader",
      { name: "Actions" }
    );

    expect(
      within(actionsHeader).queryByRole(
        "button"
      )
    ).not.toBeInTheDocument();
  });

  test("announces ascending sort in status", () => {
    renderTable();

    expect(
      screen.getByText(
        "Sorted by Medicine, ascending."
      )
    ).toBeInTheDocument();
  });

  test("announces descending sort in status", () => {
    renderTable({
      sort: {
        key: "stock",
        direction: "desc",
      },
    });

    expect(
      screen.getByText(
        "Sorted by Stock, descending."
      )
    ).toBeInTheDocument();
  });

  // ==========================================
  // RELOAD
  // ==========================================

  test("renders Reload medicines button", () => {
    renderTable();

    expect(
      reloadButton()
    ).toBeInTheDocument();

    expect(
      reloadButton()
    ).toBeEnabled();
  });

  test("calls onReload when clicked", async () => {
    const user = userEvent.setup();

    renderTable();

    await user.click(reloadButton());

    expect(
      mockOnReload
    ).toHaveBeenCalledTimes(1);
  });

  test("disables reload while loading", () => {
    renderTable({
      loading: true,
    });

    expect(
      reloadButton()
    ).toBeDisabled();
  });

  test("disables reload when not ready", () => {
    renderTable({
      ready: false,
    });

    expect(
      reloadButton()
    ).toBeDisabled();
  });

  test("supports reloadDisabled prop", () => {
    renderTable({
      reloadDisabled: true,
    });

    expect(
      reloadButton()
    ).toBeDisabled();
  });

  test("does not reload when button is disabled", async () => {
    const user = userEvent.setup();

    renderTable({
      reloadDisabled: true,
    });

    await user.click(reloadButton());

    expect(
      mockOnReload
    ).not.toHaveBeenCalled();
  });

  // ==========================================
  // FILTER ACTIONS
  // ==========================================

  test("shows Clear filters when filters are active", () => {
    renderTable({
      hasFilters: true,
    });

    expect(
      screen.getByRole("button", {
        name: "Clear filters",
      })
    ).toBeInTheDocument();
  });

  test("hides header Clear filters when no filters are active", () => {
    renderTable({
      hasFilters: false,
    });

    expect(
      screen.queryByRole("button", {
        name: "Clear filters",
      })
    ).not.toBeInTheDocument();
  });

  test("calls onClearFilters when clicked", async () => {
    const user = userEvent.setup();

    renderTable({
      hasFilters: true,
    });

    await user.click(
      screen.getByRole("button", {
        name: "Clear filters",
      })
    );

    expect(
      mockOnClearFilters
    ).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // NOT READY
  // ==========================================

  test("shows initial message when not ready", () => {
    renderTable({
      ready: false,
    });

    expect(
      screen.getByText(
        "Select a medicine to begin."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Choose a medicine above to view its batches."
      )
    ).toBeInTheDocument();
  });

  test("does not render table when not ready", () => {
    renderTable({
      ready: false,
    });

    expect(
      screen.queryByRole("table")
    ).not.toBeInTheDocument();

    expect(
      reloadButton()
    ).toBeDisabled();
  });

  test("not-ready state takes precedence over loading", () => {
    renderTable({
      ready: false,
      loading: true,
    });

    expect(
      screen.getByText(
        "Select a medicine to begin."
      )
    ).toBeInTheDocument();

    expect(
      tableBodyContainer()
    ).toHaveAttribute(
      "aria-busy",
      "false"
    );
  });

  // ==========================================
  // LOADING STATE
  // ==========================================

  test("shows loading message", () => {
    renderTable({
      loading: true,
    });

    // The message appears both in the
    // header status and the table body.
    expect(
      screen.getAllByText(
        "Loading medicines..."
      )
    ).toHaveLength(2);
  });

  test("marks content busy while loading", () => {
    renderTable({
      loading: true,
    });

    expect(
      tableBodyContainer()
    ).toHaveAttribute(
      "aria-busy",
      "true"
    );

    expect(
      screen.queryByRole("table")
    ).not.toBeInTheDocument();
  });

  test("clears busy state when loading completes", () => {
    const { rerender } = renderTable({
      loading: true,
    });

    rerender(
      <CompactTable
        {...baseTableProps}
        loading={false}
      >
        {tableRows}
      </CompactTable>
    );

    expect(
      tableBodyContainer()
    ).toHaveAttribute(
      "aria-busy",
      "false"
    );

    expect(
      screen.getByRole("table")
    ).toBeInTheDocument();
  });

  // ==========================================
  // ERROR STATE
  // ==========================================

  test("displays API error message", () => {
    renderTable({
      error: "Unable to load inventory.",
    });

    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Unable to load inventory."
    );
  });

  test("displays error status", () => {
    renderTable({
      error: "Network error",
    });

    expect(
      screen.getByText(
        "Could not load medicines."
      )
    ).toBeInTheDocument();
  });

  test("shows retry instructions on error", () => {
    renderTable({
      error: "Network error",
    });

    expect(
      screen.getByText(
        "Use the reload button above to try again."
      )
    ).toBeInTheDocument();
  });

  test("allows reloading after an error", async () => {
    const user = userEvent.setup();

    renderTable({
      error: "Server error",
    });

    expect(
      reloadButton()
    ).toBeEnabled();

    await user.click(reloadButton());

    expect(
      mockOnReload
    ).toHaveBeenCalledTimes(1);
  });

  test("hides table rows during error state", () => {
    renderTable({
      error: "Request failed",
    });

    expect(
      screen.queryByRole("table")
    ).not.toBeInTheDocument();

    expect(
      screen.queryByText("Paracetamol")
    ).not.toBeInTheDocument();
  });

  // ==========================================
  // EMPTY STATES
  // ==========================================

  test("shows empty state when total is zero", () => {
    renderTable({
      total: 0,
      count: 0,
    });

    expect(
      screen.getByRole("heading", {
        name: "No medicines found",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "No medicines are available."
      )
    ).toBeInTheDocument();
  });

  test("shows no matching results when filters remove all rows", () => {
    renderTable({
      total: 5,
      count: 0,
    });

    expect(
      screen.getByRole("heading", {
        name: "No matching medicines",
      })
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("table")
    ).not.toBeInTheDocument();
  });

  test("allows clearing filters from no matching results", async () => {
    const user = userEvent.setup();

    renderTable({
      total: 5,
      count: 0,
      hasFilters: false,
    });

    await user.click(
      screen.getByRole("button", {
        name: "Clear filters",
      })
    );

    expect(
      mockOnClearFilters
    ).toHaveBeenCalledTimes(1);
  });

  test("shows both clear-filter actions when filters are active and count is zero", () => {
    renderTable({
      total: 5,
      count: 0,
      hasFilters: true,
    });

    expect(
      screen.getAllByRole("button", {
        name: "Clear filters",
      })
    ).toHaveLength(2);
  });

  test("displays filtered count correctly", () => {
    renderTable({
      total: 10,
      count: 2,
    });

    expect(
      screen.getByText(
        "2 of 10 medicines"
      )
    ).toBeInTheDocument();
  });

  // ==========================================
  // STATE PRECEDENCE
  // ==========================================

  test("loading takes precedence over error", () => {
    renderTable({
      loading: true,
      error: "Old error",
    });

    expect(
      screen.getAllByText(
        "Loading medicines..."
      )
    ).toHaveLength(2);

    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  test("error takes precedence over empty results", () => {
    renderTable({
      error: "Request failed",
      total: 0,
      count: 0,
    });

    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(
      "Request failed"
    );

    expect(
      screen.queryByText(
        "No medicines found"
      )
    ).not.toBeInTheDocument();
  });

  // ==========================================
  // CUSTOM CONTENT
  // ==========================================

  test("renders custom table children", () => {
    renderTable(
      {
        total: 1,
        count: 1,
      },
      <tr>
        <td>Custom Medicine</td>
        <td>100</td>
        <td>Details</td>
      </tr>
    );

    expect(
      screen.getByText(
        "Custom Medicine"
      )
    ).toBeInTheDocument();

    expect(
      screen.queryByText(
        "Paracetamol"
      )
    ).not.toBeInTheDocument();
  });

  test("does not render row children during loading", () => {
    renderTable({
      loading: true,
    });

    expect(
      screen.queryByText(
        "Paracetamol"
      )
    ).not.toBeInTheDocument();
  });
});
