import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { buildDocx, type DocSpec } from "@/features/exports/docx";
import {
  courseSpecDoc,
  programSummaryDoc,
  type ArchitectureExport,
  type ExportMeta,
} from "@/features/exports/documents";
import { buildScorm, SCORM_JS } from "@/features/exports/scorm";
import { docxToText } from "@/features/intake/docx";
import type { ArchElement } from "@/features/architecture/alignment";
import type { CourseTree } from "@/features/course/tree";

const wellFormed = (s: string) =>
  new DOMParser().parseFromString(s, "application/xml").getElementsByTagName("parsererror")
    .length === 0;
const files = (bytes: Uint8Array) =>
  Object.fromEntries(Object.entries(unzipSync(bytes)).map(([k, v]) => [k, strFromU8(v)]));

const el = (
  key: string,
  type: ArchElement["type"],
  code: string,
  en: string,
  extra: Partial<ArchElement> = {},
): ArchElement => ({
  key,
  type,
  parent_key: null,
  code,
  label_ar: "",
  label_en: en,
  ...extra,
});
const data: ArchitectureExport = {
  title: "Data literacy",
  versionNumber: 3,
  brief: {
    title: { ar: "الثقافة البيانية", en: "Data literacy" },
    rationale: { en: "Needed <now> & soon" },
  },
  elements: [
    el("p1", "program_outcome", "PLO1", "Interpret data"),
    el("c1", "course", "DL101", "Foundations", {
      label_ar: "الأسس",
      details: {
        spec: {
          credit_hours: 3,
          description_en: "Intro course",
          objectives: [{ ar: "", en: "Read charts" }],
          topics: [{ ar: "", en: "Charts", weeks: 2, outcomes: ["CLO1"] }],
          references: [{ citation: "Tufte (2001)", verified: true }],
        },
      },
    }),
    el("o1", "course_outcome", "CLO1", "Read a chart", { parent_key: "c1" }),
    el("a1", "activity", "", "Workshop", { parent_key: "c1" }),
    el("s1", "assessment", "", "Quiz", { parent_key: "c1", details: { weight: 40 } }),
    el("s2", "assessment", "", "Project", { parent_key: "c1", details: { weight: 60 } }),
  ],
  mappings: [
    { from: "p1", to: "o1" },
    { from: "o1", to: "a1" },
    { from: "o1", to: "s1" },
    { from: "o1", to: "s2" },
  ],
};
const meta = (o: Partial<ExportMeta> = {}): ExportMeta => ({
  exportId: "11111111-1111-4111-8111-111111111111",
  official: true,
  lang: "en",
  createdAt: new Date("2026-10-11T08:00:00Z"),
  ...o,
});

describe("Word export", () => {
  const spec: DocSpec = {
    lang: "ar",
    title: "عنوان <تجربة> & \u0001",
    blocks: [
      { t: "h", level: 1, text: "قسم" },
      { t: "p", text: "نص" },
      { t: "ul", items: ["أ", "ب"] },
      { t: "table", head: ["أ"], rows: [["1"]] },
    ],
    header: "معاينة",
    footer: "مرجع",
  };

  it("writes a valid right-to-left document with escaped text", () => {
    const f = files(buildDocx(spec));
    for (const name of [
      "word/document.xml",
      "word/styles.xml",
      "word/header1.xml",
      "word/footer1.xml",
      "[Content_Types].xml",
    ])
      expect(wellFormed(f[name]!), name).toBe(true);
    expect(f["word/document.xml"]).toContain("<w:bidi/>");
    expect(f["word/document.xml"]).toContain("<w:bidiVisual/>");
    expect(f["word/document.xml"]).toContain("&lt;تجربة&gt; &amp;");
    expect(docxToText(buildDocx(spec))).toContain("عنوان");
  });

  it("keeps Latin-only text left to right inside Arabic documents", () => {
    const xml = files(buildDocx({ ...spec, blocks: [{ t: "p", text: "Tufte (2001)." }] }))[
      "word/document.xml"
    ]!;
    const latin = xml.slice(xml.indexOf("Tufte") - 300, xml.indexOf("Tufte"));
    expect(latin.slice(latin.lastIndexOf("<w:r>"))).not.toContain("<w:rtl/>");
  });

  it("adds the watermark header only to previews", () => {
    expect(files(buildDocx({ ...spec, header: undefined }))["word/header1.xml"]).toBeUndefined();
    expect(files(buildDocx(spec))["word/header1.xml"]).toContain("معاينة");
  });
});

