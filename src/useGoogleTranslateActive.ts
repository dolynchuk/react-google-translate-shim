import { useSyncExternalStore } from "react";
import { isGoogleTranslateActive } from "./core";

const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (
    !observer &&
    typeof MutationObserver !== "undefined" &&
    typeof document !== "undefined"
  ) {
    observer = new MutationObserver(() => {
      for (const notify of listeners) notify();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && observer) {
      observer.disconnect();
      observer = null;
    }
  };
}

function getSnapshot() {
  return isGoogleTranslateActive();
}

function getServerSnapshot() {
  return false;
}

/**
 * Reactively tracks whether Google Translate is currently translating the page,
 * re-rendering when it turns on or off. Use it to surface translation-aware UI —
 * e.g. a hint next to a form that edits may reset while translation is on.
 *
 * ```tsx
 * function TranslateFormHint() {
 *   const translating = useGoogleTranslateActive();
 *   if (!translating) return null;
 *   return <p role="status">Translation is on — turn it off while editing to be safe.</p>;
 * }
 * ```
 */
export function useGoogleTranslateActive() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
