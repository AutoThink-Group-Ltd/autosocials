import { useRef, useState } from "react";
import { Clock3 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { enGB } from "date-fns/locale/en-GB";
import { dateKey } from "./planner";

type PickerValue = { day: string; clock: string };
const digits = (count: number) => Array.from({ length: count }, (_, index) => String(index).padStart(2, "0"));
const hours = digits(24);
const minutes = digits(60);

export function ScheduleDateTimePicker({ day, clock, timezone, onChange }: PickerValue & {
  timezone: string;
  onChange: (value: PickerValue) => void;
}) {
  // The calendar represents a wall date. The parent resolves the chosen time in the posting timezone on Apply.
  const parsedDay = new Date(day + "T12:00:00");
  const selected = Number.isFinite(parsedDay.getTime()) ? parsedDay : undefined;
  const today = new Date(dateKey(new Date(), timezone) + "T12:00:00");
  const [hour, minute] = (clock || "09:00").split(":");
  const [editing, setEditing] = useState<"Hour" | "Minute" | null>(null);
  const hourButton = useRef<HTMLButtonElement>(null);
  const minuteButton = useRef<HTMLButtonElement>(null);
  function closeTimeGrid() {
    (editing === "Hour" ? hourButton : minuteButton).current?.focus();
    setEditing(null);
  }
  const segmentClass = "cursor-pointer rounded-lg border border-primary-foreground/30 bg-primary px-1.5 aria-expanded:bg-primary-foreground/15 text-center font-display text-3xl font-semibold leading-tight tabular-nums text-primary-foreground hover:bg-primary-foreground/15 focus-visible:outline-2 focus-visible:outline-primary-foreground";
  return <div className="overflow-hidden rounded-2xl border border-border-control">
    <div className="flex flex-wrap items-center justify-between gap-3 bg-primary px-4 py-3 text-primary-foreground">
      <div><div className="flex items-center gap-1.5 text-xs font-medium"><Clock3 className="size-3.5" />{timezone === "Europe/London" ? "UK time" : timezone.replaceAll("_", " ")}</div>
        <p className="mt-1 font-display text-lg font-semibold">{selected ? format(selected, "EEE, d MMM yyyy", { locale: enGB }) : "Choose a date"}</p>
      </div>
      <div className="flex items-center gap-0.5" role="group" aria-label="Posting time, 24-hour clock">
        <button ref={hourButton} type="button" aria-label={`Choose hour, ${hour}`} aria-expanded={editing === "Hour"} className={segmentClass} onClick={() => setEditing(editing === "Hour" ? null : "Hour")}>{hour}</button>
        <span aria-hidden="true" className="text-3xl">:</span>
        <button ref={minuteButton} type="button" aria-label={`Choose minute, ${minute}`} aria-expanded={editing === "Minute"} className={segmentClass} onClick={() => setEditing(editing === "Minute" ? null : "Minute")}>{minute}</button>
      </div>
    </div>
    {editing ? <div className="bg-background p-3" onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeTimeGrid(); }
    }}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">{editing === "Hour" ? "Choose hour" : "Choose minute"}</span>
        <button type="button" className="rounded-md px-2 py-1 text-xs underline underline-offset-2" onClick={closeTimeGrid}>Back to date</button>
      </div>
      <div role="group" aria-label={editing === "Hour" ? "Hours" : "Minutes"} className="grid max-h-60 grid-cols-6 gap-1 overflow-y-auto p-1">
        {(editing === "Hour" ? hours : minutes).map(value => <button type="button" key={value}
          aria-pressed={value === (editing === "Hour" ? hour : minute)}
          className="h-8 rounded-md text-sm font-medium tabular-nums hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          onClick={() => { onChange({ day, clock: editing === "Hour" ? value + ":" + minute : hour + ":" + value }); closeTimeGrid(); }}>{value}</button>)}
      </div>
    </div> : <Calendar mode="single" required selected={selected} defaultMonth={selected ?? today} today={today} disabled={{ before: today }} locale={enGB} weekStartsOn={1}
      onSelect={date => onChange({ day: format(date, "yyyy-MM-dd"), clock })}
      className="bg-background p-3" classNames={{
        months: "relative w-full", month: "w-full",
        month_caption: "flex h-9 items-center justify-center px-10",
        caption_label: "truncate font-display text-base font-semibold",
        nav: "pointer-events-none absolute inset-x-0 top-0 z-10 flex h-9 items-center justify-between",
        button_previous: "pointer-events-auto grid size-8 place-items-center rounded-lg border hover:bg-muted focus-visible:outline-2",
        button_next: "pointer-events-auto grid size-8 place-items-center rounded-lg border hover:bg-muted focus-visible:outline-2",
        month_grid: "mt-2 w-full table-fixed border-collapse",
        weekdays: "table-row", weekday: "h-7 text-center text-xs font-medium text-muted-foreground",
        week: "table-row", day: "p-0 text-center align-middle",
        day_button: "mx-auto grid h-8 w-full max-w-10 place-items-center rounded-lg text-sm tabular-nums hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default",
        selected: "[&_button]:bg-primary [&_button]:font-bold [&_button]:text-primary-foreground",
        today: "[&_button]:underline [&_button]:underline-offset-4",
      }} />}
    <div aria-label="Quick posting times" role="group" className="grid grid-cols-3 gap-2 border-t bg-surface-subtle p-3">
      {["09:00", "13:00", "18:00"].map(value => <button type="button" key={value} aria-pressed={clock === value}
        className="rounded-lg border border-border-control bg-background py-2 text-sm font-medium tabular-nums hover:border-primary aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
        onClick={() => { setEditing(null); onChange({ day, clock: value }); }}>{value}</button>)}
    </div>
  </div>;
}
