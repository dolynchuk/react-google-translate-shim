# react-google-translate-shim

Stop Google Translate from crashing your React app — with a single component
that sits on top of React, no changes to how you render or structure your app.

When a user turns on Google Translate (or another in-page machine translator),
the browser wraps text nodes in `<font>` elements. React still holds references
to the original text nodes, so its next `removeChild` / `insertBefore` on one of
them throws:

```
NotFoundError: Failed to execute 'removeChild' on 'Node':
The node to be removed is not a child of this node.
```

…mid-commit, and the whole app goes white. This is the long-standing
[facebook/react#11538](https://github.com/facebook/react/issues/11538).

This library takes a different tack from the usual `<span>`-wrapping or
`removeChild` monkey-patch workarounds: when it detects a translation-induced
conflict, it **throws the corrupted subtree away and remounts it from scratch**
instead of trying to reconcile against DOM React no longer recognizes.

## Install

```sh
npm install react-google-translate-shim
```

React 18+ is a peer dependency.

## Usage

Keep your existing `createRoot(...).render(...)` exactly as it is. Just wrap your
app in `<GoogleTranslateBoundary>`:

```tsx
import { createRoot } from "react-dom/client";
import { GoogleTranslateBoundary } from "react-google-translate-shim";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <GoogleTranslateBoundary>
    <App />
  </GoogleTranslateBoundary>
);
```

That's it. The boundary doesn't own the root or touch your render call — it just
watches for translation conflicts and remounts its children when one happens,
instead of letting the app crash.

## Preserving state / shrinking the blast radius

A remount rebuilds the boundary's subtree, so React-local `useState` inside it is
lost (module-level stores — Zustand, Redux, Router singletons — always survive).
Two ways to keep more:

### Nest boundaries (scoped remount)

A conflict remounts only the **innermost** boundary enclosing it. Wrap the
volatile parts of your UI individually and everything outside the affected one
keeps its state:

```tsx
<GoogleTranslateBoundary>
  <Sidebar />                       {/* survives a conflict in the editor */}
  <GoogleTranslateBoundary>
    <Editor />                      {/* only this remounts */}
  </GoogleTranslateBoundary>
</GoogleTranslateBoundary>
```

### `strategy="repair"` (no remount at all)

Heal the offending DOM mutation in place instead of remounting, so React keeps
reconciling and **all** state is preserved — the cheapest possible recovery:

```tsx
<GoogleTranslateBoundary strategy="repair">
  <App />
</GoogleTranslateBoundary>
```

Trade-off: repair can leave the occasional empty `<font>` wrapper behind, and
translated text may not live-update, because it never rebuilds the DOM. Use it
when preserving state matters more than pixel-perfect output; use the default
`"remount"` when correctness of the rendered DOM matters more.

### Debug logging

Pass `debug` to log conflicts to the console — useful for confirming the shim is
actually firing:

```tsx
<GoogleTranslateBoundary debug>
  <App />
</GoogleTranslateBoundary>
```

```
[react-google-translate-shim] removeChild would have thrown NotFoundError …
```

Logging is off by default.

## How it works

1. **Patch, don't crash.** `Node.prototype.removeChild` / `insertBefore` are
   wrapped so that when the target node's real parent no longer matches (the
   exact signature of the crash) the doomed native call is skipped instead of
   throwing.
2. **Only while translating.** The patch intervenes *only* when Google Translate
   is active — detected via the `translated-ltr` / `translated-rtl` class it adds
   to `<html>`. When translation is off, the native error is left to surface, so
   genuine React bugs are never masked.
3. **Recover, scoped to the conflict.** In `"remount"` the boundary bumps a `key`
   on its children so React discards the corrupted subtree and mounts a fresh one
   — and only the innermost enclosing boundary rebuilds. In `"repair"` the failing
   mutation is fixed in place, no rebuild. Bursts of failures are coalesced into
   one recovery per frame.

## API

### `<GoogleTranslateBoundary>`

Wrap your app with it. Props:

- `children: ReactNode` — your app.
- `strategy?: "remount" | "repair"` — recovery mode. Default `"remount"`.
- `debug?: boolean` — console logging. Default `false`.

### `isGoogleTranslateActive(): boolean`

Whether Google Translate is currently translating the page.

### `patchDomForGoogleTranslate(options?)`

Lower-level: installs the tolerant `removeChild` / `insertBefore` patch directly.
Accepts `{ strategy?, debug?, onConflict? }` — in `"remount"` it calls
`onConflict(conflictNode)` with the React-managed parent the failed mutation
targeted; in `"repair"` it heals the DOM and never calls back. Use this only to
build your own recovery; `<GoogleTranslateBoundary>` is what most apps want. The
prototype override is installed once; later calls swap the strategy/handler.

## Caveats

- **A `"remount"` recovery resets React-local state** inside the boundary that
  rebuilds. Module-level stores (Zustand, Redux, Router singletons) always
  survive; transient `useState` in the rebuilt subtree is lost. Nest boundaries
  or use `strategy="repair"` to preserve more (see above).
- **React 18+ only.**
- Targets Google Translate specifically. Other translators (Edge, third-party
  extensions) use different DOM markers; `isGoogleTranslateActive` can be
  extended if you need them.

## License

MIT © Maksym Dolynchuk
