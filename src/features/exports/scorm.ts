import { strToU8, zipSync } from "fflate";
import { translate, type MessageKey } from "@/features/i18n/locale";
import {
  embedSrc,
  isHttpUrl,
  parseRichText,
  type Inline,
  type PayloadMap,
} from "@/features/course/blocks";
import type { Block, CourseTree, MediaInfo } from "@/features/course/tree";
import type { DocLang } from "./docx";
import { pick } from "./documents";

// SCORM 1.2 package (one SCO) for Blackboard and other LMSs. Every piece of course text is escaped;
// the only script is the static player below. Embeds appear only for approved hosts, sandboxed.

export interface ScormMeta {
  exportId: string;
  official: boolean;
  lang: DocLang;
  createdAt: Date;
  versionNumber: number;
  courseCode: string;
}

export const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const attrUrl = (u: string) => (isHttpUrl(u) && u.startsWith("https://") ? esc(u) : "");
const tr = (lang: DocLang) => (key: string) => translate(lang, key as MessageKey);
const dirOf = (lang: DocLang) => (lang === "ar" ? "rtl" : "ltr");

const inline = (xs: Inline[]) =>
  xs
    .map((x) =>
      x.bold
        ? `<strong>${esc(x.text)}</strong>`
        : x.italic
          ? `<em>${esc(x.text)}</em>`
          : esc(x.text),
    )
    .join("");

function richText(text: string) {
  return parseRichText(text)
    .map((n) =>
      n.kind === "heading"
        ? `<h${Math.min(6, Math.max(3, n.level))}>${inline(n.inline)}</h${Math.min(6, Math.max(3, n.level))}>`
        : n.kind === "list"
          ? `<ul>${n.items.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`
          : `<p>${inline(n.inline)}</p>`,
    )
    .join("");
}

function block(b: Block, media: Map<string, MediaInfo>, t: (k: string) => string, id: string) {
  const transcript = (s: string) =>
    s.trim()
      ? `<details><summary>${esc(t("ex.sc.transcript"))}</summary><p>${esc(s)}</p></details>`
      : "";
  switch (b.type) {
    case "rich_text":
      return richText((b.payload as PayloadMap["rich_text"]).text);
    case "image": {
      const p = b.payload as PayloadMap["image"];
      const src = p.media_id ? attrUrl(media.get(p.media_id)?.source_url ?? "") : "";
      if (!src) return "";
      return `<figure><img src="${src}" alt="${p.decorative ? "" : esc(p.alt)}" loading="lazy">${
        p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ""
      }</figure>`;
    }
    case "audio": {
      const p = b.payload as PayloadMap["audio"];
      const src = p.media_id ? attrUrl(media.get(p.media_id)?.source_url ?? "") : "";
      return `${src ? `<audio controls preload="none" src="${src}"></audio>` : ""}${transcript(p.transcript)}`;
    }
    case "video": {
      const p = b.payload as PayloadMap["video"];
      const src = p.media_id ? attrUrl(media.get(p.media_id)?.source_url ?? "") : "";
      const cap = attrUrl(p.captions_url);
      return `${
        src
          ? `<video controls preload="none" src="${src}">${cap ? `<track kind="captions" src="${cap}" default>` : ""}</video>`
          : ""
      }${transcript(p.transcript)}`;
    }
    case "embed": {
      const p = b.payload as PayloadMap["embed"];
      const src = embedSrc(p.url);
      return src
        ? `<div class="embed"><iframe src="${esc(src)}" title="${esc(p.title)}" sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen" loading="lazy"></iframe></div>`
        : "";
    }
    case "knowledge_check": {
      const p = b.payload as PayloadMap["knowledge_check"];
      return `<fieldset class="kc" data-correct="${p.correct_index ?? -1}" data-ok="${esc(
        p.feedback_correct || t("ex.sc.correct"),
      )}" data-no="${esc(p.feedback_incorrect || t("ex.sc.incorrect"))}"><legend>${esc(p.question)}</legend>${p.choices
        .map((c, i) => `<label><input type="radio" name="${id}" value="${i}"> ${esc(c)}</label>`)
        .join(
          "",
        )}<button type="button" class="kc-check">${esc(t("ex.sc.check"))}</button><p class="kc-feedback" role="status"></p></fieldset>`;
    }
    case "scenario": {
      const p = b.payload as PayloadMap["scenario"];
      return `<div class="scenario"><p>${esc(p.prompt)}</p>${p.branches
        .map(
          (x) => `<details><summary>${esc(x.choice)}</summary><p>${esc(x.feedback)}</p></details>`,
        )
        .join("")}</div>`;
    }
    case "rubric": {
      const p = b.payload as PayloadMap["rubric"];
      return `<table class="rubric"><thead><tr><th>${esc(t("ex.sc.criterion"))}</th><th>${esc(
        t("ex.sc.levels"),
      )}</th></tr></thead><tbody>${p.criteria
        .map(
          (c) =>
            `<tr><th scope="row">${esc(c.name)}</th><td><ul>${c.levels
              .map(
                (l) =>
                  `<li><strong>${esc(l.label)} (${l.points})</strong>: ${esc(l.description)}</li>`,
              )
              .join("")}</ul></td></tr>`,
        )
        .join("")}</tbody></table>`;
    }
    case "glossary": {
      const p = b.payload as PayloadMap["glossary"];
      return `<h3>${esc(t("ex.sc.glossary"))}</h3><dl>${p.terms
        .map((x) => `<dt>${esc(x.term)}</dt><dd>${esc(x.definition)}</dd>`)
        .join("")}</dl>`;
    }
    case "references": {
      const p = b.payload as PayloadMap["references"];
      return `<h3>${esc(t("ex.sc.references"))}</h3><ul>${p.items
        .map((r) => {
          const text = [r.author, r.year && `(${r.year})`, r.title, r.publisher]
            .filter(Boolean)
            .join(". ");
          const url = attrUrl(r.url);
          return `<li>${esc(text)}${url ? ` <a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>` : ""}</li>`;
        })
        .join("")}</ul>`;
    }
    default:
      return "";
  }
}

