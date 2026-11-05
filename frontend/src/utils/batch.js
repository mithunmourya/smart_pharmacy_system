export const MAX_STOCK = 2147483647;

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function todayDate() {
  return localDateString(new Date());
}

export function tomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return localDateString(date);
}

export function toDateInput(value) {
  if (!value) return "";

  const text = String(value);

  // Preserve date-only values without converting them to UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : localDateString(date);
}

export function formatBatchDate(value) {
  const dateText = toDateInput(value);

  if (!dateText) return "—";

  const [year, month, day] = dateText.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function daysToExpiry(value) {
  const expiry = toDateInput(value);

  if (!expiry) return null;

  const [year, month, day] = expiry.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = todayDate()
    .split("-")
    .map(Number);

  return Math.round(
    (Date.UTC(year, month - 1, day) -
      Date.UTC(todayYear, todayMonth - 1, todayDay)) /
      86400000
  );
}

export function expiryLabel(value) {
  const days = daysToExpiry(value);

  if (days === null) return "Unknown";
  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days <= 10) return "Expiring soon";
  return "Not expiring soon";
}

export function priceToCents(value) {
  const text = String(value).trim();

  // DECIMAL(10,2): at most eight digits before the decimal.
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) return null;

  const [whole, fraction = ""] = text.split(".");

  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function formatPrice(value) {
  const amount = Number(value);

  return Number.isFinite(amount)
    ? amount.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "—";
}