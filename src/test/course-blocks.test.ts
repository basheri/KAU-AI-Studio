import { describe, expect, it } from "vitest";
import {
  BLOCK_TYPES,
  emptyPayload,
  embedSrc,
  parsePayload,
  parseRichText,
  type BlockType,
} from "@/features/course/blocks";
import {
  contentDefects,
  duplicateBlock,
  moveItem,
  type CourseTree,
  type ValidationContext,
} from "@/features/course/tree";

const MEDIA = {
  img: { id: "11111111-1111-4111-8111-111111111111", kind: "image" as const },
  aud: { id: "22222222-2222-4222-8222-222222222222", kind: "audio" as const },
  vid: { id: "33333333-3333-4333-8333-333333333333", kind: "video" as const },
};

export const VALID: Record<BlockType, unknown> = {
  rich_text: { text: "### Overview\nLearn **hypothesis** tests.\n- one\n- two" },
  image: { media_id: MEDIA.img.id, alt: "Bar chart of results", caption: "", decorative: false },
  audio: { media_id: MEDIA.aud.id, transcript: "Welcome to the lesson." },
  video: { media_id: MEDIA.vid.id, captions_url: "https://cdn.kau.edu.sa/c.vtt", transcript: "" },
  embed: { url: "https://www.youtube-nocookie.com/embed/abc123", title: "Intro video" },
  knowledge_check: {
    question: "Which test compares two means?",
    choices: ["t-test", "chi-square"],
    correct_index: 0,
    feedback_correct: "Correct.",
    feedback_incorrect: "Review section 2.",
    outcome_code: "CLO1",
  },
  scenario: {
    prompt: "A manager asks for a quick answer.",
    branches: [
      { choice: "Run a test", feedback: "Good practice." },
      { choice: "Guess", feedback: "Risky." },
    ],
  },
  rubric: {
    criteria: [
      {
        name: "Analysis",
        levels: [
          { label: "Excellent", points: 4, description: "Complete" },
          { label: "Weak", points: 1, description: "Partial" },
        ],
      },
    ],
  },
  glossary: { terms: [{ term: "p-value", definition: "Probability under the null." }] },
  references: {
    items: [
      {
        author: "Field, A.",
        title: "Discovering Statistics",
        year: "2018",
        publisher: "SAGE",
        url: "https://example.org/book",
      },
    ],
  },
};

const ctx: ValidationContext = {
  outcomeCodes: new Set(["PLO1", "CLO1"]),
  media: new Map([
    [
      MEDIA.img.id,
      {
        kind: "image",
        title: "Chart",
        source_url: "https://x.kau.edu.sa/a.png",
        rights_note: "KAU owned",
      },
    ],
    [
      MEDIA.aud.id,
      {
        kind: "audio",
        title: "Intro",
        source_url: "https://x.kau.edu.sa/a.mp3",
        rights_note: "KAU owned",
      },
    ],
    [MEDIA.vid.id, { kind: "video", title: "Talk", source_url: "", rights_note: "" }],
  ]),
};

function tree(blocks: { type: BlockType; payload: unknown }[]): CourseTree {
  return {
    title_ar: "",
    title_en: "Statistics",
    lang: "en",
    modules: [
      {
        key: "m1",
        title_ar: "",
        title_en: "Module 1",
        lang: "en",
        lessons: [
          {
            key: "l1",
            title_ar: "",
            title_en: "Lesson 1",
            lang: "en",
            blocks: blocks.map((b, i) => ({
              key: `b${i}`,
              type: b.type,
              lang: "en",
              payload: b.payload as never,
            })),
          },
        ],
      },
    ],
  };
}

