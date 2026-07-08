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
watches for translation conflicts and rebuilds its children when one happens,
instead of letting the app crash.

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
reload by hand. But if a rebuild resets something they were editing, a little
context keeps them from being confused. Two signals let you build that:

**Don't** slap a permanent "you may lose data" banner on the page the moment
translation turns on. Most people running Translate are simply reading in their
language with nothing to lose, and nagging them is its own kind of broken. Warn
*in context* instead.

### `useGoogleTranslateActive()` — warn only where it matters

A hook that re-renders when translation turns on/off. Use it to nudge users right
where they're about to lose work — next to a form, not across the whole app:

```tsx
function EditorHint() {
  const translating = useGoogleTranslateActive();
  if (!translating) return null;
  return (
    <p role="status">
      Translation is on. For the smoothest editing, turn it off in this tab.
    </p>
  );
}
```

### `onRecover` — a gentle heads-up if a reset actually happens

Fires the instant a boundary rebuilds (the moment its local state reset), so you
can show a brief, non-blocking toast rather than leaving users wondering:

```tsx
<GoogleTranslateBoundary
  onRecover={() => toast("Recovered from a translation glitch — re-check any unsaved input.")}
>
  <App />
</GoogleTranslateBoundary>
```

The most user-friendly setup combines the pieces: keep form state in a store so it
*survives* a rebuild, scope boundaries around volatile areas, show the contextual
hint while editing, and fall back to an `onRecover` toast for the rare reset.

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

### `useGoogleTranslateActive(): boolean`

React hook that re-renders when Google Translate turns on/off. Use it for
translation-aware UI (e.g. a hint next to a form).

### `isGoogleTranslateActive(): boolean`

Imperative, non-reactive check of the same thing — for use outside React.

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
