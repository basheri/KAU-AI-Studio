import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "@/features/i18n/LocaleProvider";
import type { MessageKey } from "@/features/i18n/locale";
import {
  aiStatusQuery,
  aiUsageQuery,
  deleteGlossaryTerm,
  glossaryQuery,
  isPlatformAdminQuery,
  saveGlossaryTerm,
  summarizeUsage,
} from "./api";
import { AiError } from "./AiParts";

export function AiStatusCard() {
  const { t } = useLocale();
  const s = useQuery(aiStatusQuery);
  return (
    <section className="surface-card space-y-3 p-5" aria-labelledby="st-ai">
      <h2 id="st-ai" className="font-semibold">
        {t("settings.ai")}
      </h2>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{t("settings.status")}</dt>
          <dd>
            {s.data ? t(s.data.enabled ? "settings.configured" : "settings.notConfigured") : "…"}
          </dd>
        </div>
        {s.data?.enabled && (
          <>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("settings.aiProvider")}</dt>
              <dd dir="ltr">{s.data.provider}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("settings.aiModel")}</dt>
              <dd dir="ltr">{s.data.model}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("settings.aiLimit")}</dt>
              <dd>{s.data.dailyLimit}</dd>
            </div>
          </>
        )}
      </dl>
      <p className="text-xs text-muted-foreground">{t("settings.aiPrivacy")}</p>
    </section>
  );
}

type Term = { id: string | null; term_ar: string; term_en: string; domain: string; note: string };
const blank: Term = { id: null, term_ar: "", term_en: "", domain: "", note: "" };

export function GlossaryPanel({ userId }: { userId: string }) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const terms = useQuery(glossaryQuery);
  const admin = useQuery(isPlatformAdminQuery(userId));
  const [form, setForm] = useState<Term | null>(null);
  const [invalid, setInvalid] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["glossary"] });
  const save = useMutation({
    mutationFn: (x: Term) => saveGlossaryTerm(x),
    onSuccess: () => (setForm(null), refresh()),
  });
  const del = useMutation({ mutationFn: deleteGlossaryTerm, onSuccess: refresh });
  const submit = () => {
    const bad = !form || !form.term_ar.trim() || !form.term_en.trim();
    setInvalid(bad);
    if (!bad) save.mutate(form!);
  };
  return (
    <section className="surface-card space-y-3 p-5 md:col-span-2" aria-labelledby="st-glossary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="st-glossary" className="font-semibold">
          {t("settings.glossary")}
        </h2>
        {admin.data && !form && (
          <button type="button" className="btn-primary" onClick={() => setForm(blank)}>
            {t("settings.addTerm")}
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("settings.glossaryNote")} {!admin.data && t("settings.glossaryAdminOnly")}
      </p>
      {form && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["term_ar", "settings.termAr", undefined],
              ["term_en", "settings.termEn", "ltr"],
              ["domain", "settings.domain", undefined],
              ["note", "settings.note", undefined],
            ] as const
          ).map(([k, l, dir]) => (
            <div key={k}>
              <label htmlFor={`gl-${k}`} className="field-label">
                {t(l)}
              </label>
              <input
                id={`gl-${k}`}
                className="field-input"
                dir={dir}
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button
              type="button"
              className="btn-primary"
              disabled={save.isPending}
              onClick={submit}
            >
              {t("settings.save")}
            </button>
            <button type="button" className="btn-link" onClick={() => setForm(null)}>
              {t("settings.cancel")}
            </button>
          </div>
          {invalid && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {t("settings.termInvalid")}
            </p>
          )}
          <AiError error={save.error} />
        </div>
      )}
      {terms.data && !terms.data.length ? (
        <p className="text-sm text-muted-foreground">{t("settings.glossaryEmpty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-muted-foreground">
                <th className="py-1 text-start font-medium">{t("settings.termAr")}</th>
                <th className="py-1 text-start font-medium">{t("settings.termEn")}</th>
                <th className="py-1 text-start font-medium">{t("settings.domain")}</th>
                {admin.data && <th className="sr-only">{t("settings.edit")}</th>}
              </tr>
            </thead>
            <tbody>
              {terms.data?.map((x) => (
                <tr key={x.id} className="border-t border-border">
                  <td className="py-1" lang="ar" dir="rtl">
                    {x.term_ar}
                  </td>
                  <td className="py-1" lang="en" dir="ltr">
                    {x.term_en}
                  </td>
                  <td className="py-1">{x.domain}</td>
                  {admin.data && (
                    <td className="py-1 text-end">
                      <button type="button" className="btn-link me-3" onClick={() => setForm(x)}>
                        {t("settings.edit")}
                      </button>
                      <button
                        type="button"
                        className="btn-link"
                        disabled={del.isPending}
                        onClick={() => del.mutate(x.id)}
                      >
                        {t("settings.delete")}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AiError error={del.error} />
    </section>
  );
}

export function AiUsagePanel({ userId }: { userId: string }) {
  const { t } = useLocale();
  const usage = useQuery(aiUsageQuery(userId));
  const rows = summarizeUsage(usage.data ?? []);
  const cols = ["calls", "failed", "accepted", "edited", "discarded", "tokens"] as const;
  return (
    <section className="surface-card space-y-3 p-5 md:col-span-2" aria-labelledby="st-usage">
      <h2 id="st-usage" className="font-semibold">
        {t("settings.usage")}
      </h2>
      <p className="text-xs text-muted-foreground">{t("settings.usageScope")}</p>
      {usage.isError && <AiError error={usage.error} />}
      {!rows.length ? (
        <p className="text-sm text-muted-foreground">{t("settings.usage.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 text-start font-medium">{t("settings.usage.feature")}</th>
                {cols.map((c) => (
                  <th key={c} className="py-1 text-end font-medium">
                    {t(`settings.usage.${c}` as MessageKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.feature} className="border-t border-border">
                  <td className="py-1">
                    {t(`ai.feature.${r.feature}` as MessageKey) ?? r.feature}
                  </td>
                  {cols.map((c) => (
                    <td key={c} className="py-1 text-end tabular-nums">
                      {r[c].toLocaleString()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.some(
        (r) =>
          r.accepted >= 10 && r.accepted / Math.max(1, r.accepted + r.edited + r.discarded) > 0.95,
      ) && <p className="notice notice-warn">{t("settings.usage.warn")}</p>}
    </section>
  );
}
