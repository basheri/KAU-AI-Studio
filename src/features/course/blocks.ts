// Typed block schemas. Mirrors public.validate_block_payload (the database is authoritative).

export const BLOCK_TYPES = [
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
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
export type Lang = "ar" | "en";

export type RichTextPayload = { text: string };
export type ImagePayload = {
  media_id: string | null;
  alt: string;
  caption: string;
  decorative: boolean;
};
export type AudioPayload = { media_id: string | null; transcript: string };
export type VideoPayload = { media_id: string | null; captions_url: string; transcript: string };
export type EmbedPayload = { url: string; title: string };
export type KnowledgeCheckPayload = {
  question: string;
  choices: string[];
  correct_index: number | null;
  feedback_correct: string;
  feedback_incorrect: string;
  outcome_code: string;
};
export type ScenarioPayload = { prompt: string; branches: { choice: string; feedback: string }[] };
export type RubricPayload = {
  criteria: { name: string; levels: { label: string; points: number; description: string }[] }[];
};
export type GlossaryPayload = { terms: { term: string; definition: string }[] };
export type ReferencesPayload = {
  items: { author: string; title: string; year: string; publisher: string; url: string }[];
};

export type PayloadMap = {
  rich_text: RichTextPayload;
  image: ImagePayload;
  audio: AudioPayload;
  video: VideoPayload;
  embed: EmbedPayload;
  knowledge_check: KnowledgeCheckPayload;
  scenario: ScenarioPayload;
  rubric: RubricPayload;
  glossary: GlossaryPayload;
  references: ReferencesPayload;
};
export type AnyPayload = PayloadMap[BlockType];

export const MEDIA_BLOCKS = ["image", "audio", "video"] as const;
export const isMediaBlock = (t: BlockType): t is (typeof MEDIA_BLOCKS)[number] =>
  (MEDIA_BLOCKS as readonly string[]).includes(t);

/** Interim platform default (pending institutional policy). Mirrors public.approved_embed_hosts(). */
export const APPROVED_EMBED_HOSTS = [
  "www.youtube-nocookie.com",
  "www.youtube.com",
  "player.vimeo.com",
];

export function emptyPayload<T extends BlockType>(type: T): PayloadMap[T] {
  const p: { [K in BlockType]: PayloadMap[K] } = {
    rich_text: { text: "" },
    image: { media_id: null, alt: "", caption: "", decorative: false },
    audio: { media_id: null, transcript: "" },
    video: { media_id: null, captions_url: "", transcript: "" },
    embed: { url: "", title: "" },
    knowledge_check: {
      question: "",
      choices: ["", ""],
      correct_index: null,
      feedback_correct: "",
      feedback_incorrect: "",
      outcome_code: "",
    },
    scenario: { prompt: "", branches: [{ choice: "", feedback: "" }] },
    rubric: { criteria: [{ name: "", levels: [{ label: "", points: 1, description: "" }] }] },
    glossary: { terms: [{ term: "", definition: "" }] },
    references: { items: [{ author: "", title: "", year: "", publisher: "", url: "" }] },
  };
  return p[type];
}

type Spec = "string" | "boolean" | "array" | "index" | "media";
const SPECS: Record<BlockType, Record<string, Spec>> = {
  rich_text: { text: "string" },
  image: { media_id: "media", alt: "string", caption: "string", decorative: "boolean" },
  audio: { media_id: "media", transcript: "string" },
  video: { media_id: "media", captions_url: "string", transcript: "string" },
  embed: { url: "string", title: "string" },
  knowledge_check: {
    question: "string",
    choices: "array",
    correct_index: "index",
    feedback_correct: "string",
    feedback_incorrect: "string",
    outcome_code: "string",
  },
  scenario: { prompt: "string", branches: "array" },
  rubric: { criteria: "array" },
  glossary: { terms: "array" },
  references: { items: "array" },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UNSAFE = /<[A-Za-z!/?]|javascript:|vbscript:|data:text\/html/i;
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const sameKeys = (o: Record<string, unknown>, keys: string[]) =>
  Object.keys(o).sort().join() === [...keys].sort().join();
const allStrings = (o: Record<string, unknown>) =>
  Object.values(o).every((v) => typeof v === "string");

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (isObj(v)) Object.values(v).forEach((x) => strings(x, out));
  return out;
}

export type ParseResult<T> = { ok: true; payload: T } | { ok: false; error: string };

export function parsePayload<T extends BlockType>(type: T, p: unknown): ParseResult<PayloadMap[T]> {
  const fail = (e: string) => ({ ok: false as const, error: `Invalid ${type} payload: ${e}` });
  const spec = SPECS[type];
  if (!spec) return { ok: false, error: "Unknown block type" };
  if (!isObj(p)) return fail("must be an object");
  if (!sameKeys(p, Object.keys(spec)))
    return fail(`expected fields ${Object.keys(spec).join(", ")}`);
  for (const [k, s] of Object.entries(spec)) {
    const v = p[k];
    if (s === "string" && typeof v !== "string") return fail(`${k} must be text`);
    if (s === "boolean" && typeof v !== "boolean") return fail(`${k} must be true/false`);
    if (s === "array" && (!Array.isArray(v) || v.length > 50)) return fail(`${k} must be a list`);
    if (s === "index" && v !== null && typeof v !== "number") return fail(`${k} must be a number`);
    if (s === "media" && v !== null && !(typeof v === "string" && UUID.test(v)))
      return fail("media must be a project media record");
  }
  for (const s of strings(p)) {
    if (s.length > 20000) return fail("text too long");
    if (UNSAFE.test(s)) return { ok: false, error: "Content must not contain HTML or scripts" };
  }
  if (
    type === "embed" &&
    p["url"] !== "" &&
    !/^https:\/\/[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(\/[^\s<>"]*)?$/.test(p["url"] as string)
  )
    return { ok: false, error: "Embed URL must be an https address" };
  if (
    type === "video" &&
    p["captions_url"] !== "" &&
    !(p["captions_url"] as string).startsWith("https://")
  )
    return { ok: false, error: "Captions URL must be an https address" };
  if (type === "knowledge_check") {
    const choices = p["choices"] as unknown[];
    if (!choices.every((c) => typeof c === "string")) return fail("choices must be text");
    const ci = p["correct_index"];
    if (typeof ci === "number" && (!Number.isInteger(ci) || ci < 0 || ci >= choices.length))
      return fail("correct answer must be one of the choices");
  }
  const listOk = (key: string, keys: string[], extra?: (o: Record<string, unknown>) => boolean) =>
    (p[key] as unknown[]).every(
      (o) => isObj(o) && sameKeys(o, keys) && (extra ? extra(o) : allStrings(o)),
    );
  if (type === "scenario" && !listOk("branches", ["choice", "feedback"]))
    return fail("each branch needs choice and feedback");
  if (type === "glossary" && !listOk("terms", ["term", "definition"]))
    return fail("each term needs term and definition");
  if (type === "references" && !listOk("items", ["author", "title", "year", "publisher", "url"]))
    return fail("each reference needs author, title, year, publisher and url");
  if (
    type === "rubric" &&
    !listOk(
      "criteria",
      ["name", "levels"],
      (c) =>
        typeof c["name"] === "string" &&
        Array.isArray(c["levels"]) &&
        c["levels"].length <= 10 &&
        c["levels"].every(
          (l) =>
            isObj(l) &&
            sameKeys(l, ["label", "points", "description"]) &&
            typeof l["label"] === "string" &&
            typeof l["description"] === "string" &&
            typeof l["points"] === "number",
        ),
    )
  )
    return fail("each level needs label, numeric points and description");
  return { ok: true, payload: p as PayloadMap[T] };
}

export function embedHost(url: string): string | null {
  const m = /^https:\/\/([^/:?#]+)/.exec(url);
  return m?.[1] ? m[1].toLowerCase() : null;
}

/** Returns an iframe src only for https URLs on approved hosts; otherwise null (never rendered). */
export function embedSrc(url: string): string | null {
  const host = embedHost(url);
  if (!host || !APPROVED_EMBED_HOSTS.includes(host) || UNSAFE.test(url)) return null;
  return url;
}

export const isHttpUrl = (u: string) =>
  /^https?:\/\/[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:[0-9]+)?(\/[^\s<>"]*)?$/.test(u);

// Minimal rich text: "### " / "#### " headings, "- " lists, blank-line paragraphs, **bold**, *italic*.
export type Inline = { text: string; bold?: boolean; italic?: boolean };
export type RichNode =
  | { kind: "heading"; level: number; inline: Inline[] }
  | { kind: "paragraph"; inline: Inline[] }
  | { kind: "list"; items: Inline[][] };

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push(m[1] !== undefined ? { text: m[1], bold: true } : { text: m[2] ?? "", italic: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

export function parseRichText(text: string): RichNode[] {
  const nodes: RichNode[] = [];
  let para: string[] = [];
  let list: Inline[][] | null = null;
  const flush = () => {
    if (para.length) nodes.push({ kind: "paragraph", inline: parseInline(para.join(" ")) });
    if (list) nodes.push({ kind: "list", items: list });
    para = [];
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      nodes.push({ kind: "heading", level: (h[1] ?? "").length, inline: parseInline(h[2] ?? "") });
    } else if (/^- /.test(line)) {
      if (para.length) {
        nodes.push({ kind: "paragraph", inline: parseInline(para.join(" ")) });
        para = [];
      }
      (list ??= []).push(parseInline(line.slice(2)));
    } else if (line.trim() === "") flush();
    else {
      if (list) {
        nodes.push({ kind: "list", items: list });
        list = null;
      }
      para.push(line.trim());
    }
  }
  flush();
  return nodes;
}