export function scormHtml(tree: CourseTree, media: Map<string, MediaInfo>, meta: ScormMeta) {
  const { lang } = meta;
  const t = tr(lang);
  const title = pick(lang, tree.title_ar, tree.title_en) || meta.courseCode;
  const lessons = tree.modules.flatMap((m) =>
    m.lessons.map((l) => ({ module: pick(lang, m.title_ar, m.title_en), lesson: l })),
  );
  const total = lessons.length;
  const sections = lessons
    .map(({ module, lesson }, i) => {
      const blocks = lesson.blocks
        .map((b, j) => {
          const html = block(b, media, t, `q${i}-${j}`);
          if (!html) return "";
          const own = b.lang && b.lang !== lang ? ` lang="${b.lang}" dir="${dirOf(b.lang)}"` : "";
          return `<div class="block block-${b.type}"${own}>${html}</div>`;
        })
        .join("");
      return `<section class="lesson" data-index="${i}"${i ? " hidden" : ""} aria-labelledby="l${i}"><p class="crumb">${esc(
        module,
      )} · ${esc(t("ex.sc.lesson"))} ${i + 1} / ${total}</p><h2 id="l${i}" tabindex="-1">${esc(
        pick(lang, lesson.title_ar, lesson.title_en),
      )}</h2>${blocks}</section>`;
    })
    .join("");
  const banner = meta.official
    ? ""
    : `<p class="preview-banner" role="note">${esc(t("ex.doc.previewBanner"))}</p>`;
  return `<!doctype html>
<html lang="${lang}" dir="${dirOf(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
${banner}<header><h1>${esc(title)}</h1></header>
<main>${sections || `<p>${esc(t("ex.sc.empty"))}</p>`}
<section class="lesson done" data-index="${total}" hidden aria-labelledby="ld"><h2 id="ld" tabindex="-1">${esc(
    t("ex.sc.complete"),
  )}</h2></section>
</main>
<nav class="pager"><button type="button" id="prev">${esc(t("ex.sc.prev"))}</button><button type="button" id="next">${esc(
    t("ex.sc.next"),
  )}</button></nav>
<footer>${esc(t("ex.doc.ref"))} ${esc(meta.exportId)} · ${esc(t("ex.doc.version"))} ${meta.versionNumber}</footer>
<script src="scorm.js"></script>
</body>
</html>`;
}

