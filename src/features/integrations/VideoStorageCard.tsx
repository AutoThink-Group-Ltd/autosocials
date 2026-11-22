import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { HardDrive } from "lucide-react";
import { getStorageUsage } from "@/lib/media.functions";

const gb = (b: number) => (b / 1024 ** 3).toFixed(b < 10 * 1024 ** 3 ? 1 : 0);

function Bar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return <div className="h-2 w-full overflow-hidden rounded-full bg-surface-subtle"><div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} /></div>;
}

export function VideoStorageCard() {
  const get = useServerFn(getStorageUsage);
  const { data, error, isLoading } = useQuery({ queryKey: ["video-storage-usage"], queryFn: () => get(), staleTime: 60_000 });
  return (
    <section className="rounded-[16px] border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2"><HardDrive className="h-4 w-4" /><h2 className="font-semibold">HyperFrames video storage</h2></div>
      {isLoading && <p className="text-[13px] text-muted-foreground">Loading…</p>}
      {error && <p className="text-[13px] text-muted-foreground">Couldn't reach video storage right now.</p>}
      {data && (
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-[13px]">Storage: <b>{gb(data.bytes)} GB</b> of 500 GB · {data.files} files</p>
            <Bar value={data.bytes} max={data.limitBytes} />
          </div>
          <div className="space-y-2">
            <p className="text-[13px]">Transcripts this month: <b>{Math.round(data.minutes)}</b> of {data.limitMinutes} minutes</p>
            <Bar value={data.minutes} max={data.limitMinutes} />
          </div>
        </div>
      )}
    </section>
  );
}
