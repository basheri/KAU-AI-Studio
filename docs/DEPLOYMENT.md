# Deployment — running KAU AI Program Studio without Lovable

The application is vendor-neutral: a Node web server (built with TanStack Start) and a Supabase backend
(PostgreSQL + Auth + Storage). Everything the database needs is in `drizzle/migrations/`.

## 0. Decide where it runs (data residency)
| Option | Use for | Notes |
|---|---|---|
| **A. Self-hosted Supabase** (official Docker setup) in the university data centre or a Saudi cloud region | **Production** | Data stays under university control; IT runs backups and updates |
| B. Supabase Cloud project (university-owned account) | Pilot with test data only, unless its region is approved | Check the region against the PDPL / data-governance decision |

The web server runs anywhere that runs a container (same location as the database is simplest).

## 1. Create the backend
1. Create the Supabase instance (option A or B above).
2. Note four values:
   - **Project URL**
   - **anon / publishable key**
   - **service-role key** (secret)
   - **database connection string** for the `postgres` user (secret)

## 2. Create the database structure
On any machine with `psql` and this repository:
```bash
DATABASE_URL='postgresql://postgres:PASSWORD@DB-HOST:5432/postgres' bun run db:migrate
```
- **Expected result:** `Done: 13 applied` (0000 to 0012).
- **Running it again** is safe; the result is `0 applied`.
- **`bun run db:status`** shows what has been applied.
- **Never edit a migration that has been applied.** Add a new numbered file instead; the script refuses changed files.

## 3. Configure sign-in (Supabase Auth)
1. **Authentication → Providers → Email:** enabled, with email confirmation on. Sign-in uses a one-time **code**.
2. **Email template ("Magic link" / OTP):** include `{{ .Token }}` so the email shows the code.
3. **SMTP:** set the university sender address and mail server. Without it, codes are not delivered reliably.
4. **URL configuration:** set **Site URL** to the production address (for example `https://studio.kau.edu.sa`).
5. **KAU-only addresses:** no action needed; a database trigger rejects non-`@kau.edu.sa` addresses.

## 4. Make the first platform administrator
1. Sign in once with the administrator's KAU email.
2. In the SQL editor (as `postgres`), run:
```sql
INSERT INTO public.platform_admins (user_id, note)
SELECT id, 'First platform administrator' FROM auth.users WHERE email = 'name@kau.edu.sa';
```

## 5. Build and run the web server
```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://YOUR-SUPABASE-HOST \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=YOUR-ANON-KEY \
  -t kau-studio .
docker run -d --name kau-studio -p 3000:3000 --env-file server.env --restart unless-stopped kau-studio
```
- **`server.env`** holds the server-only values listed in `.env.example`: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `AI_ENABLED` / `ANTHROPIC_API_KEY`.
- **Keep `server.env` secret.** Store it in the server's secret store, never in Git.
- **HTTPS:** put the university reverse proxy or load balancer in front of port 3000.
- **Without Docker:** run `bun install && bun run build && bun run start`, which needs Node 22.

## 6. Check the installation
1. Open the site and sign in with a KAU email. The code should arrive within a minute.
2. Create a project, invite a second person, and create a brief.
3. Upload a small PDF as a source; this checks the storage bucket.
4. Run the database tests against the new backend (they use throwaway users and clean up after themselves):
```bash
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... SUPABASE_SERVICE_ROLE_KEY=... bun run test:db
```

## 7. Data held in Lovable Cloud
- **Pilot or test data only (expected): start fresh.** Nothing needs to be moved.
- **Data that must be kept:**
  1. Export the database, and the files in the `project-sources` bucket, from Lovable Cloud. Lovable must provide the database dump or a direct connection.
  2. Restore the dump into the new database.
  3. Run `bun run db:migrate -- --baseline 0011`, so migrations already contained in the copy are recorded rather than re-run.
  4. Run `bun run db:migrate` to add `0012`.
  5. Copy the bucket files to the same paths.

## 8. Disconnect Lovable (after step 6 passes)
1. In Lovable, open the project's GitHub settings and disconnect the repository. Code stops syncing both ways.
2. Keep the Lovable project, read-only, until the new system has run for one full review cycle; then delete it.
3. Rotate any key that was ever stored in Lovable. Do this for AI provider keys especially.

## Operations
- **Backups:** daily database backups plus storage bucket backups, with a restore test each term.
- **Updates:** for each release, `git pull` → `bun run db:migrate` → rebuild and restart the container.
- **Logs:** the container writes to standard output; send it to the university log system.
