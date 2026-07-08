import { render, waitFor } from "@testing-library/react";
import { useGoogleTranslateActive } from "./useGoogleTranslateActive";

function Probe() {
  const active = useGoogleTranslateActive();
  return <span data-testid="state">{active ? "on" : "off"}</span>;
}

describe("useGoogleTranslateActive", () => {
  afterEach(() => {
    document.documentElement.classList.remove(
      "translated-ltr",
      "translated-rtl"
    );
  });

  it("starts false and turns true when the translate class appears", async () => {
    const { getByTestId } = render(<Probe />);
    expect(getByTestId("state").textContent).toBe("off");

    document.documentElement.classList.add("translated-ltr");
    await waitFor(() => expect(getByTestId("state").textContent).toBe("on"));

    document.documentElement.classList.remove("translated-ltr");
    await waitFor(() => expect(getByTestId("state").textContent).toBe("off"));
  });
});
