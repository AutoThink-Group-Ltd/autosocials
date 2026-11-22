import { useCallback } from "react";
import { useUpgradeDialog, type LimitType } from "@/components/app/UpgradeDialog";

/** Legacy non-content plan limits no longer apply. Content is gated by credits. */
export function useUsageGate() {
  const { showUpgrade, upgradeDialogProps } = useUpgradeDialog();
  const checkLimit = useCallback((_type: LimitType, _currentUsage: number) => true, []);
  const isNearLimit = useCallback((_type: LimitType, _currentUsage: number) => false, []);
  return { checkLimit, isNearLimit, upgradeDialogProps, showUpgrade };
}
