import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInWithOtp } = vi.hoisted(() => ({
  signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithOtp, verifyOtp: vi.fn() } },
}));

import { OtpSignIn } from "@/features/auth/OtpSignIn";
import { LocaleProvider } from "@/features/i18n/LocaleProvider";

function setup() {
  render(
    <LocaleProvider>
      <OtpSignIn />
    </LocaleProvider>,
  );
  return screen.getByLabelText("البريد الجامعي");
}

describe("KAU email OTP request", () => {
  beforeEach(() => signInWithOtp.mockClear());

  it("does not request an OTP for a non-KAU address", async () => {
    fireEvent.change(setup(), { target: { value: "someone@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال الرمز" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("requests an OTP with the normalized KAU address", async () => {
    fireEvent.change(setup(), { target: { value: "  Sara@KAU.EDU.SA " } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال الرمز" }));
    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledTimes(1));
    expect(signInWithOtp.mock.calls[0]?.[0].email).toBe("sara@kau.edu.sa");
  });
});
