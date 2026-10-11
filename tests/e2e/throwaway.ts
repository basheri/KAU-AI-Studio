/** Creates or removes a throwaway KAU user + project for browser E2E. Usage: bun tests/e2e/throwaway.ts create|cleanup <file> */
import { createClient } from "@supabase/supabase-js";
const url = process.env.SUPABASE_URL!,
  anon = process.env.SUPABASE_PUBLISHABLE_KEY!,
  svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const mk = (key: string) =>
  createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (i, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(i, { ...init, headers: h });
      },
    },
  });
const admin = mk(svc);
const [cmd, file] = process.argv.slice(2);
if (cmd === "create") {
  const email = `e2e-${Date.now()}@kau.edu.sa`,
    password = `E2e-${crypto.randomUUID()}`;
  const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (u.error) throw u.error;
  const c = mk(anon);
  const s = await c.auth.signInWithPassword({ email, password });
  const p = await c.rpc("create_project", { _title: "E2E Program Studio", _description: null });
  await Bun.write(
    file!,
    JSON.stringify({ uid: u.data.user!.id, projectId: p.data, session: s.data.session }),
  );
} else {
  const d = await Bun.file(file!).json();
  const files = await admin
    .from("source_files")
    .select("storage_path")
    .eq("project_id", d.projectId);
  if (files.data?.length)
    await admin.storage.from("project-sources").remove(files.data.map((f) => f.storage_path));
  await admin.from("projects").delete().eq("id", d.projectId);
  await admin.auth.admin.deleteUser(d.uid);
  await Bun.write(file!, "{}");
  console.log("cleaned");
}
