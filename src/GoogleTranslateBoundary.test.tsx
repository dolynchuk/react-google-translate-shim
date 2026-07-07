import { act, render } from "@testing-library/react";
import { useState } from "react";
import { GoogleTranslateBoundary } from "./GoogleTranslateBoundary";

let childMountCount = 0;

function CountingChild() {
  useState(() => {
    childMountCount += 1;
    return null;
  });
  return <span>content</span>;
}

const activateGoogleTranslate = () => {
  document.documentElement.classList.add("translated-ltr");
};

// Google Translate reparents a text node React still references, exactly as it
// does in the browser, so the patched removeChild reports a conflict.
const simulateTranslateConflict = () => {
  const parent = document.createElement("div");
  const wrapper = document.createElement("font");
  const text = document.createTextNode("x");
  parent.append(wrapper);
  wrapper.append(text);
  parent.removeChild(text);
};

describe("GoogleTranslateBoundary", () => {
  beforeEach(() => {
    childMountCount = 0;
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
        <CountingChild />
      </GoogleTranslateBoundary>
    );

    expect(container.textContent).toBe("content");
    expect(childMountCount).toBe(1);
  });

  it("remounts children when a translate conflict is detected", () => {
    render(
      <GoogleTranslateBoundary>
        <CountingChild />
      </GoogleTranslateBoundary>
    );
    expect(childMountCount).toBe(1);

    activateGoogleTranslate();
    act(() => {
      simulateTranslateConflict();
    });

    expect(childMountCount).toBe(2);
  });

  it("does not remount when translate is inactive", () => {
    render(
      <GoogleTranslateBoundary>
        <CountingChild />
      </GoogleTranslateBoundary>
    );
    expect(childMountCount).toBe(1);

    act(() => {
      // No translate class present: a reparented-node removeChild must throw
      // the genuine error and never trigger a remount.
      expect(() => simulateTranslateConflict()).toThrow();
    });

    expect(childMountCount).toBe(1);
  });
});
