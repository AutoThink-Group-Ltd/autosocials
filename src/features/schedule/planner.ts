export type PlannerView = "week" | "month" | "agenda";

/** Resolve a workspace wall-clock time, rejecting nonexistent DST times. */
export function workspaceInstant(
  day: string,
  clock: string,
  timezone: string,
): string {
  const target = new Date(`${day}T${clock}:00Z`).getTime();
  let guess = target;
  const localParts = (value: number) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(value));
  for (let step = 0; step < 4; step++) {
    const parts = localParts(guess);
    const get = (name: string) =>
      parts.find((part) => part.type === name)?.value;
    const wall = Date.parse(
      `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`,
    );
    if (wall === target) return new Date(guess).toISOString();
    guess += target - wall;
  }
  throw new Error(
    "This time does not exist because the clocks change. Choose another time.",
  );
}

/** Find the next valid workspace wall-clock slot, including DST transitions. */
export function nextWorkspaceSlot(
  timezone: string,
  slots: Array<{ day_of_week: number; hour: number }>,
  now = new Date(),
): string | null {
  const today = new Date(`${dateKey(now, timezone)}T12:00:00Z`);
  let closest: string | null = null;
  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date(today);
    day.setUTCDate(today.getUTCDate() + offset);
    for (const slot of slots) {
      if (day.getUTCDay() !== slot.day_of_week) continue;
      try {
        const instant = workspaceInstant(day.toISOString().slice(0, 10), `${String(slot.hour).padStart(2, "0")}:00`, timezone);
        if (Date.parse(instant) > now.getTime() + 60_000 && (!closest || instant < closest)) closest = instant;
      } catch { /* Skip a spring-forward hour that does not exist. */ }
    }
  }
  return closest;
}

/** Calendar keys use the workspace timezone, independent of the device timezone. */
export function dateKey(value: string | Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (name: string) =>
    parts.find((p) => p.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function dailyScheduleSlots(day: string, clock: string, timezone: string, count: number, excludeWeekends = false) {
  const date = new Date(`${day}T12:00:00Z`);
  return Array.from({ length: count }, () => {
    while (excludeWeekends && [0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
    const instant = workspaceInstant(date.toISOString().slice(0, 10), clock, timezone);
    date.setUTCDate(date.getUTCDate() + 1);
    return instant;
  });
}

/** Repair expired draft slots without moving posts that still have valid times. */
export function refreshExpiredSlots<T extends { scheduled_at: string }>(
  items: T[], timezone: string, daily: boolean, excludeWeekends: boolean, startNow: boolean, now: number,
): T[] {
  const threshold = now + 60_000;
  const expired = (item: T, index: number) =>
    !(startNow && index === 0) && Date.parse(item.scheduled_at) <= threshold;
  if (!items.some(expired)) return items;

  const reserved = new Set<number>();
  const reservedDays = new Set<string>();
  items.forEach((item, index) => {
    if (expired(item, index)) return;
    const time = startNow && index === 0 ? now : Date.parse(item.scheduled_at);
    reserved.add(time);
    reservedDays.add(dateKey(new Date(time), timezone));
  });
  const cursor = new Date(dateKey(new Date(now), timezone) + "T12:00:00Z");
  const updated = items.map((item, index) => {
    if (!expired(item, index)) return item;
    for (;;) {
      const day = cursor.toISOString().slice(0, 10);
      if (!(daily && reservedDays.has(day)) && !(excludeWeekends && [0, 6].includes(cursor.getUTCDay()))) {
        for (const clock of ["09:00", "13:00", "18:00"]) {
          const slot = workspaceInstant(day, clock, timezone);
          const time = Date.parse(slot);
          if (time <= threshold || reserved.has(time)) continue;
          reserved.add(time);
          reservedDays.add(day);
          return { ...item, scheduled_at: slot };
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  });
  const fixed = startNow ? updated.slice(0, 1) : [];
  return fixed.concat(updated.slice(fixed.length).sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at)));
}

/** Keep AI suggestions within daytime and evening hours. The first slot is the user's chosen start. */
export function daytimeScheduleSlots(proposed: string[], timezone: string): string[] {
  const slots = proposed.slice(0, 1);
  for (const slot of proposed.slice(1)) {
    const day = dateKey(slot, timezone);
    const morning = workspaceInstant(day, "09:00", timezone);
    const evening = workspaceInstant(day, "20:00", timezone);
    let next = slot;
    if (Date.parse(slot) < Date.parse(morning)) next = morning;
    if (Date.parse(slot) >= Date.parse(evening)) next = dailyScheduleSlots(day, "09:00", timezone, 2)[1]!;
    const previous = slots[slots.length - 1]!;
    if (Date.parse(next) <= Date.parse(previous)) next = dailyScheduleSlots(dateKey(previous, timezone), "09:00", timezone, 2)[1]!;
    slots.push(next);
  }
  return slots;
}

/** Move weekend slots forward in local calendar days, preserving order and posting time. */
export function weekdayScheduleSlots(slots: string[], timezone: string): string[] {
  let previous = "";
  return slots.map(slot => {
    const originalDay = dateKey(slot, timezone);
    const day = new Date(originalDay + "T12:00:00Z");
    if (previous && Date.parse(slot) <= Date.parse(previous)) {
      day.setTime(Date.parse(dateKey(previous, timezone) + "T12:00:00Z"));
      day.setUTCDate(day.getUTCDate() + 1);
    }
    while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
    const targetDay = day.toISOString().slice(0, 10);
    const clock = new Date(slot).toLocaleTimeString("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    previous = targetDay === originalDay ? slot : workspaceInstant(targetDay, clock, timezone);
    return previous;
  });
}

export function calendarDays(cursor: string, view: PlannerView): string[] {
  const date = new Date(`${cursor}T12:00:00Z`);
  const start = new Date(date);
  if (view === "month") start.setUTCDate(1);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return Array.from({ length: view === "month" ? 42 : 7 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

export function shiftCursor(
  cursor: string,
  view: PlannerView,
  amount: number,
): string {
  const date = new Date(`${cursor}T12:00:00Z`);
  if (view === "month") {
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + amount);
  } else date.setUTCDate(date.getUTCDate() + amount * 7);
  return date.toISOString().slice(0, 10);
}
