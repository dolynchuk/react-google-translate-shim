import { render, waitFor } from "@testing-library/react";
import { GoogleTranslateWarning } from "./GoogleTranslateWarning";

describe("GoogleTranslateWarning", () => {
  afterEach(() => {
    document.documentElement.classList.remove(
      "translated-ltr",
      "translated-rtl"
    );
  });

  it("renders nothing until translate is active, then shows the message", async () => {
    const { container } = render(
      <GoogleTranslateWarning>Editing may reset</GoogleTranslateWarning>
    );
    expect(container.textContent).toBe("");

    document.documentElement.classList.add("translated-ltr");
    await waitFor(() =>
      expect(container.textContent).toBe("Editing may reset")
    );

    document.documentElement.classList.remove("translated-ltr");
    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("falls back to a built-in message and marks itself as a status region", async () => {
    const { container } = render(<GoogleTranslateWarning />);

    document.documentElement.classList.add("translated-rtl");
    await waitFor(() =>
      expect(container.querySelector('[role="status"]')?.textContent).toContain(
        "Translation is on"
      )
    );
  });
});
