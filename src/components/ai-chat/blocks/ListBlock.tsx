import type { ListBlock as ListBlockT } from "../types";

export function ListBlockView({ block }: { block: ListBlockT }) {
  const Tag = block.ordered ? "ol" : "ul";
  return (
    <Tag className={`${block.ordered ? "list-decimal" : "list-disc"} pl-5 space-y-1 text-sm text-foreground`}>
      {block.items.map((it, i) => <li key={i}>{it}</li>)}
    </Tag>
  );
}