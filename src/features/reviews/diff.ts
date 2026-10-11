export type DiffLine = { type: "same" | "added" | "removed"; text: string };

/** Line-level LCS diff; removed lines are listed before added ones at each change. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  const at = (i: number, j: number) => lcs[i * w + j] ?? 0;
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i * w + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const x = a[i] ?? "";
    const y = b[j] ?? "";
    if (x === y) {
      out.push({ type: "same", text: x });
      i++;
      j++;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      out.push({ type: "removed", text: x });
      i++;
    } else {
      out.push({ type: "added", text: y });
      j++;
    }
  }
  for (; i < n; i++) out.push({ type: "removed", text: a[i] ?? "" });
  for (; j < m; j++) out.push({ type: "added", text: b[j] ?? "" });
  return out;
}
