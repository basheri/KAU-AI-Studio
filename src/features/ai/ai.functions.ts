import { createServerFn } from "@tanstack/react-start";
import * as z from "zod/v4";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parsePayload } from "@/features/course/blocks";
import { bytesToBase64 } from "./base64";
import { AiError, parseAiConfig, providerFor, runAi, type AiConfig } from "./engine";
import {
  AI_BLOCK_TYPES,
  AI_BRIEF_FIELDS,
  alignmentExplainSchema,
  altTextSchema,
  blockSchemas,
  briefDraftSchema,
  briefTranslateSchema,
  complianceRulesSchema,
  consistencySchema,
  learnerCheckSchema,
  programOutcomesSchema,
  reviewSummarySchema,
  specAssessmentsSchema,
  specDescriptionSchema,
  specObjectivesSchema,
  specOutcomesSchema,
  specReferencesSchema,
  specTopicsSchema,
  translateSchema,
} from "./schemas";

// Server boundary for AI assistance. Environment values are read only inside these handlers and
// never returned. Every handler reads its context as the signed-in user (RLS proves membership),
// then runs through runAi (role check, daily limit, usage log, audit).

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);
const short = (max: number) => z.string().max(max);
const validate =
  <S extends z.ZodType>(schema: S) =>
  (input: unknown): z.infer<S> => {
    const r = schema.safeParse(input);
    if (!r.success) throw new Error("Invalid request");
    return r.data;
  };

const env = (): AiConfig =>
  parseAiConfig({
    AI_ENABLED: process.env["AI_ENABLED"],
    ANTHROPIC_API_KEY: process.env["ANTHROPIC_API_KEY"],
    AI_MODEL: process.env["AI_MODEL"],
    AI_DAILY_LIMIT: process.env["AI_DAILY_LIMIT"],
  });

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function fail(e: unknown): never {
  throw new Error(e instanceof AiError ? e.message : "The AI request could not be completed");
}

type Ctx = {
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >;
  userId: string;
};

async function run<T>(
  ctx: Ctx,
  projectId: string,
  feature: Parameters<typeof runAi>[0]["feature"],
  input: unknown,
  schema: z.ZodType<T>,
  extra: { attachment?: Parameters<typeof runAi>[0]["attachment"]; targetRef?: string } = {},
) {
  try {
    const cfg = env();
    return await runAi({
      admin: await admin(),
      provider: providerFor(cfg),
      dailyLimit: cfg.dailyLimit,
      userId: ctx.userId,
      projectId,
      feature,
      input,
      schema,
      ...extra,
    });
  } catch (e) {
    fail(e);
  }
}

type Bi = { ar: string; en: string };
const pickBi = (f: unknown): Bi => {
  const o = (f ?? {}) as Partial<Bi>;
  return { ar: String(o.ar ?? ""), en: String(o.en ?? "") };
};

async function loadBrief(ctx: Ctx, versionId: string) {
  const b = await ctx.supabase
    .from("program_briefs")
    .select(
      "project_id, category, fields, artifact_versions!program_briefs_artifact_version_id_fkey(state)",
    )
    .eq("artifact_version_id", versionId)
    .single();
  if (b.error || !b.data) throw new Error("Brief not found");
  const fields = b.data.fields as Record<string, Bi>;
  const state = (b.data.artifact_versions as unknown as { state: string } | null)?.state;
  return { projectId: b.data.project_id, category: b.data.category, fields, state };
}

const briefSummary = (fields: Record<string, Bi>) =>
  Object.fromEntries(
    [
      "title",
      "rationale",
      "target_learners",
      "delivery_mode",
      "duration_credits",
      "intended_outcomes",
    ].map((k) => [k, pickBi(fields[k])]),
  );

/** Non-secret status for the UI. */
export const getAiStatus = createServerFn({ method: "GET" }).handler(async () => {
  const cfg = env();
  return {
    enabled: cfg.enabled,
    provider: cfg.provider,
    model: cfg.model,
    dailyLimit: cfg.dailyLimit,
  };
});