describe("course specification", () => {
  it("fills the NCAAA sections from the architecture", () => {
    const doc = courseSpecDoc(data, "c1", meta());
    const text = docxToText(buildDocx(doc));
    expect(doc.title).toContain("DL101 — Foundations");
    expect(text).toContain("A. General information about the course");
    expect(text).toContain("Intro course");
    expect(text).toContain("Read charts");
    expect(text).toContain("PLO1"); // CLO row shows the aligned program outcome
    expect(text).toContain("Workshop");
    expect(text).toContain("100%"); // assessment total
    expect(text).toContain("Tufte (2001)");
    expect(JSON.stringify(doc.blocks)).not.toContain("،"); // English lists use English punctuation
    expect(doc.header).toBeUndefined();
    expect(doc.footer).toContain("Official export");
  });

  it("uses the export language with fallback, and marks previews", () => {
    const doc = courseSpecDoc(data, "c1", meta({ lang: "ar", official: false }));
    expect(doc.title).toContain("الأسس");
    expect(doc.header).toContain("غير معتمدة");
    expect(JSON.stringify(doc.blocks)).toContain("Read a chart"); // no Arabic label: English is used
  });

  it("refuses an unknown course", () => {
    expect(() => courseSpecDoc(data, "nope", meta())).toThrow("Course not found");
  });
});

describe("program summary", () => {
  it("shows the outcome-to-course matrix", () => {
    const doc = programSummaryDoc(data, meta());
    const matrix = doc.blocks.at(-1);
    expect(matrix).toEqual({
      t: "table",
      head: ["Program outcome", "DL101"],
      rows: [["PLO1", "✓"]],
    });
    expect(docxToText(buildDocx(doc))).toContain("Needed <now> & soon");
  });
});

describe("SCORM package", () => {
  const tree: CourseTree = {
    title_ar: "",
    title_en: "Foundations",
    lang: "en",
    modules: [
      {
        key: "m",
        title_ar: "",
        title_en: "Module 1",
        lang: null,
        lessons: [
          {
            key: "l",
            title_ar: "",
            title_en: "Lesson <one>",
            lang: null,
            blocks: [
              {
                key: "b1",
                type: "rich_text",
                lang: null,
                payload: { text: "**Hi** <script>alert(1)</script>" },
              },
              {
                key: "b2",
                type: "embed",
                lang: null,
                payload: { url: "https://evil.example/x", title: "x" },
              },
              {
                key: "b3",
                type: "embed",
                lang: null,
                payload: { url: "https://www.youtube-nocookie.com/embed/abc", title: "Clip" },
              },
              {
                key: "b4",
                type: "knowledge_check",
                lang: "ar",
                payload: {
                  question: "سؤال",
                  choices: ["أ", "ب"],
                  correct_index: 1,
                  feedback_correct: "",
                  feedback_incorrect: "",
                  outcome_code: "CLO1",
                },
              },
            ],
          },
        ],
      },
    ],
  };
  const scormMeta = { ...meta(), versionNumber: 2, courseCode: "DL101" };

  it("packages a valid SCORM 1.2 manifest and escaped content", () => {
    const f = files(buildScorm(tree, new Map(), scormMeta));
    expect(Object.keys(f).sort()).toEqual([
      "imsmanifest.xml",
      "index.html",
      "scorm.js",
      "style.css",
    ]);
    expect(wellFormed(f["imsmanifest.xml"]!)).toBe(true);
    expect(f["imsmanifest.xml"]).toContain("<schemaversion>1.2</schemaversion>");
    expect(f["imsmanifest.xml"]).toContain('adlcp:scormtype="sco"');
    const html = f["index.html"]!;
    expect(html).toContain("<strong>Hi</strong> &lt;script&gt;");
    expect(html).not.toMatch(/<script>alert/);
    expect(html).toContain("Lesson &lt;one&gt;");
    expect(html).not.toContain("evil.example");
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-presentation"');
    expect(html).toContain('lang="ar" dir="rtl"'); // block in another language keeps its direction
    expect(html).toContain('data-correct="1"');
    expect(html).not.toContain("preview-banner");
  });

  it("marks previews and reports completion to the LMS", () => {
    const f = files(buildScorm(tree, new Map(), { ...scormMeta, official: false }));
    expect(f["index.html"]).toContain("preview-banner");
    expect(f["imsmanifest.xml"]).toContain("[PREVIEW]");
    expect(SCORM_JS).toContain('"cmi.core.lesson_status","completed"');
    expect(SCORM_JS).toContain("cmi.core.lesson_location");
  });
});
