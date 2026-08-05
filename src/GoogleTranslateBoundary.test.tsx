import { act, render } from "@testing-library/react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { GoogleTranslateBoundary } from "./GoogleTranslateBoundary";
import { resetRecoveryCount, useGoogleTranslateRecovery } from "./recovery";

const mountCounts: Record<string, number> = {};

function Host({ id }: { id: string }) {
  useState(() => {
    mountCounts[id] = (mountCounts[id] ?? 0) + 1;
    return null;
  });
  return <div data-host={id}>content</div>;
}

function PortalHost({ id, target }: { id: string; target: HTMLElement }) {
  useState(() => {
    mountCounts[id] = (mountCounts[id] ?? 0) + 1;
    return null;
  });
  return createPortal(<div data-host={id}>portal</div>, target);
}

const activateGoogleTranslate = () => {
  document.documentElement.classList.add("translated-ltr");
};

// Reparent a text node under a <font> the way Google Translate does, then let
// React's `removeChild(host, text)` hit the patch — `host` is the conflict node.
const simulateConflictInside = (host: Element) => {
  const wrapper = document.createElement("font");
  const text = document.createTextNode("x");
  host.append(wrapper);
  wrapper.append(text);
  host.removeChild(text);
};

const hostEl = (root: ParentNode, id: string) =>
  root.querySelector(`[data-host="${id}"]`) as HTMLElement;

describe("GoogleTranslateBoundary", () => {
  beforeEach(() => {
    for (const key of Object.keys(mountCounts)) delete mountCounts[key];
    // recoveryCount is a session-global monotonic counter; reset it so the
    // MAX_RECOVERIES cap from one test never suppresses remounts in the next.
    resetRecoveryCount();
    // Run the coalescing rAF synchronously so the remount is observable in-test.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.classList.remove(
      "translated-ltr",
      "translated-rtl"
    );
  });

  it("renders its children", () => {
    const { container } = render(
      <GoogleTranslateBoundary>
        <Host id="only" />
      </GoogleTranslateBoundary>
    );

    expect(container.textContent).toBe("content");
    expect(mountCounts.only).toBe(1);
  });

  it("rebuilds children on a conflict, leaving no translate leftovers behind", () => {
    const { container } = render(
      <GoogleTranslateBoundary>
        <Host id="only" />
      </GoogleTranslateBoundary>
    );
    expect(mountCounts.only).toBe(1);

    activateGoogleTranslate();
    act(() => {
      simulateConflictInside(hostEl(container, "only"));
    });

    expect(mountCounts.only).toBe(2);
    // The <font> wrapper injected during the conflict is gone after the rebuild.
    expect(container.querySelector("font")).toBeNull();
    expect(container.textContent).toBe("content");
  });

  it("rebuilds on a <font> conflict even without the widget class (browser-native translate)", () => {
    const { container } = render(
      <GoogleTranslateBoundary>
        <Host id="only" />
      </GoogleTranslateBoundary>
    );
    expect(mountCounts.only).toBe(1);

    // No translated-ltr/-rtl class: Chrome/Edge/Safari native translation is
    // recognised by the <font> wrapper alone.
    act(() => {
      simulateConflictInside(hostEl(container, "only"));
    });

    expect(mountCounts.only).toBe(2);
    expect(container.querySelector("font")).toBeNull();
  });

  it("does not remount on a genuine mismatch with no translator artifact", () => {
    const { container } = render(
      <GoogleTranslateBoundary>
        <Host id="only" />
      </GoogleTranslateBoundary>
    );
    expect(mountCounts.only).toBe(1);

    // A real cross-parent removal — no <font> anywhere — must still surface as
    // the native NotFoundError instead of being swallowed as a translation glitch.
    act(() => {
      const host = hostEl(container, "only");
      const orphan = document.createElement("span");
      document.createElement("div").append(orphan);
      expect(() => host.removeChild(orphan)).toThrow();
    });

    expect(mountCounts.only).toBe(1);
  });

  it("remounts only the innermost boundary enclosing the conflict", () => {
    const { container } = render(
      <GoogleTranslateBoundary>
        <Host id="outer" />
        <GoogleTranslateBoundary>
          <Host id="inner" />
        </GoogleTranslateBoundary>
      </GoogleTranslateBoundary>
    );
    expect(mountCounts.outer).toBe(1);
    expect(mountCounts.inner).toBe(1);

    activateGoogleTranslate();
    act(() => {
      simulateConflictInside(hostEl(container, "inner"));
    });

    // Only the inner boundary rebuilt; the outer subtree kept its state.
    expect(mountCounts.inner).toBe(2);
    expect(mountCounts.outer).toBe(1);
  });

  it("reports the rebuild to useGoogleTranslateRecovery consumers outside the boundary", () => {
    function RecoveryCount() {
      const { count } = useGoogleTranslateRecovery();
      return <span data-count={count} />;
    }
    const { container } = render(
      <div>
        <RecoveryCount />
        <GoogleTranslateBoundary>
          <Host id="only" />
        </GoogleTranslateBoundary>
      </div>
    );
    const before = Number(
      container.querySelector("[data-count]")?.getAttribute("data-count")
    );

    activateGoogleTranslate();
    act(() => {
      simulateConflictInside(hostEl(container, "only"));
    });

    const after = Number(
      container.querySelector("[data-count]")?.getAttribute("data-count")
    );
    expect(after).toBe(before + 1);
  });

  it("calls onRecover when it rebuilds", () => {
    const onRecover = vi.fn();
    const { container } = render(
      <GoogleTranslateBoundary onRecover={onRecover}>
        <Host id="only" />
      </GoogleTranslateBoundary>
    );
    expect(onRecover).not.toHaveBeenCalled();

    activateGoogleTranslate();
    act(() => {
      simulateConflictInside(hostEl(container, "only"));
    });

    expect(onRecover).toHaveBeenCalledTimes(1);
  });

  it("recovers conflicts inside portals by rebuilding the outermost boundary", () => {
    const portalTarget = document.createElement("div");
    document.body.append(portalTarget);
    try {
      render(
        <GoogleTranslateBoundary>
          <Host id="app" />
          <PortalHost id="portal" target={portalTarget} />
        </GoogleTranslateBoundary>
      );
      expect(mountCounts.portal).toBe(1);
      expect(mountCounts.app).toBe(1);

      activateGoogleTranslate();
      act(() => {
        // Conflict node lives in the portal target, outside every boundary's DOM.
        simulateConflictInside(hostEl(portalTarget, "portal"));
      });

      // Fallback rebuilt the whole app, re-rendering the portal too.
      expect(mountCounts.app).toBe(2);
      expect(mountCounts.portal).toBe(2);
    } finally {
      portalTarget.remove();
    }
  });

  it("stops remounting after MAX_RECOVERIES so an aggressive translator can't loop", () => {
    const { container } = render(
      <GoogleTranslateBoundary>
        <Host id="only" />
      </GoogleTranslateBoundary>
    );
    expect(mountCounts.only).toBe(1);

    activateGoogleTranslate();
    // Four conflicts, but only the first three (MAX_RECOVERIES) rebuild; the
    // fourth is swallowed by the patched DOM methods with no further remount.
    for (let i = 0; i < 4; i++) {
      act(() => {
        simulateConflictInside(hostEl(container, "only"));
      });
    }

    expect(mountCounts.only).toBe(4);
  });
});