// ===== Phase 1: briefs =====

export const aiDraftBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate(z.object({ versionId: uuid, idea: short(4000).min(10) })))
  .handler(async ({ data, context }) => {
    const brief = await loadBrief(context, data.versionId);
    if (brief.state !== "draft") throw new Error("Only draft briefs can receive AI text");
    const res = await run(
      context,
      brief.projectId,
      "brief_draft",
      { idea: data.idea, category: brief.category, existing: briefSummary(brief.fields) },
      briefDraftSchema,
      { targetRef: `brief:${data.versionId}` },
    );
    const rec = await (
      await admin()
    ).rpc("record_ai_brief_output", {
      _version_id: data.versionId,
      _actor: context.userId,
      _request_id: res.requestId,
      _mode: "draft",
      _fields: res.data,
    });
    if (rec.error) throw new Error("The AI draft could not be saved to the brief");
    return { requestId: res.requestId, filled: rec.data ?? [] };
  });

export const aiTranslateBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate(z.object({ versionId: uuid })))
  .handler(async ({ data, context }) => {
    const brief = await loadBrief(context, data.versionId);
    if (brief.state !== "draft") throw new Error("Only draft briefs can be changed");
    const missing = AI_BRIEF_FIELDS.flatMap((k) => {
      const f = pickBi(brief.fields[k]);
      if (f.ar && !f.en) return [{ field: k, from: "ar", to: "en", text: f.ar }];
      if (f.en && !f.ar) return [{ field: k, from: "en", to: "ar", text: f.en }];
      return [];
    });
    if (!missing.length) return { requestId: null, filled: [] as string[] };
    const res = await run(
      context,
      brief.projectId,
      "brief_translate",
      { fields: missing },
      briefTranslateSchema,
      {
        targetRef: `brief:${data.versionId}`,
      },
    );
    const fields: Record<string, Partial<Bi>> = {};
    for (const t of res.data.translations) {
      const want = missing.find((m) => m.field === t.field);
      if (want && want.to === t.lang && t.text.trim()) fields[t.field] = { [t.lang]: t.text };
    }
    const rec = await (
      await admin()
    ).rpc("record_ai_brief_output", {
      _version_id: data.versionId,
      _actor: context.userId,
      _request_id: res.requestId,
      _mode: "translate",
      _fields: fields,
    });
    if (rec.error) throw new Error("The translations could not be saved to the brief");
    return { requestId: res.requestId, filled: rec.data ?? [] };
  });

export const aiCheckBriefConsistency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate(z.object({ versionId: uuid })))
  .handler(async ({ data, context }) => {
    const brief = await loadBrief(context, data.versionId);
    const pairs = AI_BRIEF_FIELDS.map((k) => ({ field: k, ...pickBi(brief.fields[k]) })).filter(
      (p) => p.ar && p.en,
    );
    if (!pairs.length) return { requestId: null, issues: [] };
    const res = await run(
      context,
      brief.projectId,
      "brief_consistency",
      { fields: pairs },
      consistencySchema,
      {
        targetRef: `brief:${data.versionId}`,
      },
    );
    return { requestId: res.requestId, issues: res.data.issues };
  });

// ===== Phase 2: architecture and course specification =====

async function loadArchitecture(ctx: Ctx, versionId: string) {
  const a = await ctx.supabase
    .from("program_architectures")
    .select("project_id, brief_version_id")
    .eq("artifact_version_id", versionId)
    .single();
  if (a.error || !a.data) throw new Error("Architecture not found");
  const b = await ctx.supabase
    .from("program_briefs")
    .select("category, fields")
    .eq("artifact_version_id", a.data.brief_version_id)
    .single();
  return {
    projectId: a.data.project_id,
    brief: b.data
      ? { category: b.data.category, ...briefSummary(b.data.fields as Record<string, Bi>) }
      : {},
  };
}

const codeLabel = z.object({ code: short(40), ar: short(2000), en: short(2000) });

