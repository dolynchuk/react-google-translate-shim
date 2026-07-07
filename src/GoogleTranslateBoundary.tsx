import { Fragment, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  patchDomForGoogleTranslate,
  type GoogleTranslateShimOptions,
} from "./core";

let remountGeneration = 0;
let remountScheduled = false;
const listeners = new Set<() => void>();

function scheduleRemount() {
  if (remountScheduled) return;
  remountScheduled = true;
  // Google Translate rewrites many nodes in one pass, so a single user action
  // can trip several failed mutations. Coalesce them into one remount.
  requestAnimationFrame(() => {
    remountScheduled = false;
    remountGeneration += 1;
    listeners.forEach((listener) => listener());
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return remountGeneration;
}

export interface GoogleTranslateBoundaryProps
  extends GoogleTranslateShimOptions {
  children: ReactNode;
}

/**
 * Drop this around your app to survive Google Translate. It keeps your normal
 * `createRoot(...).render(...)` and app tree untouched:
 *
 * ```tsx
 * createRoot(document.getElementById("root")!).render(
 *   <GoogleTranslateBoundary>
 *     <App />
 *   </GoogleTranslateBoundary>
 * );
 * ```
 *
 * When Google Translate corrupts the DOM and a mutation would crash React, the
 * boundary discards the corrupted subtree and remounts its children from
 * scratch — a full re-render with no reconciliation against DOM React no longer
 * recognizes — instead of letting the app go white.
 */
export function GoogleTranslateBoundary({
  children,
  debug = false,
}: GoogleTranslateBoundaryProps) {
  // Install the DOM patch exactly once, before children mount. useState's lazy
  // initializer runs on first render only; the patch itself is idempotent.
  useState(() => {
    patchDomForGoogleTranslate(scheduleRemount, { debug });
    return null;
  });

  const generation = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return <Fragment key={generation}>{children}</Fragment>;
}
