import type { CSSProperties, ReactNode } from "react";
import { useGoogleTranslateActive } from "./useGoogleTranslateActive";

export interface GoogleTranslateWarningProps {
  /** Custom content. Omit to use the built-in message. */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_MESSAGE =
  "Translation is on. For the smoothest experience while editing, turn it off in " +
  "this tab — some in-progress input may reset.";

/**
 * Renders a warning only while Google Translate is translating the page, and
 * nothing otherwise. Unstyled by default so it fits any design system — pass
 * `className` / `style`, or your own `children` to replace the content entirely.
 *
 * ```tsx
 * <GoogleTranslateWarning className="my-banner" />
 * ```
 */
export function GoogleTranslateWarning({
  children,
  className,
  style,
}: GoogleTranslateWarningProps) {
  const active = useGoogleTranslateActive();
  if (!active) return null;
  return (
    <div role="status" aria-live="polite" className={className} style={style}>
      {children ?? DEFAULT_MESSAGE}
    </div>
  );
}
