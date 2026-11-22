import type { ActionsBlock as ActionsBlockT, ActionButton } from "../types";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

export type ActionHandler = (action: ActionButton) => void;

const variantMap: Record<ActionButton["variant"], "default" | "secondary" | "ghost" | "destructive"> = {
  primary: "default",
  secondary: "secondary",
  ghost: "ghost",
  destructive: "destructive",
};

export function ActionsBlockView({ block, onAction }: { block: ActionsBlockT; onAction?: ActionHandler }) {
  return (
    <div className="flex flex-wrap gap-2">
      {block.actions.map((a, i) => (
        <Button
          key={i}
          size="sm"
          variant={variantMap[a.variant]}
          onClick={() => onAction?.(a)}
          className="gap-1.5"
        >
          {a.requiresConfirmation && <ShieldAlert className="w-3.5 h-3.5" />}
          {a.label}
        </Button>
      ))}
    </div>
  );
}