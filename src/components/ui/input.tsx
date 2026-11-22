import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-[12px] border border-border-control bg-canvas text-ink shadow-[inset_0_1px_2px_hsl(var(--ink)/0.04)] transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground hover:border-ink/30 focus-visible:outline-hidden focus-visible:border-ink focus-visible:ring-4 focus-visible:ring-ink/10 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/15 disabled:cursor-not-allowed disabled:opacity-50 px-3.5 py-2 text-base file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