export const aiSuggestProgramOutcomes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate(z.object({ versionId: uuid, existing: z.array(codeLabel).max(100) })))
  .handler(async ({ data, context }) => {
    const arch = await loadArchitecture(context, data.versionId);
    const res = await run(
      context,
      arch.projectId,
      "program_outcomes",
      { program: arch.brief, existing_outcomes: data.existing },
      programOutcomesSchema,
      { targetRef: `architecture:${data.versionId}` },
    );
    return { requestId: res.requestId, outcomes: res.data.outcomes };
  });

export const aiExplainAlignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    validate(
      z.object({
        versionId: uuid,
        defects: z.array(z.object({ defect: short(60), code: short(40) })).max(100),
        elements: z
          .array(z.object({ code: short(40), type: short(40), label: short(2000) }))
          .max(500),
        mappings: z.array(z.object({ from: short(40), to: short(40) })).max(2000),
      }),
    ),
  )
  .handler(async ({ data, context }) => {
    const arch = await loadArchitecture(context, data.versionId);
    if (!data.defects.length) return { requestId: null, explanations: [] };
    const res = await run(
      context,
      arch.projectId,
      "alignment_explain",
      data,
      alignmentExplainSchema,
      {
        targetRef: `architecture:${data.versionId}`,
      },
    );
    return { requestId: res.requestId, explanations: res.data.explanations };
  });

const SPEC_STEPS = {
  description: ["spec_description", specDescriptionSchema],
  objectives: ["spec_objectives", specObjectivesSchema],
  outcomes: ["spec_outcomes", specOutcomesSchema],
  topics: ["spec_topics", specTopicsSchema],
  assessments: ["spec_assessments", specAssessmentsSchema],
  references: ["spec_references", specReferencesSchema],
} as const;
export type SpecStep = keyof typeof SPEC_STEPS;
export type SpecResult =
  | z.infer<typeof specDescriptionSchema>
  | z.infer<typeof specObjectivesSchema>
  | z.infer<typeof specOutcomesSchema>
  | z.infer<typeof specTopicsSchema>
  | z.infer<typeof specAssessmentsSchema>
  | z.infer<typeof specReferencesSchema>;

export const aiCourseSpec = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    validate(
      z.object({
        versionId: uuid,
        step: z.enum(Object.keys(SPEC_STEPS) as [SpecStep, ...SpecStep[]]),
        course: codeLabel.extend({ credit_hours: z.number().min(0).max(30).nullable() }),
        programOutcomes: z.array(codeLabel).max(100),
        courseOutcomes: z.array(codeLabel).max(100),
        assessments: z.array(codeLabel).max(100),
        spec: z.object({ description_ar: short(5000), description_en: short(5000) }),
        weeks: z.number().int().min(1).max(30).nullable(),
      }),
    ),
  )
  .handler(async ({ data, context }) => {
    const arch = await loadArchitecture(context, data.versionId);
    const [feature, schema] = SPEC_STEPS[data.step];
    const res = await run(
      context,
      arch.projectId,
      feature,
      {
        program: arch.brief,
        course: data.course,
        program_outcomes: data.programOutcomes,
        existing_course_outcomes: data.courseOutcomes,
        existing_assessments: data.assessments,
        description: data.spec,
        weeks: data.weeks ?? 15,
      },
      schema as z.ZodType<Record<string, unknown>>,
      { targetRef: `course:${data.course.code}` },
    );
    // Keep cross-references to codes that actually exist.
    const plo = new Set(data.programOutcomes.map((p) => p.code));
    const out = res.data as Record<string, unknown>;
    if (data.step === "outcomes") {
      const o = out as z.infer<typeof specOutcomesSchema>;
      o.outcomes = o.outcomes.map((x) => ({
        ...x,
        program_outcomes: x.program_outcomes.filter((c) => plo.has(c)),
      }));
    }
    return { requestId: res.requestId, step: data.step, result: out as SpecResult };
  });

// ===== Shared: translation =====

