const LOG_PREFIX = "[react-google-translate-shim]";

export interface GoogleTranslateShimOptions {
  /**
   * Log every detected conflict to the console. Handy while verifying the shim
   * is doing its job. Defaults to `false`.
   */
  debug?: boolean;
}

export interface PatchOptions extends GoogleTranslateShimOptions {
  /**
   * Called with the React-managed parent node the failed mutation targeted, so
   * the caller can rebuild the smallest subtree enclosing it.
   */
  onConflict?: (conflictNode: Node) => void;
}

let conflictHandler: ((conflictNode: Node) => void) | null = null;
let patchLog = createLogger(false);
let patchInstalled = false;
let recovering = false;

/**
 * While a recovery remount is in flight, tolerate every parent-mismatch removal
 * regardless of the translate state. Google Translate can drop its markers
 * between the conflict and the remount, and React's teardown of the corrupted
 * subtree must never throw part-way through — that would leave the tree half
 * unmounted and its state inconsistent.
 */
export function beginRecovery() {
  recovering = true;
}

export function endRecovery() {
  recovering = false;
}

/**
 * Makes `Node.prototype.removeChild` / `insertBefore` tolerant of the DOM
 * rewriting Google Translate does, so a translation-corrupted mutation can never
 * crash React mid-commit.
 *
 * Google Translate wraps text nodes in `<font>` elements. React keeps direct
 * references to the original text nodes, so its next `removeChild` /
 * `insertBefore` on one of them throws `NotFoundError` mid-commit and takes the
 * whole app down (https://github.com/facebook/react/issues/11538). A parent
 * mismatch is the exact signature of that crash — the native call would throw.
 *
 * We only intervene while translation is active (see
 * {@link isGoogleTranslateActive}) or a recovery is in flight; otherwise the
 * native error is left to surface, so genuine React bugs are never masked. The
 * override is installed once; later calls only swap the handler and logger.
 */
export function patchDomForGoogleTranslate(options: PatchOptions = {}) {
  conflictHandler = options.onConflict ?? null;
  patchLog = createLogger(options.debug ?? false);
  // No DOM to patch under server rendering — the boundary re-invokes this on the
  // client during hydration, where `Node` exists.
  if (patchInstalled || typeof Node === "undefined") return;
  patchInstalled = true;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function removeChild<T extends Node>(
    this: Node,
    child: T
  ): T {
    if (child.parentNode !== this && shouldIntervene()) {
      patchLog.warn(
        "removeChild would have thrown NotFoundError — node's real parent is now",
        child.parentNode,
        "not",
        this,
        { child }
      );
      if (!recovering) conflictHandler?.(this);
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
    if (reference && reference.parentNode !== this && shouldIntervene()) {
      patchLog.warn(
        "insertBefore would have thrown NotFoundError — reference's real parent is now",
        reference.parentNode,
        "not",
        this,
        { node, reference }
      );
      if (!recovering) conflictHandler?.(this);
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

function shouldIntervene() {
  return recovering || isGoogleTranslateActive();
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
