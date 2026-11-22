import { dateKey, workspaceInstant } from "./planner";

type Booking = { scheduled_at: string; account_ids: string[] };
type Options = { timezone: string; daily: boolean; excludeWeekends: boolean; startNow: boolean };
const MINUTE = 60_000;
const HORIZON_DAYS = 366;

/** Fit proposed times around bookings for the same destinations, without changing item order. */
export function fitScheduleSlots(slots: string[], accountsByItem: string[][], occupied: Booking[], options: Options): string[] {
  if (slots.length !== accountsByItem.length) throw new Error("Each scheduled item must have its own destinations.");
  const bookings = occupied.flatMap(booking => {
    const time = Date.parse(booking.scheduled_at);
    return Number.isFinite(time) && booking.account_ids.length ? [{ time, accounts: new Set(booking.account_ids) }] : [];
  });
  const result: string[] = [];
  const batchDays = new Set<string>();
  const shares = (accounts: Set<string>, other: Set<string>) => [...accounts].some(id => other.has(id));
  const weekday = (day: string) => ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
  const addDay = (day: string, offset: number) => {
    const date = new Date(`${day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const localClock = (time: number) => new Intl.DateTimeFormat("en-GB", { timeZone: options.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(time));
  for (let index = 0; index < slots.length; index++) {
    const proposed = Date.parse(slots[index]!);
    if (!Number.isFinite(proposed)) throw new Error("A proposed schedule time is invalid.");
    const accounts = new Set(accountsByItem[index]!.filter(Boolean));
    const relevant = bookings.filter(booking => shares(accounts, booking.accounts));
    const previous = index ? Date.parse(result[index - 1]!) : -Infinity;
    if (options.startNow && index === 0) {
      if (relevant.some(booking => Math.floor(booking.time / MINUTE) === Math.floor(proposed / MINUTE))) {
        throw new Error("A selected destination already has a post scheduled for this minute. Choose another time.");
      }
      result.push(new Date(proposed).toISOString());
      batchDays.add(dateKey(new Date(proposed), options.timezone));
      if (accounts.size) bookings.push({ time: proposed, accounts });
      continue;
    }
    const start = Math.max(proposed, previous);
    const firstDay = dateKey(new Date(start), options.timezone);
    const clock = localClock(proposed);
    let found: number | undefined;
    for (let offset = 0; offset <= HORIZON_DAYS && found === undefined; offset++) {
      const day = addDay(firstDay, offset);
      if (options.excludeWeekends && !weekday(day)) continue;
      if (options.daily && batchDays.has(day)) continue;
        let morning: number;
        let evening: number;
        try {
          morning = Date.parse(workspaceInstant(day, "09:00", options.timezone));
          evening = Date.parse(workspaceInstant(day, "20:00", options.timezone));
        } catch { continue; }
        if (options.daily) {
          try {
            const preferred = Date.parse(workspaceInstant(day, clock, options.timezone));
            if (preferred >= start && relevant.every(booking => Math.abs(preferred - booking.time) >= 120 * MINUTE)) found = preferred;
          } catch { /* Search daytime when the chosen clock does not exist. */ }
        }
        let candidate = Math.ceil(Math.max(start, morning) / MINUTE) * MINUTE;
        while (found === undefined && candidate < evening) {
          const conflicts = relevant.filter(booking => Math.abs(candidate - booking.time) < 120 * MINUTE);
          if (!conflicts.length) { found = candidate; break; }
          candidate = Math.ceil(Math.max(...conflicts.map(booking => booking.time + 120 * MINUTE)) / MINUTE) * MINUTE;
        }
    }
    if (found === undefined) throw new Error("Could not find a free schedule time within one year. Choose a different start or destinations.");
    result.push(new Date(found).toISOString());
    batchDays.add(dateKey(new Date(found), options.timezone));
    if (accounts.size) bookings.push({ time: found, accounts });
  }
  return result;
}
