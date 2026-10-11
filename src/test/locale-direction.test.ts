import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, getDirection, resolveLocale, translate } from "@/features/i18n/locale";

describe("locale direction", () => {
  it("defaults to Arabic", () => {
    expect(DEFAULT_LOCALE).toBe("ar");
  });
  it("Arabic is right-to-left", () => {
    expect(getDirection("ar")).toBe("rtl");
  });
  it("English is left-to-right", () => {
    expect(getDirection("en")).toBe("ltr");
  });
  it("unknown locale values fall back to Arabic", () => {
    expect(resolveLocale("fr")).toBe("ar");
    expect(resolveLocale(null)).toBe("ar");
    expect(resolveLocale("en")).toBe("en");
  });
  it("translates the app name in both languages", () => {
    expect(translate("en", "app.name")).toBe("KAU AI Program Studio");
    expect(translate("ar", "app.name")).not.toBe(translate("en", "app.name"));
  });
});
