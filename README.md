# react-google-translate-shim

Stop Google Translate from crashing your React app.

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
conflict, it **throws the corrupted tree away and re-renders your app from
scratch** instead of trying to reconcile against DOM React no longer recognizes.

## Install

```sh
npm install react-google-translate-shim
```

React 18+ is a peer dependency (uses `react-dom/client`'s `createRoot`).

## Usage

Replace your `createRoot(...).render(...)` call with `initGoogleTranslateShim`,
passing the mount element and a **render thunk**:

```tsx
import { StrictMode } from "react";
import { initGoogleTranslateShim } from "react-google-translate-shim";
import { App } from "./App";

initGoogleTranslateShim(document.getElementById("root")!, () => (
  <StrictMode>
    <App />
  </StrictMode>
));
```

That's it. The app mounts normally; if Google Translate later corrupts the DOM,
the app remounts cleanly instead of crashing.

### Debug logging

Pass `{ debug: true }` to log conflicts and remounts to the console — useful for
confirming the shim is actually firing:

```ts
initGoogleTranslateShim(container, render, { debug: true });
```

```
[react-google-translate-shim] removeChild would have thrown NotFoundError …
[react-google-translate-shim] conflict detected — scheduling full re-render
[react-google-translate-shim] full re-render #1 — tearing down and remounting …
[react-google-translate-shim] remount #1 complete
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
3. **Recover by re-rendering, not reconciling.** On a conflict the shim unmounts,
   wipes the container (dropping every leftover `<font>` wrapper), and mounts a
   fresh root. Bursts of failed mutations are coalesced into one remount per
   frame.

## API

### `initGoogleTranslateShim(container, render, options?)`

Mounts your app and manages recovery. Returns a disposer that unmounts and stops
managing the container.

- `container: HTMLElement` — where to mount.
- `render: () => ReactNode` — returns your app tree; called on first mount and
  every recovery remount.
- `options.debug?: boolean` — console logging. Default `false`.

### `isGoogleTranslateActive(): boolean`

Whether Google Translate is currently translating the page.

### `patchDomForGoogleTranslate(onConflict, options?)`

Lower-level: installs the tolerant `removeChild` / `insertBefore` patch and calls
`onConflict` when a translation conflict is caught, without owning a React root.
Use this only if you manage mounting yourself. The prototype override is
installed once; later calls swap the handler.

## Caveats

- **A recovery remount resets React-local state.** Anything in module-level
  stores (Zustand, Redux, Router singletons) survives; transient `useState` on
  screen at the moment of a conflict is lost. That's the cost of trading a hard
  crash for a clean rebuild.
- **React 18+ only** (`createRoot`).
- Targets Google Translate specifically. Other translators (Edge, third-party
  extensions) use different DOM markers; `isGoogleTranslateActive` can be
  extended if you need them.

## License

MIT © Maksym Dolynchuk
