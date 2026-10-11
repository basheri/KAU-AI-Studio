import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { docxToText } from "@/features/intake/docx";
import { parseProposalText } from "@/features/intake/brief";

const docx = (body: string) =>
  zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(
      `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${body}</w:body></w:document>`,
    ),
  });
const p = (...runs: string[]) =>
  `<w:p>${runs.map((r) => `<w:r><w:t xml:space="preserve">${r}</w:t></w:r>`).join("")}</w:p>`;

describe("DOCX text extraction", () => {
  it("reads paragraphs, runs, tabs, breaks and entities in order", () => {
    const text = docxToText(
      docx(
        p("Title: ", "Data Science") +
          `<w:p><w:r><w:t>Rationale:</w:t><w:tab/><w:t>Growing &amp; urgent</w:t><w:br/><w:t>demand</w:t></w:r></w:p>` +
          p("العنوان: علم البيانات"),
      ),
    );
    expect(text).toBe(
      "Title: Data Science\nRationale:\tGrowing & urgent\ndemand\nالعنوان: علم البيانات",
    );
    expect(parseProposalText(text)).toMatchObject({
      title: "علم البيانات",
      rationale: "Growing & urgent",
    });
  });

  it("rejects files that are not Word documents", () => {
    expect(() => docxToText(new Uint8Array([1, 2, 3]))).toThrow(/not a readable Word document/);
    expect(() => docxToText(zipSync({ "a.txt": strToU8("x") }))).toThrow(
      /not a readable Word document/,
    );
  });
});
