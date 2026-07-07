import { act, render } from "@testing-library/react";
import { useState } from "react";
import { GoogleTranslateBoundary } from "./GoogleTranslateBoundary";

const mountCounts: Record<string, number> = {};

function Host({ id }: { id: string }) {
  useState(() => {
    mountCounts[id] = (mountCounts[id] ?? 0) + 1;
    return null;
  });
  return <div data-host={id}>content</div>;
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

const hostEl = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-host="${id}"]`) as HTMLElement;

describe("GoogleTranslateBoundary", () => {
  beforeEach(() => {
    for (const key of Object.keys(mountCounts)) delete mountCounts[key];
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

  it("remounts children when a translate conflict is detected", () => {
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
  });

  it("does not remount when translate is inactive", () => {
    const { container } = render(
      <GoogleTranslateBoundary>
        <Host id="only" />
      </GoogleTranslateBoundary>
    );
    expect(mountCounts.only).toBe(1);

    act(() => {
      expect(() =>
        simulateConflictInside(hostEl(container, "only"))
      ).toThrow();
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

  it("repair strategy heals in place without remounting", () => {
    const { container } = render(
      <GoogleTranslateBoundary strategy="repair">
        <Host id="only" />
      </GoogleTranslateBoundary>
    );
    expect(mountCounts.only).toBe(1);

    activateGoogleTranslate();
    const host = hostEl(container, "only");
    const wrapper = document.createElement("font");
    const text = document.createTextNode("x");
    host.append(wrapper);
    wrapper.append(text);

    act(() => {
      expect(() => host.removeChild(text)).not.toThrow();
    });

    // No remount, and the offending node was detached in place.
    expect(mountCounts.only).toBe(1);
    expect(text.parentNode).toBeNull();
  });
});
