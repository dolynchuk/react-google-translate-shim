import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  beginRecovery,
  endRecovery,
  patchDomForGoogleTranslate,
  type GoogleTranslateShimOptions,
} from "./core";

interface BoundaryEntry {
  element: HTMLElement;
  remount: () => void;
}

const boundaries = new Set<BoundaryEntry>();
const pendingRemounts = new Set<BoundaryEntry>();
let flushScheduled = false;

function handleConflict(conflictNode: Node) {
  const target = findInnermostBoundary(conflictNode);
  if (target) {
    pendingRemounts.add(target);
  } else {
    // The conflict is outside every boundary's DOM subtree — e.g. inside a
    // portal, which renders elsewhere. Rebuild the outermost boundaries, which
    // re-render their portals too, so no corruption is ever left unrecovered.
    for (const entry of outermostBoundaries()) pendingRemounts.add(entry);
  }
  if (pendingRemounts.size === 0 || flushScheduled) return;
  flushScheduled = true;
  // Google Translate rewrites many nodes in one pass, so a single user action
  // can trip several failed mutations. Coalesce them into one recovery.
  requestAnimationFrame(flushRemounts);
}

function flushRemounts() {
  flushScheduled = false;
  // Remounting a boundary rebuilds everything nested inside it, so drop any
  // queued descendant — remounting it too would setState on an unmounted tree.
  const targets = onlyOutermost([...pendingRemounts]);
  pendingRemounts.clear();
  if (targets.length === 0) return;

  // Tolerate stale-node removals while React tears the corrupted subtree down,
  // and wipe each container first so no Google-Translate leftovers survive the
  // rebuild. React then mounts a fresh, internally consistent tree. The flag
  // stays set until the remount commit lands — each boundary clears it in a
  // layout effect — because that teardown runs after this synchronous flush.
  beginRecovery();
  for (const entry of targets) {
    entry.element.replaceChildren();
    entry.remount();
  }
}

function findInnermostBoundary(node: Node) {
  let innermost: BoundaryEntry | null = null;
  for (const entry of boundaries) {
    if (entry.element === node || entry.element.contains(node)) {
      // Candidates all sit on the node's ancestor chain, so the deepest one is
      // the boundary contained by every other candidate.
      if (!innermost || innermost.element.contains(entry.element)) {
        innermost = entry;
      }
    }
  }
  return innermost;
}

function outermostBoundaries() {
  return onlyOutermost([...boundaries]);
}

function onlyOutermost(entries: BoundaryEntry[]) {
  return entries.filter(
    (entry) =>
      !entries.some(
        (other) => other !== entry && other.element.contains(entry.element)
      )
  );
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
 * boundary rebuilds its children from scratch — a full re-render with no
 * reconciliation against corrupted DOM — so React's state can never drift out of
 * sync with what's on screen. Nest boundaries to shrink the blast radius: only
 * the innermost one enclosing the conflict rebuilds, and state everywhere else
 * (and in module-level stores) survives untouched.
 */
export function GoogleTranslateBoundary({
  children,
  debug = false,
}: GoogleTranslateBoundaryProps) {
  // Install the DOM patch exactly once, before children mount. useState's lazy
  // initializer runs on first render only; the patch itself is idempotent.
  useState(() => {
    patchDomForGoogleTranslate({ debug, onConflict: handleConflict });
    return null;
  });

  const [generation, setGeneration] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Register this boundary's DOM anchor + remount callback in the module
  // registry for its mounted lifetime, so conflict scoping can find and rebuild
  // the innermost enclosing boundary. Genuine external-store synchronization —
  // the legitimate use of an effect.
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const entry: BoundaryEntry = {
      element,
      remount: () => setGeneration((value) => value + 1),
    };
    boundaries.add(entry);
    return () => {
      boundaries.delete(entry);
    };
  }, []);

  // A remount's tolerant-teardown window ends once its commit lands; clear the
  // recovery flag here, after React has applied this generation's DOM changes.
  useLayoutEffect(() => {
    endRecovery();
  }, [generation]);

  return (
    <div ref={containerRef} style={DISPLAY_CONTENTS}>
      <Fragment key={generation}>{children}</Fragment>
    </div>
  );
}

const DISPLAY_CONTENTS: CSSProperties = { display: "contents" };
