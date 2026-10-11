import { strToU8, zipSync } from "fflate";

// Minimal, dependency-free Word (.docx) writer for exports: headings, paragraphs, bullet lists and tables,
// right-to-left for Arabic, an optional header line (the preview watermark) and a footer line (export reference).

export type DocLang = "ar" | "en";
export type DocBlock =
  | { t: "h"; level: 1 | 2 | 3; text: string }
  | { t: "p"; text: string; bold?: boolean; muted?: boolean }
  | { t: "ul"; items: string[] }
  | { t: "table"; head: string[]; rows: string[][] };
export interface DocSpec {
  lang: DocLang;
  title: string;
  blocks: DocBlock[];
  /** Shown at the top of every page (used for "preview — not approved"). */
  header?: string | undefined;
  /** Shown at the bottom of every page. */
  footer: string;
}

// Characters XML 1.0 forbids are dropped; the rest is escaped.
// eslint-disable-next-line no-control-regex
const INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
export const xml = (s: string) =>
  s
    .replace(INVALID, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const FONT = "Arial";

type RunOpts = {
  bold?: boolean | undefined;
  color?: string | undefined;
  size?: number | undefined;
};

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function run(text: string, lang: DocLang, o: RunOpts = {}) {
  // Text with no Arabic letters (a citation, a code) runs left to right even inside an Arabic paragraph,
  // so its punctuation stays where the author put it.
  const rtl = lang === "ar" && ARABIC.test(text);
  const props = [
    `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>`,
    o.bold ? "<w:b/><w:bCs/>" : "",
    o.color ? `<w:color w:val="${o.color}"/>` : "",
    o.size ? `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>` : "",
    rtl ? "<w:rtl/>" : "",
    `<w:lang w:val="en-US" w:bidi="ar-SA"/>`,
  ].join("");
  // Line breaks inside a value become Word breaks.
  const parts = text.split("\n").map((p) => `<w:t xml:space="preserve">${xml(p)}</w:t>`);
  return `<w:r><w:rPr>${props}</w:rPr>${parts.join("<w:br/>")}</w:r>`;
}

function para(
  text: string,
  lang: DocLang,
  o: RunOpts & { style?: string; bullet?: boolean; center?: boolean } = {},
) {
  const rtl = lang === "ar";
  const pPr = [
    o.style ? `<w:pStyle w:val="${o.style}"/>` : "",
    o.bullet ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>` : "",
    rtl ? "<w:bidi/>" : "",
    o.center ? `<w:jc w:val="center"/>` : "",
  ].join("");
  return `<w:p><w:pPr>${pPr}</w:pPr>${text ? run(text, lang, o) : ""}</w:p>`;
}

function table(head: string[], rows: string[][], lang: DocLang) {
  const cols = Math.max(head.length, ...rows.map((r) => r.length), 1);
  const width = Math.floor(9000 / cols);
  const cell = (text: string, isHead: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${
      isHead ? `<w:shd w:val="clear" w:color="auto" w:fill="E7EEF0"/>` : ""
    }</w:tcPr>${para(text, lang, { bold: isHead, size: 20 })}</w:tc>`;
  const row = (r: string[], isHead: boolean) =>
    `<w:tr>${isHead ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${Array.from(
      { length: cols },
      (_, i) => cell(r[i] ?? "", isHead),
    ).join("")}</w:tr>`;
  const border = `w:val="single" w:sz="4" w:space="0" w:color="9AA5AB"`;
  return `<w:tbl><w:tblPr>${lang === "ar" ? "<w:bidiVisual/>" : ""}<w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top ${border}/><w:left ${border}/><w:bottom ${border}/><w:right ${border}/><w:insideH ${border}/><w:insideV ${border}/></w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${Array.from(
    { length: cols },
    () => `<w:gridCol w:w="${width}"/>`,
  ).join(
    "",
  )}</w:tblGrid>${head.length ? row(head, true) : ""}${rows.map((r) => row(r, false)).join("")}</w:tbl>${para("", lang)}`;
}

function body(doc: DocSpec) {
  const out: string[] = [para(doc.title, doc.lang, { style: "Title" })];
  for (const b of doc.blocks) {
    if (b.t === "h") out.push(para(b.text, doc.lang, { style: `Heading${b.level}` }));
    else if (b.t === "p")
      out.push(para(b.text, doc.lang, { bold: b.bold, color: b.muted ? "5B6770" : undefined }));
    else if (b.t === "ul")
      for (const item of b.items) out.push(para(item, doc.lang, { bullet: true }));
    else out.push(table(b.head, b.rows, doc.lang));
  }
  return out.join("");
}

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

export function documentXml(doc: DocSpec) {
  const sect = `<w:sectPr>${doc.header ? `<w:headerReference w:type="default" r:id="rIdHeader"/>` : ""}<w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1300" w:right="1200" w:bottom="1300" w:left="1200" w:header="600" w:footer="600" w:gutter="0"/>${
    doc.lang === "ar" ? "<w:bidi/>" : ""
  }</w:sectPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body(doc)}${sect}</w:body></w:document>`;
}

const stylesXml = (lang: DocLang) => {
  const h = (id: string, name: string, size: number, color: string) =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/>${
      lang === "ar" ? "<w:bidi/>" : ""
    }</w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${h(
    "Title",
    "Title",
    36,
    "0B4F5C",
  )}${h("Heading1", "heading 1", 30, "0B4F5C")}${h("Heading2", "heading 2", 26, "1F2A30")}${h(
    "Heading3",
    "heading 3",
    23,
    "1F2A30",
  )}</w:styles>`;
};

const numberingXml = (lang: DocLang) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="${
    lang === "ar" ? "right" : "left"
  }"/><w:pPr><w:ind w:${lang === "ar" ? "right" : "left"}="540" w:hanging="270"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

const hdrFtr = (tag: "hdr" | "ftr", text: string, lang: DocLang, color: string, bold: boolean) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${tag} ${NS}>${para(text, lang, {
    color,
    bold,
    size: tag === "hdr" ? 22 : 16,
    center: true,
  })}</w:${tag}>`;

/** Builds a .docx file. `created` fixes the document date (and the zip timestamps) for reproducible output. */
export function buildDocx(doc: DocSpec, created = new Date()): Uint8Array {
  const rels = [
    `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    `<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>`,
    `<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`,
    doc.header
      ? `<Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>`
      : "",
  ].join("");
  const iso = created.toISOString().replace(/\.\d{3}Z$/, "Z");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>${
        doc.header
          ? `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>`
          : ""
      }<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    ),
    "docProps/core.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(
        doc.title,
      )}</dc:title><dc:creator>KAU AI Program Studio</dc:creator><dc:language>${
        doc.lang === "ar" ? "ar-SA" : "en-US"
      }</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created></cp:coreProperties>`,
    ),
    "word/_rels/document.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`,
    ),
    "word/document.xml": strToU8(documentXml(doc)),
    "word/styles.xml": strToU8(stylesXml(doc.lang)),
    "word/numbering.xml": strToU8(numberingXml(doc.lang)),
    "word/footer1.xml": strToU8(hdrFtr("ftr", doc.footer, doc.lang, "5B6770", false)),
  };
  if (doc.header)
    files["word/header1.xml"] = strToU8(hdrFtr("hdr", doc.header, doc.lang, "B42318", true));
  return zipSync(files, { level: 6, mtime: created });
}
