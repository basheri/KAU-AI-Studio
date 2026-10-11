import { describe, expect, it } from "vitest";
import {
  BRIEF_FIELDS,
  INTAKE_MODES,
  PROGRAM_CATEGORIES,
  PROVENANCE,
  UPLOAD_LIMIT_BYTES,
  normalizeBriefFields,
  parseProposalText,
  validateUpload,
} from "@/features/intake/brief";
import {
  checkAlignment,
  type ArchElement,
  type ArchMapping,
} from "@/features/architecture/alignment";

describe("canonical brief model", () => {
  it("has exactly three categories and three intake modes", () => {
    expect(PROGRAM_CATEGORIES).toEqual([
      "micro_credential",
      "academic_program",
      "professional_program",
    ]);
    expect(INTAKE_MODES).toEqual(["guided_idea", "document_upload", "redevelopment"]);
    expect(PROVENANCE).toEqual(["manual", "extracted", "imported", "AI_draft"]);
  });
  it("normalizes to every canonical field with bilingual slots and provenance", () => {
    const f = normalizeBriefFields({ title: { en: "Data Science", provenance: "manual" } });
    expect(Object.keys(f)).toEqual([...BRIEF_FIELDS]);
    expect(f.title).toEqual({ ar: "", en: "Data Science", provenance: "manual", source_ref: null });
    expect(f.risks).toEqual({ ar: "", en: "", provenance: null, source_ref: null });
  });
});

describe("deterministic proposal extraction stub", () => {
  it("reads labelled lines in English and Arabic, with continuation lines", () => {
    const out = parseProposalText(
      "Title: Applied AI\nRationale: Demand\n  is growing\nالمتعلمون المستهدفون: الخريجون\nNoise line",
    );
    expect(out).toEqual({
      title: "Applied AI",
      rationale: "Demand is growing",
      target_learners: "الخريجون",
    });
  });
  it("returns nothing when no labels match (no pretend success)", () => {
    expect(parseProposalText("just some prose")).toEqual({});
  });
});

describe("upload validation", () => {
  it("accepts allowed types within the limit", () => {
    expect(validateUpload({ type: "application/pdf", size: 1000 })).toBeNull();
    expect(validateUpload({ type: "text/plain", size: UPLOAD_LIMIT_BYTES })).toBeNull();
  });
  it("rejects wrong type, oversize and empty files explicitly", () => {
    expect(validateUpload({ type: "image/png", size: 10 })).toBe("type");
    expect(validateUpload({ type: "application/pdf", size: UPLOAD_LIMIT_BYTES + 1 })).toBe("size");
    expect(validateUpload({ type: "text/plain", size: 0 })).toBe("empty");
  });
});

const el = (
  key: string,
  type: ArchElement["type"],
  label: string,
  parent_key: string | null = null,
): ArchElement => ({
  key,
  type,
  parent_key,
  code: key.toUpperCase(),
  label_ar: "",
  label_en: label,
});

function aligned(): { elements: ArchElement[]; mappings: ArchMapping[] } {
  return {
    elements: [
      el("po1", "program_outcome", "Analyse data"),
      el("c1", "course", "Statistics"),
      el("co1", "course_outcome", "Apply tests", "c1"),
      el("act1", "activity", "Lab", "c1"),
      el("as1", "assessment", "Exam", "c1"),
    ],
    mappings: [
      { from: "po1", to: "c1" },
      { from: "po1", to: "co1" },
      { from: "co1", to: "act1" },
      { from: "act1", to: "as1" },
    ],
  };
}

describe("alignment checks", () => {
  it("passes a fully aligned program", () => {
    const { elements, mappings } = aligned();
    expect(checkAlignment(elements, mappings)).toEqual([]);
  });
  it("detects an orphaned program outcome", () => {
    const a = aligned();
    a.elements.push(el("po2", "program_outcome", "Communicate"));
    expect(
      checkAlignment(a.elements, a.mappings)
        .filter((d) => d.key === "po2")
        .map((d) => d.type),
    ).toEqual(["orphaned_program_outcome", "outcome_without_assessment"]);
  });
  it("detects duplicate outcomes (case/space-insensitive)", () => {
    const a = aligned();
    a.elements.push(el("po2", "program_outcome", "  analyse   DATA "));
    a.mappings.push({ from: "po2", to: "co1" });
    expect(checkAlignment(a.elements, a.mappings)).toEqual([
      { type: "duplicate_outcome", key: "po2", code: "PO2" },
    ]);
  });
  it("detects a course outcome without a parent program outcome", () => {
    const a = aligned();
    a.elements.push(el("co2", "course_outcome", "Report", "c1"));
    a.mappings.push({ from: "co2", to: "as1" });
    expect(checkAlignment(a.elements, a.mappings)).toEqual([
      { type: "course_outcome_without_parent", key: "co2", code: "CO2" },
    ]);
  });
  it("detects outcomes without assessment evidence", () => {
    const a = aligned();
    a.mappings = a.mappings.filter((m) => m.to !== "as1");
    expect(checkAlignment(a.elements, a.mappings).map((d) => `${d.type}:${d.key}`)).toEqual([
      "outcome_without_assessment:po1",
      "outcome_without_assessment:co1",
    ]);
  });
});