export const SCORM_CSS = `:root{--ink:#1f2a30;--muted:#5b6770;--accent:#0b4f5c;--line:#d5dde1;--bg:#fff}
*{box-sizing:border-box}body{margin:0;font:16px/1.7 "Segoe UI",Tahoma,Arial,sans-serif;color:var(--ink);background:var(--bg)}
header,main,nav,footer{max-width:46rem;margin-inline:auto;padding-inline:1rem}
h1{color:var(--accent);font-size:1.6rem}h2{font-size:1.35rem}.crumb,footer{color:var(--muted);font-size:.85rem}
.block{margin-block:1rem}img,video,audio{max-width:100%}figure{margin:0}figcaption{color:var(--muted);font-size:.9rem}
.embed{position:relative;padding-top:56.25%}.embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
fieldset.kc{border:1px solid var(--line);border-radius:.5rem;padding:1rem}fieldset.kc label{display:block;margin-block:.25rem}
button{font:inherit;padding:.5rem 1rem;border-radius:.4rem;border:1px solid var(--accent);background:var(--accent);color:#fff;cursor:pointer}
button:disabled{opacity:.4;cursor:default}.kc-check{margin-top:.5rem}.pager{display:flex;justify-content:space-between;padding-block:1.5rem}
table{border-collapse:collapse;width:100%}th,td{border:1px solid var(--line);padding:.5rem;text-align:start;vertical-align:top}
details{border:1px solid var(--line);border-radius:.4rem;padding:.5rem;margin-block:.4rem}
.preview-banner{margin:0;padding:.6rem 1rem;background:#fde8e7;color:#b42318;font-weight:700;text-align:center}
:focus-visible{outline:3px solid #f2b705;outline-offset:2px}`;

// Static player: navigation, knowledge-check feedback and SCORM 1.2 progress (resume and completion).
export const SCORM_JS = `(function(){
function findApi(w){for(var i=0;w&&i<10;i++){if(w.API)return w.API;if(w.parent===w)break;w=w.parent;}return null;}
var api=findApi(window)||(window.opener?findApi(window.opener):null);var started=false;
if(api){try{var r=api.LMSInitialize("");started=r==="true"||r===true;if(!started)api=null;}catch(e){api=null;}}
function set(k,v){if(api){try{api.LMSSetValue(k,v);api.LMSCommit("");}catch(e){}}}
function get(k){if(!api)return"";try{return String(api.LMSGetValue(k)||"");}catch(e){return"";}}
var pages=[].slice.call(document.querySelectorAll("section.lesson"));var last=pages.length-1;
var prev=document.getElementById("prev"),next=document.getElementById("next");
var at=parseInt(get("cmi.core.lesson_location"),10);if(isNaN(at)||at<0||at>last)at=0;
function show(i,focus){pages.forEach(function(p,j){p.hidden=j!==i;});at=i;prev.disabled=i===0;next.disabled=i===last;
set("cmi.core.lesson_location",String(i));
if(i===last){set("cmi.core.lesson_status","completed");}else if(get("cmi.core.lesson_status")!=="completed"){set("cmi.core.lesson_status","incomplete");}
if(focus){var h=pages[i].querySelector("h2");if(h)h.focus();}}
prev.addEventListener("click",function(){if(at>0)show(at-1,true);});
next.addEventListener("click",function(){if(at<last)show(at+1,true);});
[].forEach.call(document.querySelectorAll("fieldset.kc"),function(f){
f.querySelector(".kc-check").addEventListener("click",function(){var c=f.querySelector("input:checked");var out=f.querySelector(".kc-feedback");
if(!c){return;}out.textContent=String(c.value)===f.getAttribute("data-correct")?f.getAttribute("data-ok"):f.getAttribute("data-no");});});
show(at,false);
window.addEventListener("pagehide",function(){if(api&&started){try{api.LMSFinish("");}catch(e){}api=null;}});
})();`;

export function scormManifest(title: string, meta: ScormMeta) {
  const x = (s: string) => esc(s);
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="KAU-${meta.exportId}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>${x(title)}</title>
      <item identifier="ITEM-1" identifierref="RES-1" isvisible="true"><title>${x(title)}</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html"/><file href="scorm.js"/><file href="style.css"/>
    </resource>
  </resources>
</manifest>`;
}

export function buildScorm(
  tree: CourseTree,
  media: Map<string, MediaInfo>,
  meta: ScormMeta,
): Uint8Array {
  const title =
    (meta.official ? "" : `[${translate(meta.lang, "ex.sc.previewTag" as MessageKey)}] `) +
    (pick(meta.lang, tree.title_ar, tree.title_en) || meta.courseCode);
  return zipSync(
    {
      "imsmanifest.xml": strToU8(scormManifest(title, meta)),
      "index.html": strToU8(scormHtml(tree, media, meta)),
      "style.css": strToU8(SCORM_CSS),
      "scorm.js": strToU8(SCORM_JS),
    },
    { level: 6, mtime: meta.createdAt },
  );
}
