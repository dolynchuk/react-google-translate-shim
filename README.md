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

## Quick start

Keep your existing `createRoot(...).render(...)`. Wrap the whole app in
`<GoogleTranslateBoundary>` so a translation conflict rebuilds the entire page
from React state instead of crashing it, and render a `<GoogleTranslateRecoveryNotice>`
**as a sibling — outside the boundary** — so it survives that rebuild and tells
the user what happened.

```tsx
// main.tsx
import { createRoot } from "react-dom/client";
import {
  GoogleTranslateBoundary,
  GoogleTranslateRecoveryNotice,
} from "react-google-translate-shim";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <>
    {/* Outside the boundary: it must NOT be rebuilt by the recovery it reports. */}
    <GoogleTranslateRecoveryNotice
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#111",
        color: "#fff",
        padding: "10px 16px",
        borderRadius: 8,
        zIndex: 9999,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
      }}
    >
      We refreshed the page to fix a translation glitch — please double-check any
      unsaved changes.
    </GoogleTranslateRecoveryNotice>

    <GoogleTranslateBoundary>
      <App />
    </GoogleTranslateBoundary>
  </>
);
```

That's the whole integration. The boundary doesn't own the root or change how you
render — it watches for the translation conflict that would otherwise crash React,
rebuilds the page from state, and the notice shows your message for a few seconds.

> **Placement rule (important):** `<GoogleTranslateRecoveryNotice>` and any
> `useGoogleTranslateRecovery()` consumer must sit **outside**
> `<GoogleTranslateBoundary>`. Inside, the rebuild would unmount the very thing
> reporting it. `<GoogleTranslateWarning>` can go anywhere.

## Correctness guarantee

Recovery **always rebuilds the DOM from React's own state** rather than patching
the corrupted DOM in place. That's a deliberate choice: after recovery, React's
internal tree and the real DOM cannot disagree, so you never end up with a stale
value in state that submits wrong data to your backend.

The rebuild is hardened so recovery itself is never a source of inconsistency:

- **No leftovers.** The container is wiped before rebuilding, so Google
  Translate's `<font>` wrappers can't linger or duplicate content.
- **No half-teardown.** Stale-node removals are tolerated *throughout* the
  rebuild — even if Google Translate switches off mid-recovery — so React can
  never crash part-way and leave the tree inconsistent.
- **Portals too.** A conflict inside a portal (which renders outside the
  boundary's DOM) falls back to rebuilding the outermost boundary, so nothing is
  ever left uncorrected.

> **"Always correct" means state and DOM never disagree — not "no data is ever
> lost."** A rebuild resets React-local `useState` inside the rebuilt subtree to
> initial values.

This is lost data, never *wrong* data — what's on screen always equals what's in
state, so a submit can never send a stale value. Keep anything you can't afford to
reset in a store (Zustand, Redux, a form library, Router singletons); those live
outside the tree and always survive.

## Shrinking the blast radius

A conflict rebuilds only the **innermost** boundary enclosing it. Wrap the
volatile parts of your UI individually so a conflict in one never resets state in
another — and keep boundaries off your critical forms:

```tsx
<GoogleTranslateBoundary>
  <Sidebar />                       {/* survives a conflict in the editor */}
  <GoogleTranslateBoundary>
    <Editor />                      {/* only this rebuilds */}
  </GoogleTranslateBoundary>
</GoogleTranslateBoundary>
```

## Keeping users informed

Recovering silently already beats the alternative — a blank page the user has to
reload by hand. Two drop-in components make the experience clear without any
wiring. Both are **unstyled by default** (pass `className` / `style`, or your own
`children`) so they fit any design system.

### `<GoogleTranslateWarning>` — a warning while Translate is on

Renders only while Google Translate is active, nothing otherwise:

```tsx
<GoogleTranslateWarning className="banner" />
// → "Translation is on. For the smoothest experience while editing, turn it
//    off in this tab — some in-progress input may reset."
```

Put it wherever the warning is relevant. Placing it *next to an editable form*
rather than app-wide is the friendliest choice — most people running Translate
are just reading and have nothing to lose, so a permanent global banner mostly
just nags them.

### `<GoogleTranslateRecoveryNotice>` — a notice each time a rebuild happens

Shows a transient, auto-dismissing notice **every time** the app rebuilds to
recover from a translation conflict. Place it **outside** your boundary (e.g. a
top-level toast region) so the recovery doesn't unmount the notice itself:

```tsx
<GoogleTranslateRecoveryNotice className="toast" duration={6000} />
<GoogleTranslateBoundary>
  <App />
</GoogleTranslateBoundary>
```

### Building your own

Prefer your own UI? The same two signals are exposed directly:

- **`useGoogleTranslateActive(): boolean`** — re-renders when Translate turns
  on/off. Back your own warning with it.
- **`useGoogleTranslateRecovery(): { count }`** — re-renders on every recovery;
  drive a toast from the count. (Compare against a mount-time baseline if you
  only want *new* recoveries — the built-in notice does this for you.)
- **`onRecover`** prop on `<GoogleTranslateBoundary>` — a per-boundary callback
  fired the moment that boundary rebuilds.

The most user-friendly setup combines the pieces: keep form state in a store so it
*survives* a rebuild, scope boundaries around volatile areas, show
`<GoogleTranslateWarning>` next to editable forms, and mount a
`<GoogleTranslateRecoveryNotice>` for the rare reset.

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
3. **Recover, scoped to the conflict.** The boundary bumps a `key` on its
   children so React discards the corrupted subtree and rebuilds it from state —
   and only the innermost enclosing boundary rebuilds. Bursts of failures are
   coalesced into one recovery per frame.

## API

### `<GoogleTranslateBoundary>`

Wrap your app with it. Props:

- `children: ReactNode` — your app.
- `onRecover?: () => void` — called when this boundary rebuilds to recover from a
  conflict (the moment its local state reset). Good for a toast.
- `debug?: boolean` — console logging. Default `false`.

### `<GoogleTranslateWarning>`

Renders a warning while Translate is active, nothing otherwise. Props:
`children?` (defaults to a built-in message), `className?`, `style?`.

### `<GoogleTranslateRecoveryNotice>`

Transient, auto-dismissing notice shown on each recovery. Mount it outside your
boundary. Props: `children?`, `duration?` (ms, default `6000`), `className?`,
`style?`.

### `useGoogleTranslateActive(): boolean`

React hook that re-renders when Google Translate turns on/off. Use it for
translation-aware UI (e.g. a hint next to a form).

### `useGoogleTranslateRecovery(): { count }`

React hook that re-renders on every recovery; `count` is the session total. Drive
your own notification from it.

### `isGoogleTranslateActive(): boolean`

Imperative, non-reactive check of whether Translate is active — for use outside
React.

### `patchDomForGoogleTranslate(options?)`

Lower-level: installs the tolerant `removeChild` / `insertBefore` patch directly.
Accepts `{ debug?, onConflict? }` and calls `onConflict(conflictNode)` with the
React-managed parent the failed mutation targeted. Use this only to build your
own recovery; `<GoogleTranslateBoundary>` is what most apps want. The prototype
override is installed once; later calls swap the handler.

## Caveats

- **Recovery resets React-local state** inside the boundary that rebuilds — see
  [Correctness guarantee](#correctness-guarantee). It's lost data, never wrong
  data. Nest boundaries and keep critical state in a store to preserve it.
- **React 18+ only.**
- Targets Google Translate specifically. Other translators (Edge, third-party
  extensions) use different DOM markers; `isGoogleTranslateActive` can be
  extended if you need them.

## License

MIT © Maksym Dolynchuk
