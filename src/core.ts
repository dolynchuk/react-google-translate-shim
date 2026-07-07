const LOG_PREFIX = "[react-google-translate-shim]";

export type RecoveryStrategy = "remount" | "repair";

export interface GoogleTranslateShimOptions {
  /**
   * How to recover once Google Translate has corrupted the DOM:
   *
   * - `"remount"` (default) — signal `onConflict` so the caller can rebuild the
   *   affected React subtree. Correct DOM, but React-local state in that subtree
   *   is lost.
   * - `"repair"` — heal the specific mutation in place (no remount), so React
   *   keeps reconciling and **all** state is preserved. The cheapest possible
   *   recovery, at the cost of occasional cosmetic artifacts (leftover empty
   *   `<font>` wrappers, translated text that may not live-update).
   */
  strategy?: RecoveryStrategy;
  /**
   * Log every detected conflict to the console. Handy while verifying the shim
   * is doing its job. Defaults to `false`.
   */
  debug?: boolean;
}

export interface PatchOptions extends GoogleTranslateShimOptions {
  /**
   * Called (in `"remount"` strategy) with the React-managed parent node the
   * failed mutation targeted, so the caller can rebuild the smallest subtree
   * enclosing it. Not called in `"repair"` strategy.
   */
  onConflict?: (conflictNode: Node) => void;
}

let strategy: RecoveryStrategy = "remount";
let conflictHandler: ((conflictNode: Node) => void) | null = null;
let patchLog = createLogger(false);
let patchInstalled = false;

/**
 * Makes `Node.prototype.removeChild` / `insertBefore` tolerant of the DOM
 * rewriting Google Translate does.
 *
 * Google Translate wraps text nodes in `<font>` elements. React keeps direct
 * references to the original text nodes, so its next `removeChild` /
 * `insertBefore` on one of them throws `NotFoundError` mid-commit and takes the
 * whole app down (https://github.com/facebook/react/issues/11538). A parent
 * mismatch is the exact signature of that crash — the native call would throw.
 *
 * We only intervene while translation is active (see
 * {@link isGoogleTranslateActive}); otherwise the native error is left to
 * surface, so genuine React bugs are never masked. The prototype override is
 * installed once; later calls only swap the active strategy, handler and logger.
 */
export function patchDomForGoogleTranslate(options: PatchOptions = {}) {
  strategy = options.strategy ?? "remount";
  conflictHandler = options.onConflict ?? null;
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
      if (strategy === "repair") {
        // React wants `child` gone; detach it from the <font> wrapper Google
        // Translate moved it into so the intent is satisfied without a remount.
        child.parentNode?.removeChild(child);
        return child;
      }
      conflictHandler?.(this);
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
      if (strategy === "repair") {
        // Insert before whichever ancestor of `reference` is a direct child of
        // `this` (the <font> wrapper Translate injected), preserving order.
        let anchor: Node | null = reference;
        while (anchor && anchor.parentNode !== this) anchor = anchor.parentNode;
        return originalInsertBefore.call(this, node, anchor) as T;
      }
      conflictHandler?.(this);
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
