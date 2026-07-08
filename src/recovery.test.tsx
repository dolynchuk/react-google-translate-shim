import { act, render } from "@testing-library/react";
import { GoogleTranslateRecoveryNotice } from "./GoogleTranslateRecoveryNotice";
import { notifyRecovery, useGoogleTranslateRecovery } from "./recovery";

function CountProbe() {
  const { count } = useGoogleTranslateRecovery();
  return <span data-testid="count">{count}</span>;
}

describe("useGoogleTranslateRecovery", () => {
  it("increments the count on each recovery", () => {
    const { getByTestId } = render(<CountProbe />);
    const before = Number(getByTestId("count").textContent);

    act(() => notifyRecovery());

    expect(Number(getByTestId("count").textContent)).toBe(before + 1);
  });
});

describe("GoogleTranslateRecoveryNotice", () => {
  it("stays hidden for recoveries that predate mount", () => {
    // A recovery before the notice mounts must not surface on it.
    act(() => notifyRecovery());
    const { container } = render(
      <GoogleTranslateRecoveryNotice>recovered</GoogleTranslateRecoveryNotice>
    );
    expect(container.textContent).toBe("");
  });

  it("shows on a fresh recovery and auto-hides after the duration", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(
        <GoogleTranslateRecoveryNotice duration={1000}>
          recovered
        </GoogleTranslateRecoveryNotice>
      );
      expect(container.textContent).toBe("");

      act(() => notifyRecovery());
      expect(container.textContent).toBe("recovered");

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(container.textContent).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });
});
