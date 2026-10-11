import type { MessageKey } from "@/features/i18n/locale";

// Turns database refusals (English, technical) into plain Arabic/English sentences for people.
// Unknown messages are shown as they are rather than hidden behind a generic "refused".

const RULES: [RegExp, MessageKey][] = [
  [/cannot decide a review you requested|another member must decide/i, "err.selfDecision"],
  [/role cannot decide at this stage/i, "err.roleCannotDecide"],
  [/^Observers cannot|Observers cannot use/i, "err.observer"],
  [/Not a project member|Not a contributing member/i, "err.notMember"],
  [/comment is required for this decision/i, "err.commentRequired"],
  [/Another version of this artifact is already in review/i, "err.otherInReview"],
  [/Only draft versions can be submitted/i, "err.onlyDraft"],
  [/draft version already exists/i, "err.draftExists"],
  [/Version is locked/i, "err.locked"],
  [/Confirm the brief assumptions/i, "err.assumptions"],
  [/Add architecture elements before review/i, "err.noElements"],
  [/Resolve alignment defects/i, "err.alignment"],
  [/critical content validation defects/i, "err.contentDefects"],
  [/compliance blocker findings/i, "err.blockers"],
  [/AI-drafted brief fields/i, "err.aiPending"],
  [/Verify every course reference/i, "err.references"],
  [/exception has not been approved/i, "err.exceptionNotApproved"],
  [/Close open reviews before changing the workflow/i, "err.closeReviews"],
  [/today's AI limit/i, "err.aiLimit"],
  [/AI assistance is turned off/i, "err.aiOff"],
  [/Official exports need an approved version/i, "err.exportApproved"],
  [/A newer version replaced this one/i, "err.exportReplaced"],
  [/Observers can export approved versions only/i, "err.exportObserver"],
  [/This format does not fit this item/i, "err.exportFormat"],
];

export function errorMessage(e: unknown): string {
  return e && typeof e === "object" && "message" in e
    ? String((e as { message: unknown }).message ?? "")
    : "";
}

export function friendlyErrorKey(e: unknown): MessageKey | null {
  const m = errorMessage(e);
  return RULES.find(([re]) => re.test(m))?.[1] ?? null;
}

export function friendlyError(e: unknown, t: (k: MessageKey) => string): string {
  const key = friendlyErrorKey(e);
  if (key) return t(key);
  return errorMessage(e) || t("rv.failed");
}
