import { useSyncExternalStore } from "react";

let recoveryCount = 0;
const listeners = new Set<() => void>();

/**
 * After this many rebuilds in a session the boundary stops remounting. A remount
 * hands the translator fresh untranslated DOM, which it rewrites immediately, so
 * an aggressive translator would otherwise loop forever. Once the cap is hit the
 * patched `removeChild` / `insertBefore` keep swallowing conflicts instead — the
 * page survives without further resets.
 */
const MAX_RECOVERIES = 3;

/** Whether the session has hit the remount cap; see {@link MAX_RECOVERIES}. */
export function isRecoveryLimitReached() {
  return recoveryCount >= MAX_RECOVERIES;
}

/** Reset the running recovery count. Primarily for tests and teardown. */
export function resetRecoveryCount() {
  recoveryCount = 0;
}

/**
 * Bump the global recovery count and notify subscribers. Called once per rebuild
 * cycle by the boundary — internal, not part of the public surface.
 */
export function notifyRecovery() {
  recoveryCount += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return recoveryCount;
}

function getServerSnapshot() {
  return 0;
}

export interface GoogleTranslateRecovery {
  /**
   * How many times the app has rebuilt to recover from a Google Translate
   * conflict this session. Starts at 0; increments on each recovery.
   */
  count: number;
}

/**
 * Re-renders every time the app rebuilds to recover from a Google Translate
 * conflict, returning the running count. Drive your own notification from it:
 *
 * ```tsx
 * const { count } = useGoogleTranslateRecovery();
 * useEffect(() => {
 *   if (count) toast("Recovered from a translation glitch — re-check unsaved input.");
 * }, [count]);
 * ```
 *
 * Place consumers OUTSIDE your `<GoogleTranslateBoundary>` so they aren't
 * remounted by the very recovery they report on.
 */
export function useGoogleTranslateRecovery(): GoogleTranslateRecovery {
  const count = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { count };
}
