import { Input } from "@/components/ui/input";

export function matchesPostSearch(post: { title?: string | null; caption: string; platform: string; format: string }, query: string) {
  const text = [post.title, post.caption, post.platform, post.format].join(" ").toLowerCase();
  return query.toLowerCase().trim().split(/\s+/).every(word => text.includes(word));
}

export function PostSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Input type="search" aria-label="Search posts" placeholder="Search by title, caption or channel"
    className="w-full sm:max-w-sm" value={value} onChange={event => onChange(event.target.value)} />;
}
