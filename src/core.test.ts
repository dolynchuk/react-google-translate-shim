import {
  beginRecovery,
  endRecovery,
  isGoogleTranslateActive,
  patchDomForGoogleTranslate,
} from "./core";

describe("patchDomForGoogleTranslate", () => {
  afterEach(() => {
    endRecovery();
    document.documentElement.classList.remove(
      "translated-ltr",
      "translated-rtl"
    );
  });

  const activateGoogleTranslate = () => {
    document.documentElement.classList.add("translated-ltr");
  };

  it("does not throw and notifies with the target parent when removeChild hits a reparented node", () => {
    activateGoogleTranslate();
    const onConflict = vi.fn();
    patchDomForGoogleTranslate({ onConflict });

    const parent = document.createElement("div");
    const translationWrapper = document.createElement("font");
    const text = document.createTextNode("hello");
    parent.append(translationWrapper);
    // Google Translate moves the text node under its own <font> wrapper, so
    // React's `parent.removeChild(text)` call no longer matches reality.
    translationWrapper.append(text);

    expect(() => parent.removeChild(text)).not.toThrow();
    expect(onConflict).toHaveBeenCalledWith(parent);
  });

  it("notifies on conflict when insertBefore references a reparented node", () => {
    activateGoogleTranslate();
    const onConflict = vi.fn();
    patchDomForGoogleTranslate({ onConflict });

    const parent = document.createElement("div");
    const detachedReference = document.createElement("span");
    const newNode = document.createElement("b");

    expect(() => parent.insertBefore(newNode, detachedReference)).not.toThrow();
    expect(parent.contains(newNode)).toBe(true);
    expect(onConflict).toHaveBeenCalledWith(parent);
  });

  it("intervenes on a <font> reparent even without the widget class (Chrome/Edge native translate)", () => {
    // Browser-native translators wrap text in <font> but never set the
    // translated-ltr/-rtl class, so the class gate alone would miss them.
    const onConflict = vi.fn();
    patchDomForGoogleTranslate({ onConflict });

    const parent = document.createElement("div");
    const translationWrapper = document.createElement("font");
    const text = document.createTextNode("hello");
    parent.append(translationWrapper);
    translationWrapper.append(text);

    expect(isGoogleTranslateActive()).toBe(false);
    expect(() => parent.removeChild(text)).not.toThrow();
    expect(onConflict).toHaveBeenCalledWith(parent);
  });

  it("intervenes when a detached node's intended parent holds a <font> wrapper", () => {
    const onConflict = vi.fn();
    patchDomForGoogleTranslate({ onConflict });

    const parent = document.createElement("div");
    parent.append(document.createElement("font"));
    const detached = document.createTextNode("world");

    expect(() => parent.removeChild(detached)).not.toThrow();
    expect(onConflict).toHaveBeenCalledWith(parent);
  });

  it("lets the genuine NotFoundError surface when translate is NOT active", () => {
    const onConflict = vi.fn();
    patchDomForGoogleTranslate({ onConflict });

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
    patchDomForGoogleTranslate({ onConflict });

    const parent = document.createElement("div");
    const child = document.createElement("span");
    parent.append(child);

    parent.removeChild(child);

    expect(parent.contains(child)).toBe(false);
    expect(onConflict).not.toHaveBeenCalled();
  });

  it("tolerates stale removals during recovery even when translate is inactive, without re-notifying", () => {
    const onConflict = vi.fn();
    patchDomForGoogleTranslate({ onConflict });

    const parent = document.createElement("div");
    const detached = document.createElement("span");

    // Mid-recovery, translate may have switched off, yet React's teardown must
    // never throw on a node that is no longer where it expects.
    beginRecovery();
    expect(() => parent.removeChild(detached)).not.toThrow();
    expect(onConflict).not.toHaveBeenCalled();
    endRecovery();

    // Outside recovery the same call surfaces the genuine error again.
    expect(() => parent.removeChild(detached)).toThrow();
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
