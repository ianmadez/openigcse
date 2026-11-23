"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Device-local draft storage.
 *
 * Term plans, marking sheets and focus settings are written to the database
 * once the learner record is seeded. Until then they persist on this device so
 * the screens stay usable, and the interface says exactly that.
 */
export function useLocalDraft<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setValue(JSON.parse(raw) as T);
    } catch {
      // A blocked or corrupt store leaves the initial value in place.
    } finally {
      setLoaded(true);
    }
  }, [key]);

  const save = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
        setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      } catch {
        setSavedAt(null);
      }
    },
    [key],
  );

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage failures; the in-memory value is reset regardless.
    }
    setValue(initial);
    setSavedAt(null);
  }, [initial, key]);

  return { value, setValue, save, reset, savedAt, loaded };
}
