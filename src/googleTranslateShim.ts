import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

const LOG_PREFIX = "[react-google-translate-shim]";

export interface GoogleTranslateShimOptions {
  /**
   * Log every detected conflict and recovery remount to the console. Handy
   * while verifying the shim is doing its job. Defaults to `false`.
   */
  debug?: boolean;
}

/**
 * Mounts a React app and keeps it alive when Google Translate rewrites the DOM.
 *
 * Google Translate wraps text nodes in `<font>` elements. React keeps direct
 * references to the original text nodes, so its next `removeChild` /
 * `insertBefore` on one of them throws `NotFoundError` mid-commit and takes the
 * whole app down (https://github.com/facebook/react/issues/11538).
 *
 * When such a conflict is detected this discards the corrupted tree entirely and
 * re-renders from scratch, rather than reconciling against DOM React no longer
 * recognizes.
 *
 * @param container Element to mount into, e.g. `document.getElementById("root")`.
 * @param render Thunk returning your app tree. Called on first mount and again
 *   on every recovery remount.
 * @returns A disposer that unmounts the app and stops managing the container.
 */
export function initGoogleTranslateShim(
  container: HTMLElement,
  render: () => ReactNode,
  options: GoogleTranslateShimOptions = {}
) {
  const log = createLogger(options.debug ?? false);
  let root = createRoot(container);
  let rerenderScheduled = false;
  let rerenderCount = 0;
  let disposed = false;

  const fullRerender = () => {
    if (disposed) return;
    rerenderCount += 1;
    log.warn(
      `full re-render #${rerenderCount} — tearing down and remounting instead of reconciling`
    );
    try {
      root.unmount();
    } catch (error) {
      // unmount walks the same reparented nodes and can throw again; the hard
      // container reset below is what actually guarantees a clean slate.
      log.error("error while unmounting corrupted tree", error);
    }
    container.textContent = "";
    root = createRoot(container);
    root.render(render());
    log.info(`remount #${rerenderCount} complete`);
  };

  const scheduleFullRerender = () => {
    if (disposed || rerenderScheduled) return;
    rerenderScheduled = true;
    log.warn("conflict detected — scheduling full re-render");
    // Google Translate rewrites many nodes in one pass, so a single user action
    // can trip several failed mutations. Coalesce them into one remount.
    requestAnimationFrame(() => {
      rerenderScheduled = false;
      fullRerender();
    });
  };

  patchDomForGoogleTranslate(scheduleFullRerender, options);
  root.render(render());

  return () => {
    disposed = true;
    try {
      root.unmount();
    } catch {
      // best-effort teardown
    }
  };
}

let conflictHandler: (() => void) | null = null;
let patchLog = createLogger(false);
let patchInstalled = false;

/**
 * Lower-level entry point: makes `removeChild` / `insertBefore` tolerant of
 * Google Translate reparenting and calls `onConflict` when it happens, without
 * owning the React root. Use this if you manage mounting yourself; most apps
 * should prefer {@link initGoogleTranslateShim}.
 *
 * A parent mismatch is the exact signature of the crash — the native call would
 * throw `NotFoundError`. We only intervene while translation is active (see
 * {@link isGoogleTranslateActive}); otherwise the native error is left to
 * surface so genuine bugs aren't masked.
 *
 * The prototype override is installed once; later calls only swap the active
 * handler and logger.
 */
export function patchDomForGoogleTranslate(
  onConflict: () => void,
  options: GoogleTranslateShimOptions = {}
) {
  conflictHandler = onConflict;
  patchLog = createLogger(options.debug ?? false);
  if (patchInstalled) return;
  patchInstalled = true;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function removeChild<T extends Node>(
    this: Node,
    child: T
  ): T {
    if (child.parentNode !== this && isGoogleTranslateActive()) {
      patchLog.warn(
        "removeChild would have thrown NotFoundError — node's real parent is now",
        child.parentNode,
        "not",
        this,
        { child }
      );
      conflictHandler?.();
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  } as typeof Node.prototype.removeChild;

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function insertBefore<T extends Node>(
    this: Node,
    node: T,
    reference: Node | null
  ): T {
    if (
      reference &&
      reference.parentNode !== this &&
      isGoogleTranslateActive()
    ) {
      patchLog.warn(
        "insertBefore would have thrown NotFoundError — reference's real parent is now",
        reference.parentNode,
        "not",
        this,
        { node, reference }
      );
      conflictHandler?.();
      return originalInsertBefore.call(this, node, null) as T;
    }
    return originalInsertBefore.call(this, node, reference) as T;
  } as typeof Node.prototype.insertBefore;
}

/**
 * Whether Google Translate is currently translating the page. It marks a
 * translated document with a `translated-ltr` / `translated-rtl` class on the
 * `<html>` element. Gating recovery on this keeps the shim inert (native
 * behavior) until translation is active.
 */
export function isGoogleTranslateActive() {
  if (typeof document === "undefined") return false;
  const { classList } = document.documentElement;
  return (
    classList.contains("translated-ltr") || classList.contains("translated-rtl")
  );
}

type Logger = {
  warn: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
};

function createLogger(enabled: boolean): Logger {
  if (!enabled) return { warn: noop, info: noop, error: noop };
  return {
    warn: (message, ...args) => console.warn(`${LOG_PREFIX} ${message}`, ...args),
    info: (message, ...args) => console.info(`${LOG_PREFIX} ${message}`, ...args),
    error: (message, ...args) =>
      console.error(`${LOG_PREFIX} ${message}`, ...args),
  };
}

function noop() {}
