import { isGoogleTranslateActive, patchDomForGoogleTranslate } from "./core";

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

  describe("remount strategy", () => {
    it("does not throw and notifies with the target parent when removeChild hits a reparented node", () => {
      activateGoogleTranslate();
      const onConflict = vi.fn();
      patchDomForGoogleTranslate({ onConflict, strategy: "remount" });

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
      patchDomForGoogleTranslate({ onConflict, strategy: "remount" });

      const parent = document.createElement("div");
      const detachedReference = document.createElement("span");
      const newNode = document.createElement("b");

      expect(() =>
        parent.insertBefore(newNode, detachedReference)
      ).not.toThrow();
      expect(parent.contains(newNode)).toBe(true);
      expect(onConflict).toHaveBeenCalledWith(parent);
    });
  });

  describe("repair strategy", () => {
    it("detaches the reparented node without remounting or notifying", () => {
      activateGoogleTranslate();
      const onConflict = vi.fn();
      patchDomForGoogleTranslate({ onConflict, strategy: "repair" });

      const parent = document.createElement("div");
      const translationWrapper = document.createElement("font");
      const text = document.createTextNode("hello");
      parent.append(translationWrapper);
      translationWrapper.append(text);

      expect(() => parent.removeChild(text)).not.toThrow();
      // Healed in place: the node is actually gone, and no remount was signalled.
      expect(text.parentNode).toBeNull();
      expect(onConflict).not.toHaveBeenCalled();
    });

    it("inserts before the wrapper ancestor to preserve order", () => {
      activateGoogleTranslate();
      const onConflict = vi.fn();
      patchDomForGoogleTranslate({ onConflict, strategy: "repair" });

      const parent = document.createElement("div");
      const wrapper = document.createElement("font");
      const reference = document.createTextNode("ref");
      parent.append(wrapper);
      wrapper.append(reference);
      const newNode = document.createElement("b");

      parent.insertBefore(newNode, reference);

      // newNode lands before the <font> that holds the reference, not appended.
      expect(parent.firstChild).toBe(newNode);
      expect(onConflict).not.toHaveBeenCalled();
    });
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
