import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[88px] w-full rounded-[12px] border border-border-control bg-canvas text-ink shadow-[inset_0_1px_2px_hsl(var(--ink)/0.04)] transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground hover:border-ink/30 focus-visible:outline-hidden focus-visible:border-ink focus-visible:ring-4 focus-visible:ring-ink/10 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/15 disabled:cursor-not-allowed disabled:opacity-50 resize-none px-4 py-3 text-[15px] leading-relaxed",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
