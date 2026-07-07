const LOG_PREFIX = "[react-google-translate-shim]";

export interface GoogleTranslateShimOptions {
  /**
   * Log every detected conflict to the console. Handy while verifying the shim
   * is doing its job. Defaults to `false`.
   */
  debug?: boolean;
}

let conflictHandler: (() => void) | null = null;
let patchLog = createLogger(false);
let patchInstalled = false;

/**
 * Makes `Node.prototype.removeChild` / `insertBefore` tolerant of the DOM
 * rewriting Google Translate does, and calls `onConflict` whenever it catches
 * one — without touching React or owning a root.
 *
 * Google Translate wraps text nodes in `<font>` elements. React keeps direct
 * references to the original text nodes, so its next `removeChild` /
 * `insertBefore` on one of them throws `NotFoundError` mid-commit and takes the
 * whole app down (https://github.com/facebook/react/issues/11538). A parent
 * mismatch is the exact signature of that crash — the native call would throw.
 * We skip the doomed mutation and notify `onConflict` so the caller can recover.
 *
 * We only intervene while translation is active (see
 * {@link isGoogleTranslateActive}); otherwise the native error is left to
 * surface, so genuine React bugs are never masked. The prototype override is
 * installed once; later calls only swap the active handler and logger.
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
};

function createLogger(enabled: boolean): Logger {
  if (!enabled) return { warn: noop };
  return {
    warn: (message, ...args) =>
      console.warn(`${LOG_PREFIX} ${message}`, ...args),
  };
}

function noop() {}
