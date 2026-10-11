import { strFromU8, unzipSync } from "fflate";

// Deterministic, key-free DOCX reader: unzips word/document.xml and keeps paragraph text only.
// Runs on the server (no DOM, no Node-only APIs) so it works in the edge runtime.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#"
      ? String.fromCodePoint(
          e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10),
        )
      : (ENTITIES[e] ?? m),
  );

export function docxToText(bytes: Uint8Array): string {
  let xml: string;
  try {
    const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
    const doc = files["word/document.xml"];
    if (!doc) throw new Error("missing body");
    xml = strFromU8(doc);
  } catch {
    throw new Error("The file is not a readable Word document");
  }
  const paragraphs = xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? [];
  return paragraphs
    .map((para) =>
      (para.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>|<w:tab\/>|<w:br\/>/g) ?? [])
        .map((tok) =>
          tok === "<w:tab/>"
            ? "\t"
            : tok === "<w:br/>"
              ? "\n"
              : decode(tok.replace(/<[^>]+>/g, "")),
        )
        .join(""),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
