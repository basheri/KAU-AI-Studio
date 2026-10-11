import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "@/features/i18n/LocaleProvider";
import type { MessageKey } from "@/features/i18n/locale";
import {
  INTAKE_MODES,
  PROGRAM_CATEGORIES,
  parseProposalText,
  validateUpload,
  type IntakeMode,
  type ProgramCategory,
} from "./brief";
import { createBrief, uploadProposal, UploadRejected } from "./api";
import { aiDraftBrief } from "@/features/ai/ai.functions";
import { useAiEnabled } from "@/features/ai/useAiEnabled";
import { friendlyError } from "@/features/guidance/errors";

const k = (s: string) => s as MessageKey;

export function IntakeForm({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: (versionId: string) => void;
}) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const [mode, setMode] = useState<IntakeMode>("guided_idea");
  const [category, setCategory] = useState<ProgramCategory>("academic_program");
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [problem, setProblem] = useState<MessageKey | null>(null);
  const [idea, setIdea] = useState("");
  const [aiNote, setAiNote] = useState("");
  const ai = useAiEnabled();

  const m = useMutation({
    mutationFn: async () => {
      setAiNote("");
      const fields = { title: { ar: titleAr, en: titleEn } };
      if (mode === "document_upload") {
        const up = await uploadProposal(projectId, file!);
        return createBrief({ projectId, mode, category, fields, sourceFileId: up.fileId });
      }
      if (mode === "redevelopment") {
        return createBrief({
          projectId,
          mode,
          category,
          fields,
          snapshot: {
            source_label: sourceLabel || titleEn || titleAr,
            raw_text: sourceText,
            fields: parseProposalText(sourceText),
          },
        });
      }
      const vid = await createBrief({ projectId, mode, category, fields });
      // Optional head start: AI fills only the empty fields as AI drafts a person must accept.
      if (ai.enabled && idea.trim().length >= 10) {
        try {
          await aiDraftBrief({ data: { versionId: vid, idea: idea.trim() } });
        } catch (e) {
          setAiNote(friendlyError(e, t));
        }
      }
      return vid;
    },
    onSuccess: (vid) => {
      setIdea("");
      setTitleAr("");
      setTitleEn("");
      setFile(null);
      setSourceText("");
      setSourceLabel("");
      void qc.invalidateQueries({ queryKey: ["structured-artifacts", projectId] });
      void qc.invalidateQueries({ queryKey: ["brief", vid] });
      onCreated(vid);
    },
    onError: (e) => {
      if (e instanceof UploadRejected)
        setProblem(
          k(
            e.reason === "type"
              ? "ps.fileType"
              : e.reason === "size"
                ? "ps.fileSize"
                : "ps.fileEmpty",
          ),
        );
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    let p: MessageKey | null = null;
    if (!titleAr.trim() && !titleEn.trim()) p = "ps.titleRequired";
    else if (mode === "document_upload") {
      if (!file) p = "ps.fileRequired";
      else {
        const v = validateUpload(file);
        if (v) p = k(v === "type" ? "ps.fileType" : v === "size" ? "ps.fileSize" : "ps.fileEmpty");
      }
    } else if (mode === "redevelopment" && !sourceText.trim()) p = "ps.sourceRequired";
    setProblem(p);
    if (!p) m.mutate();
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate aria-labelledby="intake-h">
      <h2 id="intake-h" className="font-semibold">
        {t("ps.newBrief")}
      </h2>
      <fieldset>
        <legend className="field-label">{t("ps.mode")}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {INTAKE_MODES.map((x) => (
            <label
              key={x}
              className={mode === x ? "choice-card choice-card-active" : "choice-card"}
            >
              <input
                type="radio"
                name="intake-mode"
                value={x}
                checked={mode === x}
                onChange={() => {
                  setMode(x);
                  setProblem(null);
                }}
              />
              <span>{t(k(`mode.${x}`))}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="in-cat" className="field-label">
          {t("ps.category")}
        </label>
        <select
          id="in-cat"
          className="field-input"
          value={category}
          onChange={(e) => setCategory(e.target.value as ProgramCategory)}
        >
          {PROGRAM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(k(`cat.${c}`))}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="in-tar" className="field-label">
            {t("ps.titleAr")}
          </label>
          <input
            id="in-tar"
            dir="rtl"
            lang="ar"
            className="field-input"
            maxLength={200}
            value={titleAr}
            onChange={(e) => setTitleAr(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="in-ten" className="field-label">
            {t("ps.titleEn")}
          </label>
          <input
            id="in-ten"
            dir="ltr"
            lang="en"
            className="field-input"
            maxLength={200}
            value={titleEn}
            onChange={(e) => setTitleEn(e.target.value)}
          />
        </div>
      </div>
      {mode === "guided_idea" && ai.enabled && (
        <div>
          <label htmlFor="in-idea" className="field-label">
            {t("ps.ideaOptional")}
          </label>
          <textarea
            id="in-idea"
            dir="auto"
            rows={3}
            maxLength={4000}
            className="field-input"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
          />
        </div>
      )}
      {mode === "document_upload" && (
        <div>
          <label htmlFor="in-file" className="field-label">
            {t("ps.file")}
          </label>
          <input
            id="in-file"
            type="file"
            className="field-input"
            aria-describedby="in-file-hint"
            accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setProblem(null);
            }}
          />
          <p id="in-file-hint" className="mt-1 text-xs text-muted-foreground">
            {t("ps.fileHint")}
          </p>
        </div>
      )}
      {mode === "redevelopment" && (
        <>
          <div>
            <label htmlFor="in-slabel" className="field-label">
              {t("ps.sourceLabel")}
            </label>
            <input
              id="in-slabel"
              className="field-input"
              maxLength={200}
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="in-source" className="field-label">
              {t("ps.source")}
            </label>
            <textarea
              id="in-source"
              dir="auto"
              rows={6}
              className="field-input font-mono"
              aria-describedby="in-source-hint"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
            />
            <p id="in-source-hint" className="mt-1 text-xs text-muted-foreground">
              {t("ps.sourceHint")}
            </p>
          </div>
        </>
      )}
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {t(problem)}
        </p>
      )}
      {m.isError && !(m.error instanceof UploadRejected) && (
        <p role="alert" className="text-sm text-destructive">
          {friendlyError(m.error, t)}
        </p>
      )}
      {aiNote && (
        <p role="status" className="text-sm text-muted-foreground">
          {aiNote}
        </p>
      )}
      <button className="btn-primary" disabled={m.isPending}>
        {m.isPending ? t("ps.working") : t("ps.createBrief")}
      </button>
    </form>
  );
}
