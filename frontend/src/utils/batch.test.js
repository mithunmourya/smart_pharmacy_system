
import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";

import {
  MAX_STOCK,
  toDateInput,
  todayDate,
  tomorrowDate,
  priceToCents,
  formatBatchDate,
  daysToExpiry,
  expiryLabel,
  formatPrice,
} from "./batch";

// ============================================
// TEST DATE SETUP
// ============================================

beforeEach(() => {
  vi.useFakeTimers();

  // Local midday avoids timezone-related
  // midnight boundary differences.
  vi.setSystemTime(
    new Date(2026, 10, 4, 12, 0, 0)
  );
});

afterEach(() => {
  vi.useRealTimers();
});

// ============================================
// 1. MAXIMUM STOCK
// ============================================

describe("MAX_STOCK", () => {
  test("is a positive integer", () => {
    expect(Number.isInteger(MAX_STOCK)).toBe(
      true
    );

    expect(MAX_STOCK).toBeGreaterThan(0);
  });
});

// ============================================
// 2. DATE INPUT CONVERSION
// ============================================

describe("toDateInput", () => {
  test("preserves ISO date-only strings", () => {
    expect(
      toDateInput("2027-03-15")
    ).toBe("2027-03-15");
  });

  test("extracts date from an ISO timestamp", () => {
    expect(
      toDateInput(
        "2027-03-15T00:00:00.000Z"
      )
    ).toBe("2027-03-15");
  });
});

// ============================================
// 3. TODAY AND TOMORROW
// ============================================

describe("todayDate and tomorrowDate", () => {
  test("returns today in YYYY-MM-DD format", () => {
    expect(todayDate()).toBe("2026-11-04");
  });

  test("returns tomorrow in YYYY-MM-DD format", () => {
    expect(tomorrowDate()).toBe(
      "2026-11-05"
    );
  });

  test("tomorrow is later than today", () => {
    expect(
      tomorrowDate() > todayDate()
    ).toBe(true);
  });
});

// ============================================
// 4. PRICE TO CENTS
// ============================================

describe("priceToCents", () => {
  test("converts whole amount to minor units", () => {
    expect(priceToCents(10)).toBe(1000);
  });

  test("converts decimal amount to minor units", () => {
    expect(priceToCents(12.5)).toBe(1250);
  });

  test("accepts numeric strings", () => {
    expect(priceToCents("9.99")).toBe(999);
  });

  test("converts zero correctly", () => {
    expect(priceToCents("0")).toBe(0);
  });

  
test("converts a valid two-decimal price to cents", () => {
  expect(priceToCents(0.30)).toBe(30);
});

test("rejects floating-point values with excessive decimal precision", () => {
  expect(priceToCents(0.1 + 0.2)).toBeNull();
});

});

// ============================================
// 5. EXPIRY CALCULATIONS
// ============================================

describe("daysToExpiry", () => {
  test("returns zero for today's expiry", () => {
    expect(
      daysToExpiry(todayDate())
    ).toBe(0);
  });

  test("returns one for tomorrow", () => {
    expect(
      daysToExpiry(tomorrowDate())
    ).toBe(1);
  });

  test("returns positive days for future expiry", () => {
    expect(
      daysToExpiry("2026-11-14")
    ).toBeGreaterThan(0);
  });

  test("returns negative days for expired batch", () => {
    expect(
      daysToExpiry("2026-11-01")
    ).toBeLessThan(0);
  });
});

// ============================================
// 6. EXPIRY LABEL
// ============================================

describe("expiryLabel", () => {
  test("returns a display label for today's expiry", () => {
    const label = expiryLabel(todayDate());

    expect(label).toEqual(
      expect.any(String)
    );

    expect(label.length).toBeGreaterThan(0);
  });

  test("returns a display label for expired batch", () => {
    const label = expiryLabel(
      "2026-11-01"
    );

    expect(label).toEqual(
      expect.any(String)
    );

    expect(label.length).toBeGreaterThan(0);
  });

  test("distinguishes expired and future batches", () => {
    const expired = expiryLabel(
      "2026-11-01"
    );

    const future = expiryLabel(
      "2026-12-01"
    );

    expect(expired).not.toBe(future);
  });
});

// ============================================
// 7. DATE DISPLAY
// ============================================

describe("formatBatchDate", () => {
  test("formats an ISO date as readable text", () => {
    const result = formatBatchDate(
      "2027-03-15"
    );

    expect(result).toEqual(
      expect.any(String)
    );

    expect(result).toContain("2027");
  });

  test("formats a created-at timestamp", () => {
    const result = formatBatchDate(
      "2027-05-01T10:30:00.000Z"
    );

    expect(result).toContain("2027");
  });
});

// ============================================
// 8. PRICE DISPLAY
// ============================================

describe("formatPrice", () => {
  test("returns a formatted price string", () => {
    expect(
      formatPrice(12.5)
    ).toEqual(expect.any(String));
  });

  test("formats two decimal places", () => {
    const result = formatPrice(12.5);

    expect(result).toContain("12.50");
  });

  test("formats zero amount", () => {
    const result = formatPrice(0);

    expect(result).toContain("0.00");
  });

  test("handles numeric string values", () => {
    const result = formatPrice("25.50");

    expect(result).toContain("25.50");
  });
});
