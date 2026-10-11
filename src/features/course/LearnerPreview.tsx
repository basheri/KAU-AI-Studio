import { useId, useState, type ReactNode } from "react";
import { useLocale } from "@/features/i18n/LocaleProvider";
import type { MediaRecord } from "./api";
import {
  embedSrc,
  isHttpUrl,
  parseRichText,
  type Inline,
  type Lang,
  type PayloadMap,
} from "./blocks";
import type { Block, CourseTree } from "./tree";

const dirOf = (l: Lang | null) => (l === "ar" ? "rtl" : l === "en" ? "ltr" : undefined);
const safeMediaUrl = (u: string | undefined) => (u && /^https:\/\//.test(u) ? u : undefined);

function Inlines({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.bold ? (
          <strong key={i}>{p.text}</strong>
        ) : p.italic ? (
          <em key={i}>{p.text}</em>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** Renders the safe rich-text tree as React elements only; never injects HTML. */
export function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {parseRichText(text).map((n, i) => {
        if (n.kind === "heading") {
          const H = (n.level <= 3 ? "h3" : n.level === 4 ? "h4" : "h5") as "h3";
          return (
            <H key={i} className={n.level <= 3 ? "text-lg font-semibold" : "font-semibold"}>
              <Inlines parts={n.inline} />
            </H>
          );
        }
        if (n.kind === "list")
          return (
            <ul key={i} className="list-disc space-y-1 ps-6">
              {n.items.map((it, j) => (
                <li key={j}>
                  <Inlines parts={it} />
                </li>
              ))}
            </ul>
          );
        return (
          <p key={i}>
            <Inlines parts={n.inline} />
          </p>
        );
      })}
    </div>
  );
}

function KnowledgeCheck({ p }: { p: PayloadMap["knowledge_check"] }) {
  const { t } = useLocale();
  const name = useId();
  const [pick, setPick] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">{p.question}</legend>
      {p.choices.map((c, i) => (
        <label key={i} className="flex items-center gap-2">
          <input
            type="radio"
            name={name}
            checked={pick === i}
            onChange={() => (setPick(i), setChecked(false))}
          />
          {c}
        </label>
      ))}
      <button
        type="button"
        className="btn-primary"
        disabled={pick === null}
        onClick={() => setChecked(true)}
      >
        {t("cs.check")}
      </button>
      <p aria-live="polite" className="text-sm">
        {checked && pick !== null
          ? pick === p.correct_index
            ? p.feedback_correct
            : p.feedback_incorrect
          : ""}
      </p>
    </fieldset>
  );
}

function Scenario({ p }: { p: PayloadMap["scenario"] }) {
  const [pick, setPick] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      <p className="font-semibold">{p.prompt}</p>
      <div className="flex flex-wrap gap-2">
        {p.branches.map((b, i) => (
          <button
            key={i}
            type="button"
            className="chip-btn"
            aria-pressed={pick === i}
            onClick={() => setPick(i)}
          >
            {b.choice}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="text-sm">
        {pick !== null ? p.branches[pick]?.feedback : ""}
      </p>
    </div>
  );
}

export function PreviewBlock({ block, media }: { block: Block; media: MediaRecord[] }) {
  const { t } = useLocale();
  const p = block.payload as never as Record<string, unknown>;
  const m = media.find((x) => x.id === p["media_id"]);
  let body: ReactNode = null;
  switch (block.type) {
    case "rich_text":
      body = <RichText text={String(p["text"])} />;
      break;
    case "image": {
      const q = p as never as PayloadMap["image"];
      body = (
        <figure>
          {safeMediaUrl(m?.source_url) ? (
            <img
              src={safeMediaUrl(m?.source_url)}
              alt={q.decorative ? "" : q.alt}
              className="max-h-96 rounded-md"
            />
          ) : (
            <p className="notice notice-warn">{q.decorative ? m?.title : q.alt || m?.title}</p>
          )}
          {q.caption && (
            <figcaption className="mt-1 text-sm text-muted-foreground">{q.caption}</figcaption>
          )}
        </figure>
      );
      break;
    }
    case "audio": {
      const q = p as never as PayloadMap["audio"];
      body = (
        <div className="space-y-2">
          {safeMediaUrl(m?.source_url) && (
            <audio controls src={safeMediaUrl(m?.source_url)} aria-label={m?.title} />
          )}
          {q.transcript && (
            <details>
              <summary>{t("cs.transcript")}</summary>
              <p className="whitespace-pre-wrap">{q.transcript}</p>
            </details>
          )}
        </div>
      );
      break;
    }
    case "video": {
      const q = p as never as PayloadMap["video"];
      body = (
        <div className="space-y-2">
          {safeMediaUrl(m?.source_url) && (
            <video
              controls
              src={safeMediaUrl(m?.source_url)}
              aria-label={m?.title}
              className="w-full max-w-2xl rounded-md"
            >
              {safeMediaUrl(q.captions_url) && (
                <track
                  kind="captions"
                  src={safeMediaUrl(q.captions_url)}
                  srcLang={block.lang ?? "ar"}
                  default
                />
              )}
            </video>
          )}
          {q.transcript && (
            <details>
              <summary>{t("cs.transcript")}</summary>
              <p className="whitespace-pre-wrap">{q.transcript}</p>
            </details>
          )}
        </div>
      );
      break;
    }
    case "embed": {
      const q = p as never as PayloadMap["embed"];
      const src = embedSrc(q.url);
      body = src ? (
        <iframe
          src={src}
          title={q.title || "embed"}
          className="aspect-video w-full max-w-2xl rounded-md border border-border"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          referrerPolicy="no-referrer"
          loading="lazy"
          allowFullScreen
        />
      ) : (
        <p className="notice notice-warn">{t("cs.embedBlocked")}</p>
      );
      break;
    }
    case "knowledge_check":
      body = <KnowledgeCheck p={p as never} />;
      break;
    case "scenario":
      body = <Scenario p={p as never} />;
      break;
    case "rubric": {
      const r = p as never as PayloadMap["rubric"];
      body = (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{t("block.rubric")}</caption>
            <tbody>
              {r.criteria.map((c, i) => (
                <tr key={i} className="border-b border-border align-top">
                  <th scope="row" className="py-2 pe-3 text-start">
                    {c.name}
                  </th>
                  {c.levels.map((l, j) => (
                    <td key={j} className="py-2 pe-3">
                      <strong>
                        {l.label} ({l.points})
                      </strong>
                      <div>{l.description}</div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      break;
    }
    case "glossary": {
      const g = p as never as PayloadMap["glossary"];
      body = (
        <dl className="space-y-2">
          {g.terms.map((x, i) => (
            <div key={i}>
              <dt className="font-semibold">{x.term}</dt>
              <dd>{x.definition}</dd>
            </div>
          ))}
        </dl>
      );
      break;
    }
    case "references": {
      const r = p as never as PayloadMap["references"];
      body = (
        <ol className="list-decimal space-y-1 ps-6">
          {r.items.map((x, i) => (
            <li key={i}>
              {x.author} {x.year && `(${x.year})`}. <em>{x.title}</em>
              {x.publisher && `. ${x.publisher}`}
              {x.url && isHttpUrl(x.url) && (
                <>
                  {" "}
                  <a
                    href={x.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-link"
                    dir="ltr"
                  >
                    {x.url}
                  </a>
                </>
              )}
            </li>
          ))}
        </ol>
      );
      break;
    }
  }
  return (
    <section
      lang={block.lang ?? undefined}
      dir={dirOf(block.lang)}
      data-block-type={block.type}
      className="space-y-2"
    >
      {block.type !== "rich_text" && <h3 className="sr-only">{t(`block.${block.type}`)}</h3>}
      {body}
    </section>
  );
}

export function LearnerPreview({ tree, media }: { tree: CourseTree; media: MediaRecord[] }) {
  const { t } = useLocale();
  const lessons = tree.modules.flatMap((m) => m.lessons.map((l) => ({ m, l })));
  const [i, setI] = useState(0);
  const cur = lessons[Math.min(i, lessons.length - 1)];
  const courseTitle =
    tree.lang === "ar" ? tree.title_ar || tree.title_en : tree.title_en || tree.title_ar;
  return (
    <div
      className="grid gap-6 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]"
      data-testid="learner-preview"
    >
      <nav aria-label={t("cs.modules")} lang={tree.lang ?? undefined} dir={dirOf(tree.lang)}>
        <p className="mb-2 font-semibold">{courseTitle}</p>
        <ol className="space-y-3">
          {tree.modules.map((m) => (
            <li key={m.key} lang={m.lang ?? undefined} dir={dirOf(m.lang)}>
              <span className="text-sm text-muted-foreground">
                {m.lang === "ar" ? m.title_ar : m.title_en || m.title_ar}
              </span>
              <ol className="mt-1 space-y-1">
                {m.lessons.map((l) => {
                  const idx = lessons.findIndex((x) => x.l.key === l.key);
                  return (
                    <li key={l.key}>
                      <button
                        type="button"
                        className={idx === i ? "list-item list-item-active" : "list-item"}
                        aria-current={idx === i ? "page" : undefined}
                        onClick={() => setI(idx)}
                        lang={l.lang ?? undefined}
                        dir={dirOf(l.lang)}
                      >
                        {l.lang === "ar" ? l.title_ar : l.title_en || l.title_ar}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      </nav>
      {cur ? (
        <article
          className="min-w-0 space-y-6"
          lang={cur.l.lang ?? undefined}
          dir={dirOf(cur.l.lang)}
        >
          <h2 className="text-2xl font-semibold">
            {cur.l.lang === "ar" ? cur.l.title_ar : cur.l.title_en || cur.l.title_ar}
          </h2>
          {cur.l.blocks.length ? (
            cur.l.blocks.map((b) => <PreviewBlock key={b.key} block={b} media={media} />)
          ) : (
            <p className="text-muted-foreground">{t("cs.noBlocks")}</p>
          )}
          <nav aria-label={t("cs.lessonNav")} className="flex justify-between gap-2">
            <button
              type="button"
              className="btn-link"
              disabled={i <= 0}
              onClick={() => setI(i - 1)}
            >
              {t("cs.prevLesson")}
            </button>
            <button
              type="button"
              className="btn-link"
              disabled={i >= lessons.length - 1}
              onClick={() => setI(i + 1)}
            >
              {t("cs.nextLesson")}
            </button>
          </nav>
        </article>
      ) : (
        <p className="text-muted-foreground">{t("cs.noLesson")}</p>
      )}
    </div>
  );
}