export const aiTranslate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    validate(
      z.object({
        versionId: uuid,
        target: z.enum(["ar", "en"]),
        items: z
          .array(z.object({ id: short(100), text: short(5000) }))
          .min(1)
          .max(80),
      }),
    ),
  )
  .handler(async ({ data, context }) => {
    // The project comes from the version being edited, read as the signed-in user.
    const v = await context.supabase
      .from("artifact_versions")
      .select("project_id")
      .eq("id", data.versionId)
      .single();
    if (v.error || !v.data) throw new Error("Version not found");
    const ids = new Set(data.items.map((i) => i.id));
    const res = await run(
      context,
      v.data.project_id,
      "translate",
      { target_language: data.target, items: data.items },
      translateSchema,
      { targetRef: `version:${data.versionId}` },
    );
    return {
      requestId: res.requestId,
      items: res.data.items.filter((i) => ids.has(i.id) && i.text.trim()),
    };
  });

// ===== Phase 3: Course Studio =====

async function loadCourse(ctx: Ctx, versionId: string) {
  const c = await ctx.supabase
    .from("course_contents")
    .select(
      "project_id, title_ar, title_en, course_code, architecture_version_id, course_element_id",
    )
    .eq("artifact_version_id", versionId)
    .single();
  if (c.error || !c.data) throw new Error("Course not found");
  return c.data;
}

export const aiDraftBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    validate(
      z.object({
        versionId: uuid,
        blockType: z.enum(AI_BLOCK_TYPES),
        lang: z.enum(["ar", "en"]),
        lessonTitle: short(300),
        instruction: short(1000),
        outcome: z.object({ code: short(40), label: short(2000) }).nullable(),
      }),
    ),
  )
  .handler(async ({ data, context }) => {
    const course = await loadCourse(context, data.versionId);
    const res = await run(
      context,
      course.project_id,
      "course_block",
      {
        course: { code: course.course_code, title_ar: course.title_ar, title_en: course.title_en },
        lesson: data.lessonTitle,
        block_type: data.blockType,
        language: data.lang,
        instruction: data.instruction,
        outcome: data.outcome,
      },
      blockSchemas[data.blockType] as z.ZodType<Record<string, unknown>>,
      { targetRef: `course:${data.versionId}` },
    );
    const payload: Record<string, unknown> = { ...res.data };
    if (data.blockType === "knowledge_check") payload["outcome_code"] = data.outcome?.code ?? "";
    const parsed = parsePayload(data.blockType, payload);
    if (!parsed.ok) throw new Error("The AI draft did not meet the block rules; try again");
    return { requestId: res.requestId, payload: parsed.payload };
  });

