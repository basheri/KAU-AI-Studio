import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/**
 * Debounced autosave for draft editors. `snapshot` is a stable string of the value to save;
 * saves run one at a time, and a change made during a save is saved right after it.
 */
export function useAutosave(
  snapshot: string,
  {
    enabled,
    dirty,
    save,
    delay = 1500,
  }: {
    enabled: boolean;
    dirty: boolean;
    save: () => Promise<unknown>;
    delay?: number;
  },
) {
  const [state, setState] = useState<AutosaveState>("idle");
  const [error, setError] = useState<unknown>(null);
  const saveRef = useRef(save);
  const running = useRef(false);
  const again = useRef(false);
  useEffect(() => {
    saveRef.current = save;
  });

  const run = useCallback(async () => {
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setState("saving");
    try {
      await saveRef.current();
      setError(null);
      setState("saved");
    } catch (e) {
      setError(e);
      setState("error");
    } finally {
      running.current = false;
      if (again.current) {
        again.current = false;
        void run();
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled || !dirty) return;
    setState((s) => (s === "saving" ? s : "dirty"));
    const id = setTimeout(() => void run(), delay);
    return () => clearTimeout(id);
  }, [snapshot, enabled, dirty, run, delay]);

  return { state, error, retry: run };
}
