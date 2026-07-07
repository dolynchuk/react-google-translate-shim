import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
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

/**
 * Remount only the innermost registered boundary that encloses the conflicting
 * node, so state in every other boundary — and everything outside it — survives.
 */
function handleConflict(conflictNode: Node) {
  const target = findInnermostBoundary(conflictNode);
  if (!target) return;
  pendingRemounts.add(target);
  if (flushScheduled) return;
  flushScheduled = true;
  // Google Translate rewrites many nodes in one pass, so a single user action
  // can trip several failed mutations. Coalesce them into one remount per frame.
  requestAnimationFrame(() => {
    flushScheduled = false;
    const targets = [...pendingRemounts];
    pendingRemounts.clear();
    targets.forEach((entry) => entry.remount());
  });
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
 * With the default `"remount"` strategy, a conflict remounts this boundary's
 * children (a full re-render, no reconciliation against corrupted DOM). Nest
 * boundaries to shrink that blast radius — only the innermost one enclosing the
 * conflict remounts. With `strategy="repair"` nothing remounts at all: the
 * offending mutation is healed in place and all React state is preserved.
 */
export function GoogleTranslateBoundary({
  children,
  strategy = "remount",
  debug = false,
}: GoogleTranslateBoundaryProps) {
  // Install the DOM patch exactly once, before children mount. useState's lazy
  // initializer runs on first render only; the patch itself is idempotent.
  useState(() => {
    patchDomForGoogleTranslate({ strategy, debug, onConflict: handleConflict });
    return null;
  });

  if (strategy === "repair") return <>{children}</>;

  return <RemountingBoundary>{children}</RemountingBoundary>;
}

const DISPLAY_CONTENTS: CSSProperties = { display: "contents" };

function RemountingBoundary({ children }: { children: ReactNode }) {
  const [generation, setGeneration] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Register this boundary's DOM anchor + remount callback in the module
  // registry for its mounted lifetime, so conflict scoping can find and rebuild
  // the innermost enclosing boundary. This is genuine external-store
  // synchronization — the legitimate use of an effect.
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const entry: BoundaryEntry = {
      element,
      remount: () => setGeneration((generation) => generation + 1),
    };
    boundaries.add(entry);
    return () => {
      boundaries.delete(entry);
    };
  }, []);

  return (
    <div ref={containerRef} style={DISPLAY_CONTENTS}>
      <Fragment key={generation}>{children}</Fragment>
    </div>
  );
}
