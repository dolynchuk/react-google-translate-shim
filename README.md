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
3. **Recover by remounting, not reconciling.** On a conflict the boundary bumps a
   `key` on its children, so React discards the corrupted subtree and mounts a
   fresh one. Bursts of failed mutations are coalesced into one remount per frame.

## API

### `<GoogleTranslateBoundary>`

Wrap your app with it. Props:

- `children: ReactNode` — your app.
- `debug?: boolean` — console logging. Default `false`.

### `isGoogleTranslateActive(): boolean`

Whether Google Translate is currently translating the page.

### `patchDomForGoogleTranslate(onConflict, options?)`

Lower-level: installs the tolerant `removeChild` / `insertBefore` patch and calls
`onConflict` when a translation conflict is caught, without any React
involvement. Use this only if you want to build your own recovery mechanism;
`<GoogleTranslateBoundary>` is what most apps want. The prototype override is
installed once; later calls swap the handler.

## Caveats

- **A recovery remount resets React-local state** inside the boundary. Anything
  in module-level stores (Zustand, Redux, Router singletons) survives; transient
  `useState` on screen at the moment of a conflict is lost. That's the cost of
  trading a hard crash for a clean rebuild.
- **React 18+ only.**
- Targets Google Translate specifically. Other translators (Edge, third-party
  extensions) use different DOM markers; `isGoogleTranslateActive` can be
  extended if you need them.

## License

MIT © Maksym Dolynchuk
