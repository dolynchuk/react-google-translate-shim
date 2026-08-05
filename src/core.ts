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
 * rewriting in-browser translators do, so a translation-corrupted mutation can
 * never crash React mid-commit.
 *
 * Every in-browser translator wraps text runs in `<font>` elements. React keeps
 * direct references to the original text nodes, so its next `removeChild` /
 * `insertBefore` on one of them throws `NotFoundError` mid-commit and takes the
 * whole app down (https://github.com/facebook/react/issues/11538). A parent
 * mismatch is the exact signature of that crash — the native call would throw.
 *
 * We intervene only when the mismatch is translation corruption — a recovery is
 * in flight, the Google Translate widget is active (see
 * {@link isGoogleTranslateActive}), or the mismatch bears the universal
 * translator `<font>` signature (see {@link bearsTranslationSignature}).
 * Otherwise the native error is left to surface, so genuine React bugs are never
 * masked. The override is installed once; later calls only swap the handler and
 * logger.
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
    if (child.parentNode !== this && isTranslationConflict(child, this)) {
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
    if (
      reference &&
      reference.parentNode !== this &&
      isTranslationConflict(reference, this)
    ) {
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
 * Whether the Google Translate widget/extension is translating the page. It
 * marks a translated document with a `translated-ltr` / `translated-rtl` class
 * on the `<html>` element.
 *
 * This detects the widget specifically — browser-native translators (Chrome,
 * Edge, Safari, Firefox) corrupt the DOM the same way but never set this class,
 * so the crash guard also relies on {@link bearsTranslationSignature}.
 */
export function isGoogleTranslateActive() {
  if (typeof document === "undefined") return false;
  const { classList } = document.documentElement;
  return (
    classList.contains("translated-ltr") || classList.contains("translated-rtl")
  );
}

/**
 * Whether a parent-mismatch mutation is translation corruption rather than a
 * genuine React bug. True while a recovery is in flight (teardown of a corrupted
 * subtree must never throw part-way through), while the Google Translate widget
 * is active, or when the mismatch itself carries the translator `<font>`
 * fingerprint — the latter is what lets the shim catch browser-native
 * translators, which never set the widget's `<html>` class.
 */
function isTranslationConflict(movedNode: Node, intendedParent: Node) {
  return (
    recovering ||
    isGoogleTranslateActive() ||
    bearsTranslationSignature(movedNode, intendedParent)
  );
}

/**
 * The DOM fingerprint every in-browser translator leaves: it wraps translated
 * text runs in `<font>` elements — a tag no modern app emits itself —
 * re-parenting the nodes React still tracks. The node React tried to mutate is
 * now inside such a wrapper, or its intended parent holds one. A genuine
 * double-remove / stale-insert bug never involves a `<font>`, so gating on this
 * keeps real React bugs unmasked while covering Chrome, Edge, Safari, and
 * Firefox translation in addition to the Google Translate widget.
 */
function bearsTranslationSignature(movedNode: Node, intendedParent: Node) {
  if (movedNode.parentNode?.nodeName === "FONT") return true;
  return (
    typeof Element !== "undefined" &&
    intendedParent instanceof Element &&
    intendedParent.querySelector("font") !== null
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
