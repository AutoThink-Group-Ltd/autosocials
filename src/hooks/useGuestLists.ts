import { useState, useEffect, useCallback } from "react";

export interface GuestCreator {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  platform: string;
  follower_count: number | null;
  engagement_rate: number | null;
  thumbnail_url: string | null;
  niches: string[] | null;
}

const STORAGE_KEY = "autosocials_guest_list";

function readStore(): GuestCreator[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeStore(creators: GuestCreator[]) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(creators));
}

// Custom event for cross-component sync
const SYNC_EVENT = "guest-list-change";
function emitSync() {
  window.dispatchEvent(new Event(SYNC_EVENT));
}

export function useGuestLists() {
  const [creators, setCreators] = useState<GuestCreator[]>(readStore);

  // Listen for changes from other hook instances
  useEffect(() => {
    const handler = () => setCreators(readStore());
    window.addEventListener(SYNC_EVENT, handler);
    return () => window.removeEventListener(SYNC_EVENT, handler);
  }, []);

  const addCreator = useCallback((creator: GuestCreator) => {
    const current = readStore();
    if (current.some((c) => c.id === creator.id)) return;
    const updated = [...current, creator];
    writeStore(updated);
    setCreators(updated);
    emitSync();
  }, []);

  const removeCreator = useCallback((id: string) => {
    const current = readStore();
    const updated = current.filter((c) => c.id !== id);
    writeStore(updated);
    setCreators(updated);
    emitSync();
  }, []);

  const isInList = useCallback((id: string) => {
    return readStore().some((c) => c.id === id);
  }, []);

  const clearAll = useCallback(() => {
    writeStore([]);
    setCreators([]);
    emitSync();
  }, []);

  return {
    creators,
    count: creators.length,
    addCreator,
    removeCreator,
    isInList,
    clearAll,
  };
}
