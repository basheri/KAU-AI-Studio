import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "@/features/i18n/LocaleProvider";
import type { MessageKey } from "@/features/i18n/locale";
import type { MyProject } from "@/features/projects/api";
import { rulesetsQuery, saveRule, type SourceRow } from "@/features/compliance/api";
import { aiDraftComplianceRules } from "./ai.functions";
import { AiError, AiPanel } from "./AiParts";
import { recordAiOutcome } from "./api";

const k = (s: string) => s as MessageKey;
type Draft = Awaited<ReturnType<typeof aiDraftComplianceRules>>["rules"][number];

/** Draft rules from a source document. Each is saved only as a draft citing the clause; activation stays with a reviewer. */
export function RuleDraftAi({ project, source }: { project: MyProject; source: SourceRow }) {
  const { t, locale } = useLocale();
  const qc = useQueryClient();
  const rulesets = useQuery(rulesetsQuery(project.id));
  const [rsId, setRsId] = useState("");
  const [result, setResult] = useState<{ requestId: string; rules: Draft[] } | null>(null);
  const [saved, setSaved] = useState<Record<number, true>>({});
  const rs = rulesets.data?.find((x) => x.id === rsId) ?? rulesets.data?.[0];
  const draft = useMutation({
    mutationFn: () => aiDraftComplianceRules({ data: { sourceId: source.id! } }),
    onSuccess: (r) => (setSaved({}), setResult(r)),
  });
  const save = useMutation({
    mutationFn: ({ r }: { r: Draft; i: number }) =>
      saveRule(
        rs!.id,
        null,
        {
          rule_code: r.rule_code,
          statement_ar: r.statement_ar,
          statement_en: r.statement_en,
          remediation_ar: r.remediation_ar,
          remediation_en: r.remediation_en,
          severity: r.severity,
          check_type: "manual",
          check_spec: null,
          effective_from: new Date().toISOString().slice(0, 10),
        },
        [
          {
            source_id: source.id!,
            locator: r.clause.slice(0, 300),
            page: r.page ? String(r.page) : "",
            section: "",
          },
        ],
      ),
    onSuccess: (_d, v) => {
      setSaved((s) => ({ ...s, [v.i]: true }));
      void recordAiOutcome(result?.requestId, "accepted").catch(() => {});
      void qc.invalidateQueries({ queryKey: ["compliance-rules", project.id] });
    },
  });

  return (
    <details className="mt-2">
      <summary className="btn-link cursor-pointer">{t("ai.cl.draftRules")}</summary>
      <div className="mt-2">
        <AiPanel title={t("ai.cl.draftRules")} id={`cl-ai-${source.id}`}>
          {!rs ? (
            <p className="text-sm text-muted-foreground">{t("ai.cl.chooseRuleset")}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-48">
                  <label htmlFor={`cl-ai-rs-${source.id}`} className="field-label">
                    {t("cl.ruleset")}
                  </label>
                  <select
                    id={`cl-ai-rs-${source.id}`}
                    className="field-input"
                    value={rs.id}
                    onChange={(e) => setRsId(e.target.value)}
                  >
                    {rulesets.data!.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.code}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={draft.isPending}
                  onClick={() => draft.mutate()}
                >
                  {draft.isPending ? t("ai.working") : t("ai.cl.draftRules")}
                </button>
              </div>
              {result && (
                <ul className="space-y-2">
                  {result.rules.map((r, i) => (
                    <li key={i} className="ai-suggestion space-y-1">
                      <p className="font-medium">
                        <span dir="ltr">{r.rule_code}</span> · {t(k(`cl.sev.${r.severity}`))} ·{" "}
                        {t("ai.cl.clause")} <span dir="auto">{r.clause}</span>
                        {r.page ? ` · ${t("cl.page")} ${r.page}` : ""}
                      </p>
                      <p dir="auto">
                        {locale === "ar"
                          ? r.statement_ar || r.statement_en
                          : r.statement_en || r.statement_ar}
                      </p>
                      {saved[i] ? (
                        <p role="status" className="text-sm text-secondary">
                          {t("ai.cl.saved")}
                        </p>
                      ) : (
                        <button
                          type="button"
                          className="chip-btn"
                          disabled={save.isPending}
                          onClick={() => save.mutate({ r, i })}
                        >
                          {t("ai.cl.saveDraft")}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <AiError error={draft.error ?? save.error} />
        </AiPanel>
      </div>
    </details>
  );
}
