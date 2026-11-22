import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { MutableRefObject, ReactNode } from "react";
import PublishingComposerPage from "@/pages/app/PublishingComposerPage";

interface Props {
  children?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId?: string | null;
  initialScheduledAt?: Date | null;
  onPostIdChange?: (id: string) => void;
  flushRef?: MutableRefObject<(() => Promise<void>) | null>;
}

export function ComposerDrawer({ open, onOpenChange, postId = null, initialScheduledAt = null, onPostIdChange, flushRef, children }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl lg:max-w-5xl p-0 overflow-y-auto has-[[data-scheduled-drawer]]:[&>button.absolute]:hidden"
      >
        {open && (
          <PublishingComposerPage
            embedded
            postIdProp={postId}
            initialScheduledAt={initialScheduledAt}
            onClose={() => onOpenChange(false)}
            {...(onPostIdChange !== undefined ? { onPostIdChange } : {})}
            {...(flushRef !== undefined ? { flushRef } : {})}
          />
        )}
        {open && children}
      </SheetContent>
    </Sheet>
  );
}
