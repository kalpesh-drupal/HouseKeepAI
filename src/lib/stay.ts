/** Stay length and linen reminders from a report's check-in and check-out dates. */

export type StayDate = Date | string | null | undefined;

function startOfDay(value: StayDate) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function calendarDayKey(value: StayDate) {
  const day = startOfDay(value);
  if (!day) return "";
  return `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
}

/** Nights from check-in morning to check-out morning. */
export function stayNights(arrival: StayDate, departure: StayDate) {
  const start = startOfDay(arrival);
  const end = startOfDay(departure);
  if (!start || !end) return null;
  const nights = Math.round((end.getTime() - start.getTime()) / 86400000);
  return nights > 0 ? nights : null;
}

/** 1 on check-in day, 2 the next morning, and so on. */
export function stayDayNumber(arrival: StayDate, today = new Date()) {
  const start = startOfDay(arrival);
  const now = startOfDay(today);
  if (!start || !now) return null;
  const day = Math.round((now.getTime() - start.getTime()) / 86400000) + 1;
  return day >= 1 ? day : null;
}

/**
 * A stayover is a guest still in the room past arrival and before check-out.
 * Reports that print "Stayover" count even when a date is missing.
 */
export function isStayoverRoom(guestStatus: string | null | undefined, arrival: StayDate, departure: StayDate, today = new Date()) {
  if (guestStatus === "STAYOVER") return true;
  if (guestStatus !== "OCCUPIED") return false;
  const end = startOfDay(departure);
  const now = startOfDay(today);
  if (!end || !now) return true;
  return now < end;
}

/**
 * Extended stays of 7 or more days get a bedding change on day 4, then every 4 days
 * (day 8, 12, …) while that same guest is still a stayover.
 */
export function changeBeddingDue(
  guestStatus: string | null | undefined,
  arrival: StayDate,
  departure: StayDate,
  today = new Date()
) {
  const nights = stayNights(arrival, departure);
  if (nights == null || nights < 7) return false;
  if (!isStayoverRoom(guestStatus, arrival, departure, today)) return false;
  const day = stayDayNumber(arrival, today);
  if (day == null || day < 4 || day > nights) return false;
  return day % 4 === 0;
}
