import { describe, expect, it } from "vitest";
import { KAU_EMAIL_DOMAIN, normalizeKauEmail } from "@/features/auth/kau-email";

describe("KAU email validation", () => {
  it("uses the kau.edu.sa domain", () => {
    expect(KAU_EMAIL_DOMAIN).toBe("kau.edu.sa");
  });
  it("accepts and normalizes a KAU address (trim + lowercase)", () => {
    expect(normalizeKauEmail("  Ahmed.Ali@KAU.edu.SA ")).toBe("ahmed.ali@kau.edu.sa");
  });
  it("rejects other domains", () => {
    expect(normalizeKauEmail("someone@gmail.com")).toBeNull();
  });
  it("rejects look-alike and sub-domain tricks", () => {
    expect(normalizeKauEmail("x@kau.edu.sa.evil.com")).toBeNull();
    expect(normalizeKauEmail("x@evilkau.edu.sa")).toBeNull();
    expect(normalizeKauEmail("x@sub.kau.edu.sa")).toBeNull();
    expect(normalizeKauEmail("a@b@kau.edu.sa")).toBeNull();
  });
  it("rejects empty or malformed input", () => {
    expect(normalizeKauEmail("")).toBeNull();
    expect(normalizeKauEmail("@kau.edu.sa")).toBeNull();
    expect(normalizeKauEmail("has space@kau.edu.sa")).toBeNull();
  });
});
