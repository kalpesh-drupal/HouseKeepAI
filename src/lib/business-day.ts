/** Hotel day runs until 3:00 AM, then the next business date opens. */

export const DAY_ROLLOVER_HOUR = 3;
export const DEFAULT_HOTEL_TIMEZONE = "America/Chicago";

export type ReportPeriod = "day" | "month" | "year";

type ZonedParts = { year: number; month: number; day: number; hour: number };

export function hotelTimezone(timezone?: string | null) {
  const zone = timezone || DEFAULT_HOTEL_TIMEZONE;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return DEFAULT_HOTEL_TIMEZONE;
  }
}

function zonedParts(now: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
  };
}

/** Noon UTC for a calendar date, so the stored day does not shift across timezones. */
export function noonUtc(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function businessDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function isBeforeBusinessDate(a: Date, b: Date) {
  return businessDateKey(a) < businessDateKey(b);
}

/** Business date for an instant. Before 3:00 AM hotel time, this is still the previous date. */
export function businessDate(now = new Date(), timezone?: string | null) {
  const zone = hotelTimezone(timezone);
  const parts = zonedParts(now, zone);
  const date = noonUtc(parts.year, parts.month, parts.day);
  if (parts.hour < DAY_ROLLOVER_HOUR) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date;
}

export function businessDateFromKey(key: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = noonUtc(year, month, day);
  if (businessDateKey(date) !== key) return null;
  return date;
}

/** Inclusive start and exclusive end of stored business dates (noon UTC). */
export function periodBusinessRange(anchor: Date, period: ReportPeriod) {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const day = anchor.getUTCDate();
  if (period === "day") {
    return { from: noonUtc(year, month + 1, day), to: noonUtc(year, month + 1, day + 1) };
  }
  if (period === "month") {
    return { from: noonUtc(year, month + 1, 1), to: noonUtc(year, month + 2, 1) };
  }
  return { from: noonUtc(year, 1, 1), to: noonUtc(year + 1, 1, 1) };
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(year: number, month: number, day: number, hour: number, timeZone: string) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  return new Date(guess.getTime() - timeZoneOffsetMs(guess, timeZone));
}

/** Wall-clock range covering those business dates, from 3:00 AM to the next 3:00 AM. */
export function periodInstantRange(anchor: Date, period: ReportPeriod, timezone?: string | null) {
  const zone = hotelTimezone(timezone);
  const { from, to } = periodBusinessRange(anchor, period);
  return {
    start: zonedDateTimeToUtc(from.getUTCFullYear(), from.getUTCMonth() + 1, from.getUTCDate(), DAY_ROLLOVER_HOUR, zone),
    end: zonedDateTimeToUtc(to.getUTCFullYear(), to.getUTCMonth() + 1, to.getUTCDate(), DAY_ROLLOVER_HOUR, zone),
  };
}

export function formatBusinessDate(value: Date, period: ReportPeriod = "day") {
  if (period === "year") return String(value.getUTCFullYear());
  if (period === "month") {
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(value);
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
