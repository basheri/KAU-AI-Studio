import * as z from "zod/v4";

// Output shapes the AI must return for each feature. The server validates every response against
// these before anything is shown or stored; the database still applies its own checks on save.

export const AI_FEATURES = [
  "brief_draft",
  "brief_translate",
  "brief_consistency",
  "proposal_extract",
  "program_outcomes",
  "alignment_explain",
  "spec_description",
  "spec_objectives",
  "spec_outcomes",
  "spec_topics",
  "spec_assessments",
  "spec_references",
  "translate",
  "course_block",
  "alt_text",
  "learner_check",
  "compliance_rules",
  "review_changes",
  "review_thread",
] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

/** Brief fields the AI may fill (category is chosen by a person). */
export const AI_BRIEF_FIELDS = [
  "title",
  "rationale",
  "target_learners",
  "delivery_mode",
  "duration_credits",
  "intended_outcomes",
  "assumptions",
  "required_sources",
  "stakeholders",
  "risks",
] as const;

const bi = z.object({ ar: z.string(), en: z.string() });
const lang = z.enum(["ar", "en"]);
const briefField = z.enum(AI_BRIEF_FIELDS);

export const briefDraftSchema = z.object(
  Object.fromEntries(AI_BRIEF_FIELDS.map((k) => [k, bi])) as Record<
    (typeof AI_BRIEF_FIELDS)[number],
    typeof bi
  >,
);
export const briefTranslateSchema = z.object({
  translations: z.array(z.object({ field: briefField, lang, text: z.string() })),
});
export const consistencySchema = z.object({
  issues: z.array(
    z.object({
      field: briefField,
      severity: z.enum(["minor", "major"]),
      note_ar: z.string(),
      note_en: z.string(),
    }),
  ),
});
export const proposalExtractSchema = z.object({
  fields: z.array(
    z.object({ field: briefField, text: z.string(), page: z.number().int().nullable() }),
  ),
});
export const programOutcomesSchema = z.object({
  outcomes: z.array(
    z.object({
      code: z.string(),
      ar: z.string(),
      en: z.string(),
      domain: z.enum(["knowledge", "skills", "values"]),
    }),
  ),
});
export const alignmentExplainSchema = z.object({
  explanations: z.array(
    z.object({ code: z.string(), defect: z.string(), ar: z.string(), en: z.string() }),
  ),
});
export const specDescriptionSchema = z.object({
  description_ar: z.string(),
  description_en: z.string(),
});
export const specObjectivesSchema = z.object({ objectives: z.array(bi) });
export const specOutcomesSchema = z.object({
  outcomes: z.array(
    z.object({
      code: z.string(),
      ar: z.string(),
      en: z.string(),
      domain: z.enum(["knowledge", "skills", "values"]),
      program_outcomes: z.array(z.string()),
    }),
  ),
});
export const specTopicsSchema = z.object({
  topics: z.array(
    z.object({ ar: z.string(), en: z.string(), weeks: z.number(), outcomes: z.array(z.string()) }),
  ),
});
export const specAssessmentsSchema = z.object({
  assessments: z.array(
    z.object({
      code: z.string(),
      ar: z.string(),
      en: z.string(),
      weight: z.number(),
      outcomes: z.array(z.string()),
    }),
  ),
});
export const specReferencesSchema = z.object({
  references: z.array(z.object({ citation: z.string(), why_ar: z.string(), why_en: z.string() })),
});
export const translateSchema = z.object({
  items: z.array(z.object({ id: z.string(), text: z.string() })),
});
export const altTextSchema = z.object({ alt_ar: z.string(), alt_en: z.string() });
export const learnerCheckSchema = z.object({
  points: z.array(z.object({ quote: z.string(), issue: z.string(), suggestion: z.string() })),
});
export const complianceRulesSchema = z.object({
  rules: z.array(
    z.object({
      rule_code: z.string(),
      statement_ar: z.string(),
      statement_en: z.string(),
      remediation_ar: z.string(),
      remediation_en: z.string(),
      severity: z.enum(["info", "warning", "blocker"]),
      clause: z.string(),
      page: z.number().int().nullable(),
    }),
  ),
});
export const reviewSummarySchema = z.object({
  summary_ar: z.string(),
  summary_en: z.string(),
  points: z.array(bi),
});

// Course blocks the AI may draft: only text-based types, in the exact payload shapes of blocks.ts.
export const AI_BLOCK_TYPES = [
  "rich_text",
  "knowledge_check",
  "scenario",
  "rubric",
  "glossary",
] as const;
export type AiBlockType = (typeof AI_BLOCK_TYPES)[number];
export const blockSchemas = {
  rich_text: z.object({ text: z.string() }),
  knowledge_check: z.object({
    question: z.string(),
    choices: z.array(z.string()),
    correct_index: z.number().int(),
    feedback_correct: z.string(),
    feedback_incorrect: z.string(),
    outcome_code: z.string(),
  }),
  scenario: z.object({
    prompt: z.string(),
    branches: z.array(z.object({ choice: z.string(), feedback: z.string() })),
  }),
  rubric: z.object({
    criteria: z.array(
      z.object({
        name: z.string(),
        levels: z.array(
          z.object({ label: z.string(), points: z.number(), description: z.string() }),
        ),
      }),
    ),
  }),
  glossary: z.object({
    terms: z.array(z.object({ term: z.string(), definition: z.string() })),
  }),
} satisfies Record<AiBlockType, z.ZodType>;
