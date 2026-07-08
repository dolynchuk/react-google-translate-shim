import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useGoogleTranslateRecovery } from "./recovery";

export interface GoogleTranslateRecoveryNoticeProps {
  /** Custom content. Omit to use the built-in message. */
  children?: ReactNode;
  /** How long the notice stays up, in ms. Default 6000. */
  duration?: number;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_MESSAGE =
  "The page recovered from a translation glitch — please re-check any unsaved input.";

/**
 * Shows a transient notice every time the app rebuilds to recover from a Google
 * Translate conflict, auto-dismissing after `duration` ms. Unstyled by default.
 *
 * Place it OUTSIDE your `<GoogleTranslateBoundary>` (e.g. in a top-level toast
 * region) so the recovery it reports on doesn't unmount the notice itself.
 *
 * ```tsx
 * <GoogleTranslateRecoveryNotice className="my-toast" />
 * <GoogleTranslateBoundary>
 *   <App />
 * </GoogleTranslateBoundary>
 * ```
 */
export function GoogleTranslateRecoveryNotice({
  children,
  duration = 6000,
  className,
  style,
}: GoogleTranslateRecoveryNoticeProps) {
  const { count } = useGoogleTranslateRecovery();
  // Only react to recoveries that happen after this notice mounts — never to
  // ones that already occurred earlier in the session.
  const baselineRef = useRef(count);
  const [visible, setVisible] = useState(false);

  // Reveal on each new recovery and hide after `duration`. A timer with cleanup
  // is a genuine effect: it syncs visibility to wall-clock time, and re-runs
  // (resetting the countdown) whenever another recovery bumps `count`.
  useEffect(() => {
    if (count === baselineRef.current) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [count, duration]);

  if (!visible) return null;
  return (
    <div role="status" aria-live="polite" className={className} style={style}>
      {children ?? DEFAULT_MESSAGE}
    </div>
  );
}
