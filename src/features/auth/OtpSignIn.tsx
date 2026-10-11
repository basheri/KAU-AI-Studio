import { useState, type FormEvent } from "react";
import { Mail, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLocale } from "@/features/i18n/LocaleProvider";
import { normalizeKauEmail } from "./kau-email";

export function OtpSignIn() {
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = normalizeKauEmail(email);
    if (!normalized) {
      setError(t("auth.invalidDomain"));
      return; // never contact the server for non-KAU addresses
    }
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (err) setError(t("auth.failed"));
    else setSentTo(normalized);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const token = code.replace(/\s/g, "");
    if (!sentTo || !/^\d{6,10}$/.test(token)) {
      setError(t("auth.invalidCode"));
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.verifyOtp({ email: sentTo, token, type: "email" });
    setBusy(false);
    if (err) setError(t("auth.invalidCode"));
  }

  return (
    <section className="surface-card mx-auto max-w-md p-6" aria-labelledby="otp-title">
      <h2 id="otp-title" className="text-lg font-semibold">
        {t("auth.title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("auth.body")}</p>

      {!sentTo ? (
        <form onSubmit={requestCode} noValidate className="mt-5 space-y-3">
          <label htmlFor="otp-email" className="field-label">
            {t("auth.email")}
          </label>
          <div className="relative">
            <Mail className="field-icon" aria-hidden />
            <input
              id="otp-email"
              type="email"
              dir="ltr"
              autoComplete="email"
              inputMode="email"
              required
              placeholder="name@kau.edu.sa"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "otp-error" : undefined}
              className="field-input ps-9"
            />
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {t("auth.sendCode")}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} noValidate className="mt-5 space-y-3">
          <p className="text-sm">
            {t("auth.codeSent")}{" "}
            <bdi dir="ltr" className="font-medium">
              {sentTo}
            </bdi>
          </p>
          <label htmlFor="otp-code" className="field-label">
            {t("auth.code")}
          </label>
          <div className="relative">
            <KeyRound className="field-icon" aria-hidden />
            <input
              id="otp-code"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "otp-error" : undefined}
              className="field-input ps-9 tracking-widest"
            />
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {t("auth.verify")}
          </button>
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              setSentTo(null);
              setCode("");
              setError(null);
            }}
          >
            {t("auth.changeEmail")}
          </button>
        </form>
      )}
      {error && (
        <p id="otp-error" role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
