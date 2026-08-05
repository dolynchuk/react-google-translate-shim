# Changelog

## 0.5.1

- **Microsoft Translator (Edge) detection.** The crash guard now also treats a
  conflict as translation corruption when the page carries Edge's `_msttexthash`
  attribute, which its built-in translator stamps on rewritten elements without
  ever setting a marker class on `<html>`. Exposed as `isMicrosoftTranslateActive()`.
- **Remount cap (`MAX_RECOVERIES = 3`).** After three rebuilds in a session the
  boundary stops remounting and lets the patched `removeChild` / `insertBefore`
  keep swallowing conflicts. A remount hands the translator fresh untranslated
  DOM, which it rewrites immediately, so an aggressive translator would otherwise
  loop forever. `resetRecoveryCount()` clears the counter.

## 0.5.0

- **Covers browser-native translators.** The crash guard now also recognises a
  conflict by the universal translator fingerprint — a node re-parented into a
  `<font>` wrapper — instead of relying solely on the Google Translate widget's
  `translated-ltr` / `translated-rtl` class on `<html>`. Chrome, Edge, Safari,
  and Firefox in-page translation corrupt the DOM the same way but never set that
  class, so the previous release let those crashes through; they are now caught
  and recovered like the widget's. Genuine React bugs still surface — a real
  mismatch never involves a `<font>`.

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
