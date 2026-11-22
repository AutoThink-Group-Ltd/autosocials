import { useCallback, useEffect, useState } from "react";

/**
 * Lightweight feature-flag hook backed by localStorage.
 * - Default value applies on first read.
 * - Stays in sync across tabs via the `storage` event.
 * - Returns a setter for in-app toggles.
 *
 * Flag keys are prefixed with `flag.` to avoid collision with other
 * localStorage entries (e.g. `autosocials.sidebarCollapsed`).
 */
const STORAGE_PREFIX = "flag.";

export function useFeatureFlag(name: string, defaultValue = false): [boolean, (v: boolean) => void] {
  const key = `${STORAGE_PREFIX}${name}`;
  const read = useCallback((): boolean => {
    if (typeof window === "undefined") return defaultValue;
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return raw === "1" || raw === "true";
  }, [key, defaultValue]);

  const [enabled, setEnabled] = useState<boolean>(read);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setEnabled(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, read]);

  const set = useCallback(
    (v: boolean) => {
      localStorage.setItem(key, v ? "1" : "0");
      setEnabled(v);
    },
    [key],
  );

  return [enabled, set];
}