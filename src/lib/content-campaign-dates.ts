export type CalendarOptions = { start_date?: string | undefined; end_date?: string | undefined; cadence?: "daily" | "weekdays" | "weekly" | undefined };

export function campaignDates(brief: string, today: string, count?: number, options: CalendarOptions = {}): string[] {
  const [year, month, day] = today.split("-").map(Number) as [number, number, number];
  const restOfMonth = /rest of (?:the |this )?month/i.test(brief);
  const explicitCount = /\b\d+\s+(?:posts?|ideas?|assets?)\b/i.test(brief);
  const start = (restOfMonth ? undefined : options.start_date) ?? new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const end = restOfMonth ? monthEnd : options.end_date;
  const cadence = options.cadence ?? (/\bweekdays?\b/i.test(brief) ? "weekdays" : "daily");
  const startDate = new Date(start + "T00:00:00Z");
  const endDate = end ? new Date(end + "T00:00:00Z") : undefined;
  if (!Number.isFinite(startDate.getTime()) || startDate.toISOString().slice(0, 10) !== start || (end && (!endDate || !Number.isFinite(endDate.getTime()) || endDate.toISOString().slice(0, 10) !== end))) throw new Error("Please provide valid calendar dates.");
  const dates: string[] = [];
  const target = end && (!count || (restOfMonth && !explicitCount)) ? 90 : count ?? 5;
  for (let offset = 0; offset < 370 && dates.length < target; offset += cadence === "weekly" ? 7 : 1) {
    const date = new Date(startDate.getTime() + offset * 86400000);
    if (endDate && date > endDate) break;
    if (cadence !== "weekdays" || (date.getUTCDay() !== 0 && date.getUTCDay() !== 6)) dates.push(date.toISOString().slice(0, 10));
  }
  if (!dates.length) throw new Error("There are no days remaining in this month. Please choose another date range.");
  if (endDate && dates.length === 90 && new Date(dates[89]! + "T00:00:00Z") < endDate) throw new Error("This calendar exceeds 90 posts. Please choose a shorter range.");
  return dates;
}
