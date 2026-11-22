export type ResearchDateRange = 'all' | 'today' | '7' | '30';

export function matchesResearchDate(value: string | null | undefined, range: ResearchDateRange, now = new Date()): boolean {
  if (range === 'all') return true;
  if (!value) return false;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) : new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (range === 'today' ? 0 : Number(range) - 1));
  return date >= start && date <= now;
}

export function ResearchDatePills({ value, onChange }: { value: ResearchDateRange; onChange: (value: ResearchDateRange) => void }) {
  const options: [ResearchDateRange, string][] = [['all', 'All time'], ['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days']];
  return <div className="space-y-2"><p className="text-xs font-semibold text-text-secondary">POSTED</p><div role="group" aria-label="Filter posts by date" className="flex flex-wrap gap-2">{options.map(([range, label]) => <button key={range} type="button" aria-pressed={value === range} onClick={() => onChange(range)} className={`rounded-xl border border-border-control px-3 py-2 text-sm font-semibold ${value === range ? 'bg-ink text-inverse' : 'bg-surface text-ink'}`}>{label}</button>)}</div></div>;
}
