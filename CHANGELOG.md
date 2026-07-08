# Changelog

## 0.4.0

Correctness-first release.

- **Recovery always rebuilds from React state**, never patches the corrupted DOM
  in place — so React's tree and the real DOM can't drift apart and submit stale
  data. Removed the `repair` strategy, which could not offer that guarantee.
- **Hardened rebuild**: container is wiped first (no `<font>` leftovers), stale
  removals are tolerated throughout teardown (no half-unmount if translation
  toggles mid-recovery), and conflicts inside portals fall back to rebuilding the
  outermost boundary.
- **Scoped recovery**: nested boundaries rebuild only the innermost one enclosing
  a conflict, preserving state elsewhere.
- **SSR-safe**: no `Node`/`useLayoutEffect` access during server rendering.
- **User-facing helpers**: `<GoogleTranslateWarning>`,
  `<GoogleTranslateRecoveryNotice>`, `useGoogleTranslateActive()`,
  `useGoogleTranslateRecovery()`, and an `onRecover` prop on the boundary.

## 0.2.0

- `<GoogleTranslateBoundary>` component API — wraps your app without owning the
  React root.

## 0.1.0

- Initial release.