export const aiAltText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate(z.object({ mediaId: uuid, context: short(1000) })))
  .handler(async ({ data, context }) => {
    const m = await context.supabase
      .from("media_assets")
      .select("project_id, kind, source_url")
      .eq("id", data.mediaId)
      .single();
    if (m.error || !m.data) throw new Error("Media record not found");
    if (m.data.kind !== "image" || !/^https:\/\/[^\s<>"]+$/.test(m.data.source_url ?? ""))
      throw new Error("Alt text needs an image with an https address");
    const res = await run(
      context,
      m.data.project_id,
      "alt_text",
      { lesson_context: data.context },
      altTextSchema,
      {
        attachment: { kind: "image_url", url: m.data.source_url! },
        targetRef: `media:${data.mediaId}`,
      },
    );
    return { requestId: res.requestId, ...res.data };
  });

export const aiLearnerCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    validate(z.object({ versionId: uuid, lessonTitle: short(300), text: short(30000).min(1) })),
  )
  .handler(async ({ data, context }) => {
    const course = await loadCourse(context, data.versionId);
    const res = await run(
      context,
      course.project_id,
      "learner_check",
      { lesson: data.lessonTitle, content: data.text },
      learnerCheckSchema,
      { targetRef: `course:${data.versionId}` },
    );
    return { requestId: res.requestId, points: res.data.points };
  });

// ===== Phase 4: compliance and reviews =====

const RULE_CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

export const aiDraftComplianceRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate(z.object({ sourceId: uuid })))
  .handler(async ({ data, context }) => {
    const s = await context.supabase
      .from("compliance_sources_current")
      .select("project_id, official_identifier, title_ar, title_en, source_url, source_file_id")
      .eq("id", data.sourceId)
      .single();
    if (s.error || !s.data) throw new Error("Source not found");
    let attachment: Parameters<typeof runAi>[0]["attachment"];
    if (s.data.source_file_id) {
      const f = await context.supabase
        .from("source_files")
        .select("storage_path, mime_type")
        .eq("id", s.data.source_file_id)
        .single();
      if (f.error || !f.data || f.data.mime_type !== "application/pdf")
        throw new Error("Only PDF source files can be read");
      const dl = await context.supabase.storage
        .from("project-sources")
        .download(f.data.storage_path);
      if (dl.error || !dl.data) throw new Error("Could not read the source file");
      attachment = {
        kind: "pdf",
        base64: bytesToBase64(new Uint8Array(await dl.data.arrayBuffer())),
      };
    } else if (s.data.source_url && /\.pdf(\?|#|$)/i.test(s.data.source_url)) {
      attachment = { kind: "pdf_url", url: s.data.source_url };
    } else {
      throw new Error(
        "Rules can be drafted from a PDF source (an uploaded file or a link ending in .pdf)",
      );
    }
    const res = await run(
      context,
      s.data.project_id!,
      "compliance_rules",
      {
        identifier: s.data.official_identifier,
        title_ar: s.data.title_ar,
        title_en: s.data.title_en,
      },
      complianceRulesSchema,
      { attachment, targetRef: `source:${data.sourceId}` },
    );
    return {
      requestId: res.requestId,
      rules: res.data.rules.filter(
        (r) => RULE_CODE.test(r.rule_code) && (r.statement_ar || r.statement_en),
      ),
    };
  });

export const aiSummarizeChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate(z.object({ versionId: uuid, earlierVersionId: uuid })))
  .handler(async ({ data, context }) => {
    const v = await context.supabase
      .from("artifact_versions")
      .select("id, artifact_id, project_id, version_number, content")
      .in("id", [data.versionId, data.earlierVersionId]);
    const later = v.data?.find((x) => x.id === data.versionId);
    const earlier = v.data?.find((x) => x.id === data.earlierVersionId);
    if (!later || !earlier || later.artifact_id !== earlier.artifact_id)
      throw new Error("Versions not found");
    const res = await run(
      context,
      later.project_id,
      "review_changes",
      {
        earlier: { version: earlier.version_number, text: earlier.content.slice(0, 60000) },
        later: { version: later.version_number, text: later.content.slice(0, 60000) },
      },
      reviewSummarySchema,
      { targetRef: `version:${data.versionId}` },
    );
    return { requestId: res.requestId, ...res.data };
  });

export const aiSummarizeThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate(z.object({ versionId: uuid })))
  .handler(async ({ data, context }) => {
    const v = await context.supabase
      .from("artifact_versions")
      .select("project_id")
      .eq("id", data.versionId)
      .single();
    if (v.error || !v.data) throw new Error("Version not found");
    const c = await context.supabase
      .from("review_comments")
      .select("body, parent_id, created_at")
      .eq("artifact_version_id", data.versionId)
      .order("created_at");
    const comments = (c.data ?? []).map((x, i) => ({
      n: i + 1,
      reply: !!x.parent_id,
      text: x.body.slice(0, 5000),
    }));
    if (!comments.length) return { requestId: null, summary_ar: "", summary_en: "", points: [] };
    const res = await run(
      context,
      v.data.project_id,
      "review_thread",
      { comments },
      reviewSummarySchema,
      {
        targetRef: `version:${data.versionId}`,
      },
    );
    return { requestId: res.requestId, ...res.data };
  });