describe("block schemas", () => {
  it("defines exactly the ten production block types", () => {
    expect(BLOCK_TYPES).toEqual([
      "rich_text",
      "image",
      "audio",
      "video",
      "embed",
      "knowledge_check",
      "scenario",
      "rubric",
      "glossary",
      "references",
    ]);
  });

  it.each(BLOCK_TYPES)("%s validates and round-trips", (type) => {
    const r = parsePayload(type, JSON.parse(JSON.stringify(VALID[type])));
    expect(r).toEqual({ ok: true, payload: VALID[type] });
    expect(parsePayload(type, emptyPayload(type)).ok).toBe(true);
  });

  it("rejects malformed payloads explicitly", () => {
    expect(parsePayload("rich_text", { text: 3 }).ok).toBe(false);
    expect(parsePayload("rich_text", { text: "x", extra: 1 }).ok).toBe(false);
    expect(
      parsePayload("image", { media_id: "x", alt: "", caption: "", decorative: false }).ok,
    ).toBe(false);
    expect(
      parsePayload("knowledge_check", { ...(VALID.knowledge_check as object), correct_index: 5 })
        .ok,
    ).toBe(false);
    expect(
      parsePayload("rubric", {
        criteria: [{ name: "a", levels: [{ label: "x", points: "4", description: "" }] }],
      }).ok,
    ).toBe(false);
    expect(parsePayload("rich_text", null).ok).toBe(false);
  });

  it("rejects HTML and scripts in content", () => {
    for (const text of [
      "<script>alert(1)</script>",
      "Hi <img src=x onerror=alert(1)>",
      "[x](javascript:alert(1))",
    ]) {
      const r = parsePayload("rich_text", { text });
      expect(r.ok).toBe(false);
    }
    expect(parsePayload("glossary", { terms: [{ term: "<b>x</b>", definition: "d" }] }).ok).toBe(
      false,
    );
    expect(parsePayload("rich_text", { text: "if x < 3 and y > 2" }).ok).toBe(true);
  });

  it("only accepts https embed URLs and renders only approved hosts", () => {
    expect(parsePayload("embed", { url: "http://www.youtube.com/embed/x", title: "t" }).ok).toBe(
      false,
    );
    expect(parsePayload("embed", { url: "javascript:alert(1)", title: "t" }).ok).toBe(false);
    expect(parsePayload("embed", { url: "https://evil.example/x", title: "t" }).ok).toBe(true);
    expect(embedSrc("https://evil.example/x")).toBeNull();
    expect(embedSrc("https://www.youtube-nocookie.com/embed/abc")).toBe(
      "https://www.youtube-nocookie.com/embed/abc",
    );
    expect(embedSrc("https://www.youtube-nocookie.com.evil.example/embed")).toBeNull();
  });

  it("parses rich text into a safe tree without HTML", () => {
    const nodes = parseRichText("### Title\nSome **bold** and *it*\n- a\n- b\n\nNext");
    expect(nodes.map((n) => n.kind)).toEqual(["heading", "paragraph", "list", "paragraph"]);
    expect(nodes[0]).toMatchObject({ kind: "heading", level: 3 });
    expect(JSON.stringify(nodes)).not.toContain("<");
  });
});

describe("course tree operations", () => {
  it("moves items within bounds and never loses or duplicates them", () => {
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 2, -2)).toEqual(["c", "a", "b"]);
  });

  it("duplicates a block with a new key and deep-copied payload", () => {
    const b = tree([{ type: "glossary", payload: VALID.glossary }]).modules[0]!.lessons[0]!
      .blocks[0]!;
    const d = duplicateBlock(b);
    expect(d.key).not.toBe(b.key);
    expect(d.payload).toEqual(b.payload);
    expect(d.payload).not.toBe(b.payload);
  });
});

describe("deterministic content validation", () => {
  const codes = (t: CourseTree) => contentDefects(t, ctx).map((d) => `${d.severity}:${d.code}`);

  it("a complete course has no critical defects; incomplete media metadata is a warning", () => {
    const all = codes(tree(BLOCK_TYPES.map((type) => ({ type, payload: VALID[type] }))));
    expect(all.filter((c) => c.startsWith("critical"))).toEqual([]);
    expect(all).toContain("warning:media_metadata_incomplete");
  });

  it("detects every critical defect type", () => {
    const t = tree([
      { type: "rich_text", payload: { text: "" } },
      { type: "rich_text", payload: { text: "#### Too deep" } },
      { type: "image", payload: { ...(VALID.image as object), alt: "" } },
      { type: "audio", payload: { ...(VALID.audio as object), transcript: "" } },
      { type: "video", payload: { ...(VALID.video as object), captions_url: "", transcript: "" } },
      { type: "embed", payload: { url: "https://evil.example/x", title: "t" } },
      {
        type: "knowledge_check",
        payload: {
          ...(VALID.knowledge_check as object),
          correct_index: null,
          feedback_correct: "",
          outcome_code: "NOPE",
        },
      },
      {
        type: "references",
        payload: {
          items: [{ author: "A", title: "T", year: "", publisher: "", url: "not a url" }],
        },
      },
    ]);
    t.modules[0]!.lessons[0]!.title_en = "";
    t.modules[0]!.lang = null;
    const found = new Set(codes(t));
    for (const c of [
      "missing_title",
      "missing_language",
      "empty_payload",
      "invalid_heading_hierarchy",
      "missing_alt_text",
      "missing_transcript",
      "missing_captions",
      "invalid_embed_domain",
      "kc_missing_answer",
      "kc_missing_feedback",
      "outcome_link_missing",
      "reference_url_invalid",
    ])
      expect(found).toContain(`critical:${c}`);
  });

  it("requires at least one lesson", () => {
    expect(codes({ title_ar: "", title_en: "X", lang: "en", modules: [] })).toContain(
      "critical:no_lessons",
    );
  });
});
