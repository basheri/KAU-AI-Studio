// Deep-link focus carried in the address (?project=&artifact=&tab=&item=). Values are validated
// before use; anything malformed is ignored, never trusted.

export type FocusTab = "sources" | "rules" | "run" | "findings";
export interface Focus {
  project?: string;
  artifact?: string;
  tab?: FocusTab;
  item?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABS: FocusTab[] = ["sources", "rules", "run", "findings"];

export function parseFocus(search: Record<string, unknown>): Focus {
  const out: Focus = {};
  const id = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : undefined);
  const project = id(search["project"]);
  const artifact = id(search["artifact"]);
  const item = id(search["item"]);
  if (project) out.project = project;
  if (artifact) out.artifact = artifact;
  if (item) out.item = item;
  if (TABS.includes(search["tab"] as FocusTab)) out.tab = search["tab"] as FocusTab;
  return out;
}
