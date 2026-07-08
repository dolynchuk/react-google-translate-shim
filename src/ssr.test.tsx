import { renderToStaticMarkup } from "react-dom/server";
import { GoogleTranslateBoundary } from "./GoogleTranslateBoundary";
import { GoogleTranslateRecoveryNotice } from "./GoogleTranslateRecoveryNotice";
import { GoogleTranslateWarning } from "./GoogleTranslateWarning";

describe("server rendering", () => {
  it("renders the boundary and its children to markup without throwing", () => {
    const html = renderToStaticMarkup(
      <GoogleTranslateBoundary>
        <p>hello</p>
      </GoogleTranslateBoundary>
    );
    expect(html).toContain("hello");
  });

  it("renders the warning as inactive and the notice as empty on the server", () => {
    const html = renderToStaticMarkup(
      <>
        <GoogleTranslateWarning />
        <GoogleTranslateRecoveryNotice />
      </>
    );
    // Both are dormant without an active translation / recovery.
    expect(html).toBe("");
  });
});
