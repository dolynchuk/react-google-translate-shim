import {
  isGoogleTranslateActive,
  patchDomForGoogleTranslate,
} from "./googleTranslateShim";

describe("patchDomForGoogleTranslate", () => {
  afterEach(() => {
    document.documentElement.classList.remove(
      "translated-ltr",
      "translated-rtl"
    );
  });

  const activateGoogleTranslate = () => {
    document.documentElement.classList.add("translated-ltr");
  };

  it("does not throw and notifies on conflict when removeChild targets a reparented node while translate is active", () => {
    activateGoogleTranslate();
    const onConflict = vi.fn();
    patchDomForGoogleTranslate(onConflict);

    const parent = document.createElement("div");
    const translationWrapper = document.createElement("font");
    const text = document.createTextNode("hello");
    parent.append(translationWrapper);
    // Google Translate moves the text node under its own <font> wrapper, so
    // React's `parent.removeChild(text)` call no longer matches reality.
    translationWrapper.append(text);

    expect(() => parent.removeChild(text)).not.toThrow();
    expect(onConflict).toHaveBeenCalledTimes(1);
  });

  it("lets the genuine NotFoundError surface when translate is NOT active", () => {
    const onConflict = vi.fn();
    patchDomForGoogleTranslate(onConflict);

    const parent = document.createElement("div");
    const other = document.createElement("div");
    const child = document.createElement("span");
    other.append(child);

    expect(() => parent.removeChild(child)).toThrow();
    expect(onConflict).not.toHaveBeenCalled();
  });

  it("still removes a genuine child normally without signalling a conflict", () => {
    activateGoogleTranslate();
    const onConflict = vi.fn();
    patchDomForGoogleTranslate(onConflict);

    const parent = document.createElement("div");
    const child = document.createElement("span");
    parent.append(child);

    parent.removeChild(child);

    expect(parent.contains(child)).toBe(false);
    expect(onConflict).not.toHaveBeenCalled();
  });

  it("does not throw and notifies on conflict when insertBefore references a reparented node while translate is active", () => {
    activateGoogleTranslate();
    const onConflict = vi.fn();
    patchDomForGoogleTranslate(onConflict);

    const parent = document.createElement("div");
    const reference = document.createElement("span");
    const detachedReference = document.createElement("span");
    parent.append(reference);
    // Reference node was moved out from under `parent`, mirroring the translate
    // reparenting; the native insertBefore would throw NotFoundError here.
    const newNode = document.createElement("b");

    expect(() => parent.insertBefore(newNode, detachedReference)).not.toThrow();
    expect(parent.contains(newNode)).toBe(true);
    expect(onConflict).toHaveBeenCalledTimes(1);
  });
});

describe("isGoogleTranslateActive", () => {
  afterEach(() => {
    document.documentElement.classList.remove(
      "translated-ltr",
      "translated-rtl"
    );
  });

  it("is false on an untranslated page", () => {
    expect(isGoogleTranslateActive()).toBe(false);
  });

  it("is true once the translate class is present", () => {
    document.documentElement.classList.add("translated-rtl");
    expect(isGoogleTranslateActive()).toBe(true);
  });
});
